import type {
  CustomLayerInterface,
  CustomRenderMethodInput,
  SkySpecification,
} from "maplibre-gl";

/** Only public MapLibre methods; map creation and camera state belong to the app. */
export interface GlobeAtmosphereMap {
  on(type: "style.load" | "remove", listener: () => void): unknown;
  off(type: "style.load" | "remove", listener: () => void): unknown;
  isStyleLoaded(): boolean | void;
  getLayersOrder(): string[];
  getLayer(id: string): { type?: string } | undefined;
  addLayer(layer: CustomLayerInterface, beforeId?: string): unknown;
  removeLayer(id: string): unknown;
  getSky(): SkySpecification | undefined;
  setSky(sky: SkySpecification): unknown;
}

export const GLOBE_ATMOSPHERE_LAYER_ID = "speleodb-globe-atmosphere";

// Three vertices cover the viewport. Inverting the public projection here (not
// per fragment) gives the actual view-space globe and camera rays, including
// asymmetric camera padding, pitch, bearing, resize and device pixel ratio.
const vertexSource = `#version 300 es
precision highp float;
uniform mat4 u_projection;
uniform mat4 u_globe;
out vec3 v_ray;
flat out vec3 v_center;
flat out float v_radius;
void main() {
    vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2)) * 2.0 - 1.0;
    mat4 inverseProjection = inverse(u_projection);
    mat4 globeToView = inverseProjection * u_globe;
    v_center = (globeToView * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    v_radius = length((globeToView * vec4(1.0, 0.0, 0.0, 0.0)).xyz);
    v_ray = (inverseProjection * vec4(pos, 1.0, 1.0)).xyz;
    gl_Position = vec4(pos, 0.0, 1.0);
}`;

// Appearance constants are intentionally shared by every consumer. Stars are
// deterministic, static and generated locally; neither textures nor timers are
// needed. Distances are in globe radii, so the halo scales naturally with Earth.
const fragmentSource = `#version 300 es
precision highp float;
uniform float u_opacity;
uniform float u_pixel_ratio;
in vec3 v_ray;
flat in vec3 v_center;
flat in float v_radius;
out vec4 fragColor;
float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
void main() {
    vec3 ray = normalize(v_ray);
    float impact = length(cross(v_center, ray)) / v_radius;
    float distanceToEdge = impact - 1.0;
    float pixelWidth = max(fwidth(impact), 0.00001);
    float outside = smoothstep(-pixelWidth, pixelWidth, distanceToEdge);
    if (dot(v_center, ray) < 0.0) outside = 1.0;

    vec2 pixel = gl_FragCoord.xy / u_pixel_ratio;
    vec2 cell = floor(pixel / 19.0);
    vec2 starCenter = vec2(hash(cell), hash(cell + 47.0));
    float starDistance = length(fract(pixel / 19.0) * 19.0 - (2.0 + starCenter * 15.0));
    float stars = (1.0 - smoothstep(0.0, 0.8, starDistance)) *
        step(0.64, hash(cell + 113.0)) * (0.09 + 0.22 * hash(cell + 71.0));
    vec3 space = vec3(18.0, 18.0, 24.0) / 255.0 + stars;

    float outer = 0.53 * exp(-max(distanceToEdge, 0.0) / 0.012) +
        0.12 * exp(-max(distanceToEdge, 0.0) / 0.038);
    float inner = 0.33 * exp(min(distanceToEdge, 0.0) / 0.10) +
        0.25 * exp(min(distanceToEdge, 0.0) / 0.008);
    vec3 atmosphere = vec3(0.88, 0.90, 1.0);
    vec3 outsideColor = mix(space, atmosphere, outer);
    float innerAlpha = inner * (1.0 - outside);
    float alpha = outside + innerAlpha;
    vec3 premultiplied = outsideColor * outside + atmosphere * innerAlpha;
    fragColor = vec4(premultiplied, alpha) * u_opacity;
}`;

