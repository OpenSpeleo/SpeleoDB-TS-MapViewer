import {
  EXPLORATION_LEAD_MAX_HEADINGS,
  createDefaultExplorationLeadDirections,
  parseExplorationLeadDirections,
  type ExplorationLeadDirection,
} from "@speleodb/map-core";
import { EXPLORATION_LEAD_CHECKED_COLOR } from "./exploration-leads.js";

export interface HeadingCompassOptions {
  directions: readonly ExplorationLeadDirection[];
  readOnly?: boolean;
  onChange?: (directions: ExplorationLeadDirection[]) => void;
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
  let directions =
    parseExplorationLeadDirections(options.directions) ??
    createDefaultExplorationLeadDirections();
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
    "position:relative;display:grid;justify-items:center;gap:8px;width:100%;color:#e2e8f0;font-size:14px";
  root.setAttribute("role", "group");
  root.setAttribute("aria-label", "Lead directions");
  const tabBar = document.createElement("div");
  tabBar.style.cssText =
    "display:flex;align-items:center;justify-content:center;gap:4px;height:36px;min-width:0;max-width:100%";
  const selector = document.createElement("div");
  selector.style.cssText =
    "box-sizing:border-box;display:flex;align-items:stretch;min-width:0;height:36px;padding:1px;border:1px solid #475569;border-radius:7px;background:#0f172a";
  const tabs = document.createElement("div");
  tabs.setAttribute("role", "tablist");
  tabs.setAttribute("aria-label", "Lead directions");
  tabs.style.cssText = "display:flex;align-items:stretch;min-width:0";
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
  input.required = false;
  const headingValueStyle =
    "box-sizing:content-box;width:3ch;height:34px;padding:0;border:1px solid #64748b;border-radius:6px;background:linear-gradient(180deg,#1e293b,#0f172a);box-shadow:0 2px 6px #02061766,inset 0 1px 0 #ffffff0a;color:#f8fafc;font:inherit;font-size:15px;font-variant-numeric:tabular-nums;text-align:center";
  input.style.cssText = `${headingValueStyle};appearance:textfield;outline-offset:2px;outline-color:#818cf8`;
  editor.append(input);
  editor.onpointerdown = () => {
    activePointerId = null;
  };
  input.onfocus = () => {
    activePointerId = null;
  };
  const reading = document.createElement("p");
  reading.style.cssText = `${headingValueStyle};position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);margin:0;line-height:34px;white-space:nowrap`;
  const empty = document.createElement("p");
  empty.textContent = "No direction set";
  empty.style.cssText =
    "margin:0;color:#94a3b8;font-size:14px;line-height:36px;text-align:center";

