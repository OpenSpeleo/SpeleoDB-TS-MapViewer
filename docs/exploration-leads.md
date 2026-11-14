# Exploration lead directions

`createExplorationLeadConeLayer` creates a fill specification for the polygons
from `@speleodb/map-core`'s `buildExplorationLeadCones`. Consumers pass source
and layer IDs, category visibility and project filter.
`MAP_LAYER_MIN_ZOOM.EXPLORATION_LEAD_SYMBOL` is the shared visibility threshold
for web and mobile lead icons, fallback markers and cones: zoom 15. The cone
builder applies it directly; callers cannot override its minimum zoom
independently of the markers. Visibility thresholds and the red/80%-opacity
styling belong to map-viewer; the fifteen-metre cone geometry belongs to
map-core. Apply `EXPLORATION_LEAD_CONE_SOURCE_OPTIONS` when registering the
derived source: zero simplification tolerance preserves the small sectors. Place
the layer above lead icons so the fifteen-metre sectors remain visible around
their origin. Cones remain decorative and do not become additional click or drag
targets.

`@speleodb/map-viewer/heading-compass` exports
`createHeadingCompass(container, { headings, readOnly, onChange })`. It mounts
one direction control without an outer card. A segmented strip labelled "Lead
1", "Lead 2" and "Lead 3" sits below the compass and selects existing
directions. Compact tabs and square minus and plus buttons use 32-pixel
controls; the buttons flank the strip and preserve its centered alignment. Plus
uses the Save button's purple and minus uses the Delete button's red, with white
symbols; disabled controls retain their muted appearance. A 160-pixel compass
has a 120-pixel shaded face, a fine double rim and ticks every 15 degrees.
Brighter cardinal ticks and a coral north label improve orientation. A two-tone
red arrow has a full shaft extending from the center to its tip. The persistent
degree editor sits over the shaft in the middle of the compass. Its opaque HTML
overlay is three characters wide, with centered whole-degree text. It is a
sibling of the SVG, so editing the number does not start a compass drag. The
populated control occupies approximately 204 pixels vertically, with no
additional action row.

Switching tabs updates the selection and editor value without changing headings,
emitting a draft change, or replacing any dial, handle, tab, panel or editor
element. Each tab references the same panel, whose accessible name follows the
selection. Arrow keys and Home/End select tabs; only the selected tab and active
editable needle enter the tab order. Inactive needle nodes remain mounted but
hidden, preventing overlapping handles and accidental edits to another lead.

Editable mode supports pointer selection/dragging, arrow keys on the pointer,
numeric degrees and adding/removing directions. Plus creates and selects the
next tab; minus removes the selected heading. Both buttons remain visible when
editing: plus is disabled at the limit, and minus is disabled when unset.
Removing the last direction clears the value. The empty state collapses to its
message and controls; adding reveals the existing dial. There is no separate
reset action. Invalid numeric input must be corrected before switching tabs or
adding a direction. The control displays and edits integer degrees from zero
through 359, clockwise from north. Existing fractional bearings are rounded for
display only; opening or switching tabs does not change the original stored
bearings. Pointer and keyboard edits set whole degrees. Editing changes a local
draft and emits copied arrays; no network or storage operation is performed.

The returned `update({ headings, readOnly })` replaces the displayed draft
without emitting a change. Call `reportValidity()` before saving to prevent
invalid numeric input from saving the last valid draft. Call `dispose()` when
the owning modal unmounts. Only element-local listeners are installed; disposal
removes owned DOM. No global listener, sensor, timer or map instance is created.

Read-only mode retains the tabs and selected pointer, with the degree readout in
the center of the compass and no editing controls. The empty state says "No
direction set". Both mode presentation and interaction live here so web and
mobile cannot drift; permissions, draft cancellation, save failure handling and
React/modal lifecycle remain app-owned. Numeric edits retain keyboard focus;
adding/removing moves focus to the next useful control. Only the pointer that
began a drag can change that gesture, and cancellation or lost capture ends it
without discarding the modal draft. Adding, removing, entering the central
editor or externally updating directions also ends the gesture, so a previous
contact cannot alter the newly selected direction or overwrite a numeric edit.

The package tests protect renderer specification behavior. Consumer DOM tests
exercise the actual shared control, draft isolation, invalid values, keyboard
changes, stable node identity across tab switches, add/remove and read-only
lifecycle. Real-browser tests own pointer capture, hit testing and gesture
behavior. The control adds no framework or runtime dependency.
