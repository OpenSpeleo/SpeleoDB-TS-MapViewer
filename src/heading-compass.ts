import {
  EXPLORATION_LEAD_MAX_HEADINGS,
  explorationLeadHeadings,
} from "@speleodb/map-core";

export interface HeadingCompassOptions {
  headings: readonly number[];
  readOnly?: boolean;
  onChange?: (headings: number[]) => void;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW_SIZE = 128;
const CENTER = VIEW_SIZE / 2;
const DIRECTIONS = ["N", "E", "S", "W"];
const DEFAULT_HEADINGS = [0, 90, 180, 270];
const ACCENT = "#818cf8";
const NEEDLE_COLOR = "#f87171";
let compassCount = 0;

/** A local draft control. Its owner saves changes and releases the mounted DOM. */
export function createHeadingCompass(
  container: HTMLElement,
  options: HeadingCompassOptions,
) {
  const document = container.ownerDocument;
  const id = `lead-compass-${++compassCount}`;
  let headings = explorationLeadHeadings(options.headings);
  let readOnly = options.readOnly ?? false;
  let selected = 0;
  let activePointerId: number | null = null;

  function element(name: string, attributes: Record<string, string | number>) {
    const result = document.createElementNS(SVG_NS, name);
    for (const [key, value] of Object.entries(attributes))
      result.setAttribute(key, String(value));
    return result;
  }

  function button(label: string, action: () => void) {
    const result = document.createElement("button");
    result.type = "button";
    result.textContent = label;
    result.style.cssText =
      "box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:5px;background:transparent;color:#cbd5e1;font:inherit;font-size:13px;line-height:1;padding:0 8px;height:32px;cursor:pointer;outline-offset:2px;outline-color:#818cf8";
    result.onclick = action;
    return result;
  }

  const root = document.createElement("div");
  root.style.cssText =
    "display:grid;justify-items:center;gap:8px;width:100%;color:#e2e8f0;font-size:14px";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Lead directions");
  const tabBar = document.createElement("div");
  tabBar.style.cssText =
    "display:grid;grid-template-columns:32px auto 32px;align-items:center;justify-content:center;column-gap:6px;height:36px";
  const tabs = document.createElement("div");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Lead directions");
  tabs.style.cssText =
    "box-sizing:border-box;grid-column:2;display:flex;align-items:stretch;gap:2px;height:36px;padding:1px;border:1px solid #475569;border-radius:7px;background:#0f172a";
  const panel = document.createElement("div");
  panel.id = `${id}-panel`;
  panel.style.cssText = "display:grid;justify-items:center;gap:4px;width:100%";
  const dial = document.createElement("div");
  dial.style.cssText =
    "position:relative;width:160px;height:160px;max-width:100%";
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${VIEW_SIZE} ${VIEW_SIZE}`);
  svg.setAttribute("aria-label", "Exploration lead compass");
  svg.style.cssText = "display:block;width:100%;height:100%;user-select:none";
  const definitions = element("defs", {});
  const faceGradient = element("radialGradient", {
    id: `${id}-face`,
    cx: "35%",
    cy: "25%",
    r: "80%",
  });
  faceGradient.append(
    element("stop", { offset: "0%", "stop-color": "#26364d" }),
    element("stop", { offset: "65%", "stop-color": "#142033" }),
    element("stop", { offset: "100%", "stop-color": "#0b1322" }),
  );
  definitions.append(faceGradient);
  svg.append(
    definitions,
    element("circle", {
      cx: CENTER,
      cy: CENTER,
      r: 50,
      fill: "none",
      stroke: "#334155",
      "stroke-width": 0.75,
    }),
    element("circle", {
      cx: CENTER,
      cy: CENTER,
      r: 48,
      fill: `url(#${id}-face)`,
      stroke: "#64748b",
      "stroke-width": 0.75,
    }),
    element("circle", {
      cx: CENTER,
      cy: CENTER,
      r: 36,
      fill: "none",
      stroke: "#334155",
      "stroke-opacity": 0.55,
      "stroke-width": 0.5,
    }),
  );
  for (let index = 0; index < 24; index++) {
    const cardinal = index % 6 === 0;
    const diagonal = index % 3 === 0;
    svg.append(
      element("line", {
        x1: CENTER,
        y1: 19,
        x2: CENTER,
        y2: cardinal ? 26 : diagonal ? 24 : 22,
        stroke: index === 0 ? NEEDLE_COLOR : cardinal ? "#cbd5e1" : "#64748b",
        "stroke-width": cardinal ? 1.5 : 0.75,
        "stroke-linecap": "round",
        transform: `rotate(${index * 15} ${CENTER} ${CENTER})`,
      }),
    );
  }
  DIRECTIONS.forEach((direction, index) => {
    const angle = (index * Math.PI) / 2;
    const label = element("text", {
      x: CENTER + 56 * Math.sin(angle),
      y: CENTER - 56 * Math.cos(angle),
      "text-anchor": "middle",
      "dominant-baseline": "central",
      "font-size": 13,
      "font-weight": index === 0 ? 700 : 500,
      fill: index === 0 ? "#fca5a5" : "#cbd5e1",
    });
    label.textContent = direction;
    svg.append(label);
  });

  const editor = document.createElement("label");
  editor.style.cssText =
    "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);display:flex;align-items:center;background:#0f172a;border-radius:6px";
  const input = document.createElement("input");
  input.type = "number";
  input.inputMode = "numeric";
  input.min = "0";
  input.max = "359";
  input.step = "1";
  input.required = true;
  input.style.cssText =
    "box-sizing:content-box;width:3ch;height:34px;padding:0;border:1px solid #64748b;border-radius:6px;background:linear-gradient(180deg,#1e293b,#0f172a);box-shadow:0 2px 6px #02061766,inset 0 1px 0 #ffffff0a;color:#f8fafc;font:inherit;font-size:15px;font-variant-numeric:tabular-nums;text-align:center;appearance:textfield;outline-offset:2px;outline-color:#818cf8";
  editor.append(input);
  editor.onpointerdown = () => {
    activePointerId = null;
  };
  input.onfocus = () => {
    activePointerId = null;
  };
  const reading = document.createElement("p");
  reading.style.cssText =
    "position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;padding:0 4px;border-radius:6px;background:linear-gradient(180deg,#1e293b,#0f172a);box-shadow:0 2px 6px #02061766,inset 0 1px 0 #ffffff0a;color:#f8fafc;font-size:20px;font-weight:500;font-variant-numeric:tabular-nums;line-height:36px;white-space:nowrap;text-align:center";
  const empty = document.createElement("p");
  empty.textContent = "No direction set";
  empty.style.cssText =
    "margin:0;color:#94a3b8;font-size:14px;line-height:36px;text-align:center";

  function reportValidity() {
    return readOnly || headings.length === 0 || input.reportValidity();
  }

  function select(index: number, focusTab = false) {
    if (activePointerId !== null || !reportValidity()) return;
    selected = index;
    refresh();
    if (focusTab) slots[selected]!.tab.focus();
  }

  const slots = Array.from(
    { length: EXPLORATION_LEAD_MAX_HEADINGS },
    (_, index) => {
      const tab = button(`Lead ${index + 1}`, () => select(index));
      tab.id = `${id}-tab-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-controls", panel.id);
      tab.onkeydown = (event) => {
        if (!headings.length) return;
        let next = index;
        switch (event.key) {
          case "ArrowRight":
            next = (index + 1) % headings.length;
            break;
          case "ArrowLeft":
            next = (index + headings.length - 1) % headings.length;
            break;
          case "Home":
            next = 0;
            break;
          case "End":
            next = headings.length - 1;
            break;
          default:
            return;
        }
        event.preventDefault();
        select(next, true);
      };
      tabs.append(tab);
      const handle = element("g", { "data-heading-index": index });
      handle.style.outlineColor = ACCENT;
      handle.append(
        element("circle", {
          cx: CENTER,
          cy: CENTER - 43,
          r: 9,
          fill: "transparent",
        }),
        element("line", {
          x1: CENTER,
          y1: CENTER,
          x2: CENTER,
          y2: CENTER - 41,
          stroke: NEEDLE_COLOR,
          "stroke-width": 2.5,
          "stroke-linecap": "round",
        }),
        element("path", {
          d: "M64 17 L70 31 L64 28 L58 31 Z",
          fill: NEEDLE_COLOR,
        }),
        element("path", {
          d: "M64 17 L64 28 L58 31 Z",
          fill: "#fecaca",
        }),
      );
      svg.append(handle);
      return { tab, handle };
    },
  );
  function changed() {
    input.setCustomValidity("");
    refresh();
    options.onChange?.([...headings]);
  }

  const add = button("+", () => {
    if (
      readOnly ||
      headings.length >= EXPLORATION_LEAD_MAX_HEADINGS ||
      !reportValidity()
    )
      return;
    activePointerId = null;
    selected = headings.length;
    headings.push(DEFAULT_HEADINGS.find((value) => !headings.includes(value))!);
    changed();
    input.focus();
  });
  add.setAttribute("aria-label", "Add direction");
  add.title = "Add direction";
  const remove = button("−", () => {
    if (readOnly || !headings.length) return;
    activePointerId = null;
    headings.splice(selected, 1);
    selected = Math.max(0, Math.min(selected, headings.length - 1));
    changed();
    (headings.length ? input : add).focus();
  });
  remove.setAttribute("aria-label", "Remove direction");
  remove.title = "Remove selected direction";
  for (const control of [remove, add]) {
    control.style.cssText +=
      ";width:32px;height:32px;padding:0;border:1px solid #64748b;border-radius:7px;background:#334155;color:#f8fafc;font-size:22px;font-weight:500";
  }
  remove.style.gridColumn = "1";
  add.style.gridColumn = "3";
  tabBar.append(remove, tabs, add);
  dial.append(svg, editor, reading);
  panel.append(dial, empty);
  root.append(panel, tabBar);
  container.append(root);

  function refresh() {
    const hasHeading = headings.length > 0;
    dial.style.display = hasHeading ? "block" : "none";
    empty.hidden = hasHeading;
    empty.style.display = hasHeading ? "none" : "block";
    svg.style.touchAction = readOnly ? "auto" : "none";
    svg.setAttribute("role", readOnly ? "img" : "group");
    tabBar.style.display = readOnly && !hasHeading ? "none" : "grid";
    tabs.style.display = hasHeading ? "flex" : "none";
    panel.setAttribute("role", hasHeading ? "tabpanel" : "region");
    if (hasHeading) {
      panel.setAttribute("aria-labelledby", slots[selected]!.tab.id);
      panel.removeAttribute("aria-label");
    } else {
      panel.removeAttribute("aria-labelledby");
      panel.setAttribute("aria-label", "Lead directions");
    }
    slots.forEach(({ tab, handle }, index) => {
      const heading = headings[index];
      const exists = heading !== undefined;
      const active = exists && index === selected;
      tab.hidden = !exists;
      tab.style.display = exists ? "inline-flex" : "none";
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute("aria-selected", String(active));
      tab.style.backgroundColor = active ? "#312e81" : "#0f172a";
      tab.style.color = active ? "#e0e7ff" : "#94a3b8";
      handle.setAttribute("display", active ? "inline" : "none");
      handle.setAttribute("aria-hidden", String(!active));
      handle.setAttribute("tabindex", active && !readOnly ? "0" : "-1");
      if (!active || readOnly) handle.removeAttribute("role");
      if (!exists) return;
      const roundedHeading = Math.round(heading) % 360;
      handle.setAttribute(
        "transform",
        `rotate(${heading} ${CENTER} ${CENTER})`,
      );
      handle.setAttribute(
        "aria-label",
        `Direction ${index + 1}: ${roundedHeading} degrees`,
      );
      if (active && !readOnly) {
        handle.setAttribute("role", "slider");
        handle.setAttribute("aria-valuemin", "0");
        handle.setAttribute("aria-valuemax", "359");
        handle.setAttribute("aria-valuenow", String(roundedHeading));
      }
    });
    editor.style.display = !readOnly && hasHeading ? "flex" : "none";
    input.setAttribute("aria-label", `Direction ${selected + 1} in degrees`);
    input.disabled = readOnly || !hasHeading;
    const displayHeading = hasHeading
      ? Math.round(headings[selected]!) % 360
      : null;
    input.value = displayHeading === null ? "" : String(displayHeading);
    reading.hidden = !readOnly || !hasHeading;
    reading.style.display = reading.hidden ? "none" : "block";
    reading.setAttribute("aria-label", `Direction ${selected + 1} in degrees`);
    reading.textContent = displayHeading === null ? "" : `${displayHeading}°`;
    add.hidden = readOnly;
    add.disabled = readOnly || headings.length >= EXPLORATION_LEAD_MAX_HEADINGS;
    add.style.display = add.hidden ? "none" : "inline-flex";
    remove.hidden = readOnly;
    remove.disabled = readOnly || !hasHeading;
    remove.style.display = remove.hidden ? "none" : "inline-flex";
    for (const control of [remove, add]) {
      control.style.backgroundColor = control.disabled
        ? "#1e293b"
        : control === add
          ? "#6366f1"
          : "#ef4444";
      control.style.borderColor = control.disabled
        ? "#334155"
        : control === add
          ? "rgba(129, 140, 248, 0.3)"
          : "rgba(248, 113, 113, 0.3)";
      control.style.color = control.disabled ? "#64748b" : "#ffffff";
      control.style.cursor = control.disabled ? "default" : "pointer";
    }
  }

  input.onchange = () => {
    if (readOnly || !headings.length) return;
    const value = input.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value >= 360) {
      input.setCustomValidity("Enter a whole number from 0 to 359 degrees.");
      input.reportValidity();
      return;
    }
    headings[selected] = value;
    changed();
  };
  function setFromPointer(event: PointerEvent) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = ((event.clientX - rect.left) / rect.width) * VIEW_SIZE - CENTER;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW_SIZE - CENTER;
    if (Math.hypot(x, y) < 5) return;
    const heading =
      (Math.round((Math.atan2(x, -y) * 180) / Math.PI) + 360) % 360;
    headings[selected] = heading;
    changed();
  }
  svg.onpointerdown = (event) => {
    if (
      readOnly ||
      !headings.length ||
      event.button !== 0 ||
      activePointerId !== null
    )
      return;
    activePointerId = event.pointerId;
    svg.setPointerCapture(event.pointerId);
    setFromPointer(event);
  };
  svg.onpointermove = (event) => {
    if (event.pointerId === activePointerId && !readOnly) setFromPointer(event);
  };
  svg.onpointerup = (event) => {
    if (event.pointerId === activePointerId) activePointerId = null;
  };
  svg.onpointercancel = (event) => {
    if (event.pointerId === activePointerId) activePointerId = null;
  };
  svg.onlostpointercapture = (event) => {
    if (event.pointerId === activePointerId) activePointerId = null;
  };
  svg.onkeydown = (event) => {
    if (readOnly || !headings.length) return;
    const handle = (event.target as Element).closest("[data-heading-index]");
    if (
      !handle ||
      Number(handle.getAttribute("data-heading-index")) !== selected ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const delta = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    headings[selected] = (Math.round(headings[selected]!) + delta + 360) % 360;
    changed();
  };
  refresh();
  return {
    reportValidity,
    update(value: Pick<HeadingCompassOptions, "headings" | "readOnly">) {
      activePointerId = null;
      headings = explorationLeadHeadings(value.headings);
      if (value.readOnly !== undefined) readOnly = value.readOnly;
      selected = Math.max(0, Math.min(selected, headings.length - 1));
      input.setCustomValidity("");
      refresh();
    },
    dispose() {
      activePointerId = null;
      root.remove();
    },
  };
}