  function reportValidity() {
    return readOnly || input.reportValidity();
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
      tab.style.cssText +=
        ";flex:0 1 58px;width:58px;min-width:0;padding:0 3px;font-size:12px;white-space:nowrap;outline-offset:-2px";
      tab.id = `${id}-tab-${index}`;
      tab.setAttribute("role", "tab");
      tab.setAttribute("aria-label", `Lead ${index + 1}`);
      tab.setAttribute("aria-controls", panel.id);
      tab.onkeydown = (event) => {
        if (!directions.length) return;
        let next = index;
        switch (event.key) {
          case "ArrowRight":
            next = (index + 1) % directions.length;
            break;
          case "ArrowLeft":
            next = (index + directions.length - 1) % directions.length;
            break;
          case "Home":
            next = 0;
            break;
          case "End":
            next = directions.length - 1;
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
    options.onChange?.(directions.map((entry) => ({ ...entry })));
  }

  const add = button("+", () => {
    if (
      readOnly ||
      (directions.length >= EXPLORATION_LEAD_MAX_HEADINGS &&
        directions[selected]!.heading !== null) ||
      !reportValidity()
    )
      return;
    activePointerId = null;
    const heading = DEFAULT_HEADINGS.find(
      (value) => !directions.some((entry) => entry.heading === value),
    )!;
    if (directions[selected]!.heading === null) {
      directions[selected]!.heading = heading;
    } else {
      selected = directions.length;
      directions.push({
        heading,
        checked: false,
      });
    }
    changed();
    input.focus();
  });
  add.setAttribute("aria-label", "Add direction");
  add.title = "Add direction";
  const remove = button("−", () => {
    if (readOnly || !directions.length) return;
    activePointerId = null;
    if (directions.length === 1) directions[0]!.heading = null;
    else directions.splice(selected, 1);
    selected = Math.max(0, Math.min(selected, directions.length - 1));
    changed();
    (directions[selected]!.heading === null ? add : input).focus();
  });
  remove.setAttribute("aria-label", "Remove direction");
  remove.title = "Remove selected direction";
  for (const control of [remove, add]) {
    control.style.cssText +=
      ";flex-shrink:0;width:32px;height:32px;padding:0;border:1px solid #64748b;border-radius:7px;background:#334155;color:#f8fafc;font-size:22px;font-weight:500";
  }
  tabBar.append(remove, selector, add);
  dial.append(svg, editor, reading);
  panel.append(dial, empty);
  selector.append(tabs);
  const statusPanel = document.createElement("div");
  statusPanel.style.cssText =
    "box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;max-width:320px;min-height:52px;margin-top:4px;padding:8px 10px 8px 12px;border:1px solid #334155;border-radius:8px;background:#172235";
  const statusCopy = document.createElement("div");
  statusCopy.id = `${id}-status`;
  statusCopy.style.cssText = "display:grid;gap:2px;min-width:0;line-height:1.3";
  const statusLead = document.createElement("span");
  statusLead.style.cssText = "color:#94a3b8;font-size:11px";
  const statusText = document.createElement("span");
  statusText.style.cssText = "color:#e2e8f0;font-size:13px;font-weight:500";
  statusCopy.append(statusLead, document.createTextNode(" "), statusText);
  const statusControls = document.createElement("div");
  statusControls.style.cssText =
    "box-sizing:border-box;display:flex;align-items:stretch;flex-shrink:0;height:34px;border:1px solid #475569;border-radius:6px;background:#334155";
  const toggleChecked = button("Mark checked", () => {
    if (readOnly || !reportValidity()) return;
    activePointerId = null;
    directions[selected]!.checked = !directions[selected]!.checked;
    changed();
  });
  toggleChecked.setAttribute("aria-describedby", statusCopy.id);
  toggleChecked.style.cssText +=
    ";width:104px;height:32px;padding:0 9px;border-radius:5px;background:#334155;color:#f1f5f9;font-size:12px;white-space:nowrap;outline-offset:-2px";
  toggleChecked.onpointerenter = () => {
    toggleChecked.style.backgroundColor = "#40516a";
  };
  toggleChecked.onpointerleave = () => {
    toggleChecked.style.backgroundColor = "#334155";
  };
  const bulkActions = document.createElement("div");
  bulkActions.setAttribute("role", "group");
  bulkActions.setAttribute("aria-label", "All leads");
  bulkActions.style.cssText = "display:flex;justify-self:end;gap:4px";

  function bulkButton(label: string, checked: boolean) {
    const control = button(label, () => {
      if (readOnly || !reportValidity()) return;
      activePointerId = null;
      for (const entry of directions) entry.checked = checked;
      changed();
    });
    control.style.cssText +=
      ";height:24px;padding:0 7px;border:1px solid #64748b;background:#334155;font-size:11px;font-weight:600;white-space:nowrap";
    control.onpointerenter = () => {
      if (!control.disabled) control.style.backgroundColor = "#475569";
    };
    control.onpointerleave = () => {
      if (!control.disabled) control.style.backgroundColor = "#334155";
    };
    return control;
  }

  const checkAll = bulkButton("Check all", true);
  const uncheckAll = bulkButton("Uncheck all", false);
  bulkActions.append(checkAll, uncheckAll);
  statusControls.append(toggleChecked);
  statusPanel.append(statusCopy, statusControls);
  root.append(bulkActions, panel, tabBar, statusPanel);
  container.append(root);

  function refresh() {
    const hasHeading = directions[selected]!.heading !== null;
    dial.style.display = hasHeading ? "block" : "none";
    empty.hidden = hasHeading;
    empty.style.display = hasHeading ? "none" : "block";
    svg.style.touchAction = readOnly ? "auto" : "none";
    svg.setAttribute("role", readOnly ? "img" : "group");
    tabBar.style.display = "flex";
    tabs.style.display = "flex";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", slots[selected]!.tab.id);
    slots.forEach(({ tab, handle }, index) => {
      const entry = directions[index];
      const heading = entry?.heading;
      const exists = entry !== undefined;
      const active = exists && index === selected;
      tab.hidden = !exists;
      tab.style.display = exists ? "inline-flex" : "none";
      tab.tabIndex = active ? 0 : -1;
      tab.setAttribute("aria-selected", String(active));
      tab.style.backgroundColor = active ? "#312e81" : "#0f172a";
      tab.style.color = entry?.checked
        ? "#86efac"
        : active
          ? "#e0e7ff"
          : "#94a3b8";
      tab.style.boxShadow = entry?.checked
        ? `inset 0 -1px ${EXPLORATION_LEAD_CHECKED_COLOR}`
        : "none";
      tab.title = `Lead ${index + 1}: ${entry?.checked ? "Checked" : "Unchecked"}`;
      tab.setAttribute(
        "aria-description",
        entry?.checked ? "Checked" : "Unchecked",
      );
      const showHandle = active && heading !== null;
      handle.setAttribute("display", showHandle ? "inline" : "none");
      handle.setAttribute("aria-hidden", String(!showHandle));
      handle.setAttribute("tabindex", showHandle && !readOnly ? "0" : "-1");
      if (!showHandle || readOnly) handle.removeAttribute("role");
      if (heading === undefined || heading === null) return;
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
      ? Math.round(directions[selected]!.heading!) % 360
      : null;
    input.value = displayHeading === null ? "" : String(displayHeading);
    reading.hidden = !readOnly || !hasHeading;
    reading.style.display = reading.hidden ? "none" : "block";
    reading.setAttribute("aria-label", `Direction ${selected + 1} in degrees`);
    reading.textContent = displayHeading === null ? "" : String(displayHeading);
    const isChecked = directions[selected]!.checked;
    statusLead.textContent = `Lead ${selected + 1}`;
    statusText.textContent = isChecked ? "Checked" : "Unchecked";
    statusText.style.color = isChecked ? "#86efac" : "#e2e8f0";
    statusCopy.style.display = readOnly ? "flex" : "grid";
    statusCopy.style.justifyContent = "space-between";
    statusCopy.style.alignItems = "center";
    statusCopy.style.flex = "1";
    statusPanel.hidden = readOnly;
    statusPanel.style.display = readOnly ? "none" : "flex";
    statusControls.hidden = readOnly;
    statusControls.style.display = readOnly ? "none" : "flex";
    bulkActions.hidden = readOnly || directions.length === 1;
    bulkActions.style.display = bulkActions.hidden ? "none" : "flex";
    toggleChecked.textContent = isChecked ? "Mark unchecked" : "Mark checked";
    toggleChecked.title = `Mark Lead ${selected + 1} ${isChecked ? "unchecked" : "checked"}`;
    toggleChecked.disabled = readOnly;
    checkAll.hidden = uncheckAll.hidden = bulkActions.hidden;
    checkAll.disabled = readOnly || directions.every((entry) => entry.checked);
    uncheckAll.disabled =
      readOnly || directions.every((entry) => !entry.checked);
    for (const control of [checkAll, uncheckAll]) {
      control.style.backgroundColor = control.disabled ? "#1e293b" : "#334155";
      control.style.borderColor = control.disabled ? "#334155" : "#64748b";
      control.style.color = control.disabled ? "#64748b" : "#f8fafc";
      control.style.cursor = control.disabled ? "default" : "pointer";
    }
    add.setAttribute(
      "aria-label",
      !hasHeading ? "Set direction" : "Add direction",
    );
    add.title = !hasHeading ? "Set direction" : "Add direction";
    remove.title =
      directions.length === 1 ? "Clear direction" : "Remove selected direction";
    add.hidden = readOnly;
    add.disabled =
      readOnly ||
      (directions.length >= EXPLORATION_LEAD_MAX_HEADINGS && hasHeading);
    add.style.display = add.hidden ? "none" : "inline-flex";
    remove.hidden = readOnly;
    remove.disabled = readOnly || (directions.length === 1 && !hasHeading);
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
    if (readOnly || !directions.length) return;
    if (input.value === "" && !input.validity.badInput) {
      directions[selected]!.heading = null;
      changed();
      add.focus();
      return;
    }
    const value = input.valueAsNumber;
    if (!Number.isInteger(value) || value < 0 || value >= 360) {
      input.setCustomValidity("Enter a whole number from 0 to 359 degrees.");
      input.reportValidity();
      return;
    }
    directions[selected]!.heading = value;
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
    directions[selected]!.heading = heading;
    changed();
  }
  svg.onpointerdown = (event) => {
    if (
      readOnly ||
      !directions.length ||
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
    if (readOnly || !directions.length) return;
    const handle = (event.target as Element).closest("[data-heading-index]");
    if (
      !handle ||
      Number(handle.getAttribute("data-heading-index")) !== selected ||
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    )
      return;
    event.preventDefault();
    const delta = ["ArrowRight", "ArrowUp"].includes(event.key) ? 1 : -1;
    directions[selected]!.heading =
      (Math.round(directions[selected]!.heading!) + delta + 360) % 360;
    changed();
  };
  refresh();
  return {
    reportValidity,
    update(value: Pick<HeadingCompassOptions, "directions" | "readOnly">) {
      activePointerId = null;
      directions =
        parseExplorationLeadDirections(value.directions) ??
        createDefaultExplorationLeadDirections();
      if (value.readOnly !== undefined) readOnly = value.readOnly;
      selected = Math.max(0, Math.min(selected, directions.length - 1));
      input.setCustomValidity("");
      refresh();
    },
    dispose() {
      activePointerId = null;
      root.remove();
    },
  };
}
