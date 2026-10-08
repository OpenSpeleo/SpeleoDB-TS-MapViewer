/** Identical source artwork shared by the authenticated web and mobile viewers. */
export const MAP_ICON_URLS = {
  artifact: new URL("../assets/artifact-icon.png", import.meta.url).href,
  bones: new URL("../assets/bones-icon.png", import.meta.url).href,
  biology: new URL("../assets/fish-icon.png", import.meta.url).href,
  geology: new URL("../assets/rock-icon.png", import.meta.url).href,
  sensor: new URL("../assets/sensor-icon.png", import.meta.url).href,
  explorationLead: new URL(
    "../assets/exploration-lead-icon.png",
    import.meta.url,
  ).href,
  cylinder: new URL("../assets/cylinder-orange-icon.png", import.meta.url).href,
} as const;