function compileShader(
  gl: WebGL2RenderingContext,
  type: number,
  source: string,
): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("Unable to allocate globe atmosphere shader");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Unable to compile globe atmosphere shader: ${message}`);
  }
  return shader;
}

/** Native projection interpolation is authoritative; Mercator draws nothing. */
export function globeAtmosphereOpacity(transition: number): number {
  // The sphere silhouette is exact only at the globe end of the transition.
  // Fade early, before the interpolated map surface can cross the sphere rim.
  const fraction = Math.max(0, Math.min(1, (transition - 0.95) / 0.05));
  return fraction * fraction * (3 - 2 * fraction);
}

class GlobeAtmosphereLayer implements CustomLayerInterface {
  readonly id = GLOBE_ATMOSPHERE_LAYER_ID;
  readonly type = "custom" as const;
  readonly renderingMode = "2d" as const;
  private program: WebGLProgram | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private projection: WebGLUniformLocation | null = null;
  private globe: WebGLUniformLocation | null = null;
  private opacity: WebGLUniformLocation | null = null;
  private pixelRatio: WebGLUniformLocation | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private readonly projectionValues = new Float32Array(16);
  private readonly globeValues = new Float32Array(16);

  onAdd(_map: unknown, gl: WebGL2RenderingContext): void {
    let vertex: WebGLShader | undefined;
    let fragment: WebGLShader | undefined;
    try {
      vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
      fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
      this.program = gl.createProgram();
      this.vao = gl.createVertexArray();
      if (!this.program || !this.vao)
        throw new Error("Unable to allocate globe atmosphere GPU resources");
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(
          `Unable to link globe atmosphere: ${gl.getProgramInfoLog(this.program)}`,
        );
      this.projection = gl.getUniformLocation(this.program, "u_projection");
      this.globe = gl.getUniformLocation(this.program, "u_globe");
      this.opacity = gl.getUniformLocation(this.program, "u_opacity");
      this.pixelRatio = gl.getUniformLocation(this.program, "u_pixel_ratio");
      this.canvas = gl.canvas as HTMLCanvasElement;
    } catch (error) {
      this.onRemove(_map, gl);
      throw error;
    } finally {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }

  render(gl: WebGL2RenderingContext, input: CustomRenderMethodInput): void {
    const opacity = globeAtmosphereOpacity(
      input.defaultProjectionData.projectionTransition,
    );
    if (!opacity || !this.program || !this.vao) return;
    const previousVao = gl.getParameter(
      gl.VERTEX_ARRAY_BINDING,
    ) as WebGLVertexArrayObject | null;
    const previousProgram = gl.getParameter(
      gl.CURRENT_PROGRAM,
    ) as WebGLProgram | null;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.CULL_FACE);
    gl.enable(gl.BLEND);
    gl.blendEquation(gl.FUNC_ADD);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    this.projectionValues.set(input.projectionMatrix);
    this.globeValues.set(input.defaultProjectionData.mainMatrix);
    gl.uniformMatrix4fv(this.projection, false, this.projectionValues);
    gl.uniformMatrix4fv(this.globe, false, this.globeValues);
    gl.uniform1f(this.opacity, opacity);
    gl.uniform1f(
      this.pixelRatio,
      gl.drawingBufferWidth /
        (this.canvas?.clientWidth || gl.drawingBufferWidth),
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(previousVao);
    gl.useProgram(previousProgram);
    // MapLibre's public custom-layer contract resets its GL state after render.
  }

  onRemove(_map: unknown, gl: WebGL2RenderingContext): void {
    if (this.program) gl.deleteProgram(this.program);
    if (this.vao) gl.deleteVertexArray(this.vao);
    this.program = null;
    this.vao = null;
    this.canvas = null;
  }
}

/**
 * Attach once per map; dispose when its owner unmounts. Style replacement and
 * context restoration (MapLibre reloads the style) create fresh GPU resources.
 * No camera, sources, existing layer ordering, requests or repaint loop change.
 */
export function attachGlobeAtmosphere(
  map: GlobeAtmosphereMap,
  options: { beforeId?: string } = {},
): () => void {
  let disposed = false;
  let previousSky: SkySpecification = {};
  let installedSky = "";
  const install = (): void => {
    if (disposed || map.getLayer(GLOBE_ATMOSPHERE_LAYER_ID)) return;
    previousSky = map.getSky() ?? {};
    map.setSky({
      ...previousSky,
      "sky-color": "#121218",
      "horizon-color": "#121218",
      "atmosphere-blend": 0,
    });
    installedSky = JSON.stringify(map.getSky());
    const before =
      options.beforeId && map.getLayer(options.beforeId)
        ? options.beforeId
        : map
            .getLayersOrder()
            .find((id) => map.getLayer(id)?.type === "symbol");
    map.addLayer(new GlobeAtmosphereLayer(), before);
  };
  const detachListeners = (): void => {
    map.off("style.load", install);
    map.off("remove", removed);
    disposed = true;
  };
  const removed = (): void => {
    // MapLibre has already destroyed the style and called layer.onRemove.
    detachListeners();
  };
  map.on("style.load", install);
  map.on("remove", removed);
  if (map.isStyleLoaded()) install();
  return () => {
    if (disposed) return;
    detachListeners();
    if (map.getLayer(GLOBE_ATMOSPHERE_LAYER_ID)) {
      map.removeLayer(GLOBE_ATMOSPHERE_LAYER_ID);
      if (JSON.stringify(map.getSky()) === installedSky)
        map.setSky(previousSky);
    }
  };
}
