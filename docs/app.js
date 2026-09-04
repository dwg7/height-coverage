/*
 * Height Coverage
 *
 * Background: stars.optgeo.org "positron" style (OpenMapTiles' light/
 * monochrome basemap, adapted to point at stars's own tiles/glyphs --
 * see hfu/stars PR #5), minus its own `building` layer (that layer bakes
 * a synthetic 5m render_height into every building regardless of whether
 * height/levels tags exist, so it cannot be used to distinguish "has
 * data" from "no data" -- see CLAUDE.md).
 *
 * Buildings: stars.optgeo.org/overture_buildings, a Martin-proxied remote
 * PMTiles source (Overture Maps buildings schema, built by smellman / Taro
 * Matsuzawa). Split into three layers:
 *
 *   - green (flat): height/floor data traces back to OpenStreetMap --
 *       `height` present with `@height_source === "OpenStreetMap"`, or
 *       `num_floors` present with an "osm" provider in `sources` (there is
 *       no dedicated source field for floor count, so `sources` is used as
 *       a proxy -- empirically every num_floors-only feature sampled across
 *       Vientiane, Paris and London was osm-sourced).
 *   - yellow (flat): an OSM building (`sources` includes "osm") with no
 *       OSM-attributed height/floor data yet -- the actual call to action.
 *   - faint gray (flat, low opacity): no OSM involvement at all, just a
 *       Microsoft/Google AI-detected footprint -- background context only,
 *       excluded from the coverage stats.
 *
 * All three are flat fills, not fill-extrusion -- see DECISIONS.md #9
 * addendum for why (globe projection + fill-extrusion breaks
 * queryRenderedFeatures()'s viewport query for that layer).
 *
 * See DECISIONS.md #4-5 for how this was derived from decoded sample tiles.
 */

import * as maplibregl from "https://unpkg.com/maplibre-gl@6.6.0/dist/maplibre-gl.mjs";

const BUILDINGS_URL = "https://stars.optgeo.org/overture_buildings/{z}/{x}/{y}";
const BASE_STYLE_URL = "https://stars.optgeo.org/style/positron";

// Default view: Chao Anouvong Stadium area, Vientiane (Chanthabuly, Laos) --
// the first real-world application of this generic tool. Overridable via
// the URL hash (as `#map=z/lat/lng/bearing/pitch`) that maplibre's
// `hash: "map"` option maintains automatically.
const DEFAULT_VIEW = { center: [102.61, 17.97], zoom: 16, pitch: 45 };

const GREEN = "#2ecc71";
const YELLOW = "#f4c430";
const FAINT_GRAY = "#999999";

// Does `sources` (a JSON array of {provider, ...} objects, serialized as a
// string) mention OSM as one of the fused providers at all?
const HAS_OSM_SOURCE = [
  "case",
  ["has", "sources"],
  ["in", "\"provider\":\"osm\"", ["get", "sources"]],
  false,
];

// A building's height/floor data is attributed to OpenStreetMap when either:
//  - it has a `height`, and @height_source says so, or
//  - it has `num_floors` (no dedicated source field for that), and `sources`
//    includes an OSM provider entry.
const IS_OSM_ATTRIBUTED = [
  "any",
  ["all", ["has", "height"], ["==", ["get", "@height_source"], "OpenStreetMap"]],
  ["all", ["has", "num_floors"], HAS_OSM_SOURCE],
];

// Buildings with no OSM involvement at all -- pure Microsoft/Google AI
// footprint detections. Not part of the "help us map height" appeal, just
// faint background context that a footprint exists there at all.
const IS_NON_OSM = ["!", HAS_OSM_SOURCE];

async function main() {
  const style = await fetch(BASE_STYLE_URL).then((r) => r.json());

  // Drop the base style's own `building` layer -- see header comment.
  style.layers = style.layers.filter((l) => l.id !== "building");

  // This is a generic, worldwide tool -- see CLAUDE.md -- so default to a
  // globe rather than a flat mercator projection. MapLibre fades to
  // mercator automatically past ~zoom 5, so this only affects the
  // zoomed-out, whole-world view. Confirmed (see DECISIONS.md #9 addendum)
  // that globe + a fill-extrusion layer breaks queryRenderedFeatures()'s
  // viewport-wide query for that layer even at high zoom where it renders
  // as flat mercator -- the fix is to not use fill-extrusion at all (see
  // the buildings-input layer below) rather than give up on globe.
  style.projection = { type: "globe" };

  style.sources.buildings = {
    type: "vector",
    tiles: [BUILDINGS_URL],
    minzoom: 4,
    maxzoom: 14,
  };

  // Insert our two building layers just before the first label layer, so
  // they sit above roads/land cover but below place names.
  const labelIndex = style.layers.findIndex((l) => l.type === "symbol");
  const insertAt = labelIndex === -1 ? style.layers.length : labelIndex;

  style.layers.splice(
    insertAt,
    0,
    {
      // Non-OSM footprints (Microsoft/Google AI detections only): faint
      // background reference, not part of the height-input appeal.
      id: "buildings-non-osm",
      type: "fill",
      source: "buildings",
      "source-layer": "building",
      minzoom: 12,
      filter: IS_NON_OSM,
      paint: {
        "fill-color": FAINT_GRAY,
        "fill-opacity": 0.08,
      },
    },
    {
      id: "buildings-not-input",
      type: "fill",
      source: "buildings",
      "source-layer": "building",
      minzoom: 12,
      filter: ["all", HAS_OSM_SOURCE, ["!", IS_OSM_ATTRIBUTED]],
      paint: {
        "fill-color": YELLOW,
        "fill-opacity": 0.55,
      },
    },
    {
      // Flat, not fill-extrusion: with globe projection enabled, a
      // fill-extrusion layer's queryRenderedFeatures() viewport query
      // silently returns nothing even at zoom levels well past globe's
      // mercator fade threshold (rendering and point-queries are both
      // fine -- only the whole-viewport query on this specific layer type
      // breaks). See DECISIONS.md #9 addendum. A flat fill sacrifices the
      // 3D "pop" for mapped buildings but keeps globe and working stats.
      id: "buildings-input",
      type: "fill",
      source: "buildings",
      "source-layer": "building",
      minzoom: 12,
      filter: IS_OSM_ATTRIBUTED,
      paint: {
        "fill-color": GREEN,
        "fill-opacity": 0.7,
      },
    }
  );

  const map = new maplibregl.Map({
    container: "map",
    style,
    hash: "map",
    // MapLibre v6 changed the default tile-overscaling strategy in a way
    // that broke queryRenderedFeatures()-based viewport stats for this
    // source (it renders fine either way, but stops finding features when
    // queried past maxzoom). Reverting to the pre-v6 behavior fixes it.
    zoomLevelsToOverscale: undefined,
    ...DEFAULT_VIEW,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.GlobeControl(), "top-right");

  // The buildings tile source is a remote proxy (see CLAUDE.md/DECISIONS.md
  // for the current upstream). Surface load failures plainly instead of
  // leaving the panel stuck on "Loading…" forever.
  let buildingsErrorShown = false;
  map.on("error", (e) => {
    if (e.sourceId !== "buildings" || buildingsErrorShown) return;
    buildingsErrorShown = true;
    document.getElementById("stat-detail").textContent =
      "Buildings layer unavailable right now (upstream tile server issue) -- background map still works.";
    document.getElementById("stat-breakdown").textContent = "";
  });

  map.on("load", () => {
    updateStats(map);
    map.on("moveend", () => updateStats(map));
  });

  map.on("click", "buildings-not-input", (e) => showEditPopup(map, e));
  map.on("mouseenter", "buildings-not-input", () => {
    map.getCanvas().style.cursor = "pointer";
  });
  map.on("mouseleave", "buildings-not-input", () => {
    map.getCanvas().style.cursor = "";
  });

  const BUILDING_LAYERS = ["buildings-input", "buildings-not-input", "buildings-non-osm"];
  map.on("mousemove", (e) => {
    const feats = map.queryRenderedFeatures(e.point, { layers: BUILDING_LAYERS });
    showHoverInfo(feats[0]);
  });
  map.on("mouseout", () => showHoverInfo(null));

  setupPanelToggle();
}

function setupPanelToggle() {
  const panel = document.getElementById("panel");
  const icon = document.getElementById("panel-toggle-icon");
  document.getElementById("panel-toggle").addEventListener("click", () => {
    const collapsed = panel.classList.toggle("collapsed");
    icon.textContent = collapsed ? "+" : "−";
  });
}

// Only the fields the classification logic actually reads: `num_floors`
// (its mere presence, combined with an osm entry in `sources`, makes a
// building green -- see HAS_OSM_SOURCE/IS_OSM_ATTRIBUTED above) and
// `height`. `@height_source` is included too, but only when it's
// something other than "OpenStreetMap" -- when height IS OSM-attributed
// the building is green by definition, so the field is redundant there;
// it only earns its place on screen for the (rarer) case of a height
// value attributed to Microsoft ML Buildings etc, which is otherwise
// invisible (that building renders gray, same as one with no height data
// at all).
const HOVER_FIELDS = ["num_floors", "height"];

// Shows just those fields for the hovered building (bottom-left panel) --
// handy for spot-checking why it was classified green/yellow/gray.
function showHoverInfo(feature) {
  const panel = document.getElementById("hover-panel");
  const rows = feature
    ? HOVER_FIELDS.filter((k) => feature.properties[k] !== null && feature.properties[k] !== undefined && feature.properties[k] !== "")
    : [];
  if (feature && feature.properties["@height_source"] && feature.properties["@height_source"] !== "OpenStreetMap") {
    rows.push("@height_source");
  }

  if (rows.length === 0) {
    panel.classList.remove("visible");
    panel.innerHTML = "";
    return;
  }

  panel.innerHTML = rows
    .map((k) => `<div class="hp-row"><span class="hp-key">${escapeHtml(k)}</span>: ${escapeHtml(String(feature.properties[k]))}</div>`)
    .join("");
  panel.classList.add("visible");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function showEditPopup(map, e) {
  const [lon, lat] = e.lngLat.toArray();
  const editUrl = `https://www.openstreetmap.org/edit?editor=id#map=19/${lat.toFixed(6)}/${lon.toFixed(6)}`;

  // Plain Google Maps URL scheme -- no API key, no signature, no billing
  // (unlike the Street View Static API or JS Embed API, which require
  // both). heading/pitch are deliberately omitted: without them, Google
  // aims the panorama at the given coordinate from whatever the nearest
  // available imagery is on its own, which is good enough for "go look at
  // it" and avoids having to compute a bearing to the building ourselves.
  const streetViewUrl = `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}&fov=90`;

  // Nudge toward floor count (building:levels) rather than exact height in
  // meters: counting storeys is something a surveyor can do by eye in the
  // field, whereas measuring height in metres generally is not.
  new maplibregl.Popup({ className: "osm-popup" })
    .setLngLat(e.lngLat)
    .setHTML(
      `<h4>No height data yet</h4>
       <p>This building has no height or floor-count info attributed to OpenStreetMap.</p>
       <p>Tip: counting <strong>floors</strong> (<code>building:levels</code>) is usually
       far easier to survey than measuring exact height in metres.</p>
       <a class="edit-link" href="${editUrl}" target="_blank" rel="noopener">Add floor count in iD editor &rarr;</a>
       <p class="streetview-row">
         <a href="${escapeHtml(streetViewUrl)}" target="_blank" rel="noopener">View on Google Street View &#8599;</a>
         <span class="streetview-note">Just for a look -- not a source to trace over for editing.</span>
       </p>`
    )
    .addTo(map);
}

// De-duplicated, viewport-scoped counts. This is only what's currently
// rendered on screen, not a global total -- there is no backend aggregation
// in this MVP, so the number changes as you pan and zoom.
//
// Also breaks down mapped (green) buildings by which tag actually carries
// the data: `num_floors` (building:levels, a field survey can count this by
// eye) vs `height` (a precise metre value, generally requires measurement
// equipment or an official plan). This tells us, per place, which input
// method OSM contributors are actually using in practice.
function updateStats(map) {
  const seen = new Set();
  let green = 0;
  let yellow = 0;
  let withFloors = 0;
  let withHeight = 0;

  // Pass an explicit full-canvas bounding box rather than omitting the
  // geometry argument. With no geometry, MapLibre v6 has been observed to
  // silently return zero features for the fill-extrusion layer
  // (buildings-input) specifically -- it renders correctly, and a
  // point-based query against it works fine, but the "whole viewport"
  // shortcut does not. An explicit box works for all three layer types.
  const canvas = map.getCanvas();
  const bbox = [
    [0, 0],
    [canvas.clientWidth, canvas.clientHeight],
  ];

  for (const layerId of ["buildings-input", "buildings-not-input"]) {
    const feats = map.queryRenderedFeatures(bbox, { layers: [layerId] });
    for (const f of feats) {
      const key = f.properties.id ?? `${layerId}:${f.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (layerId === "buildings-input") {
        green++;
        if (f.properties.num_floors != null) withFloors++;
        if (f.properties.height != null) withHeight++;
      } else {
        yellow++;
      }
    }
  }

  const total = green + yellow;
  const pctEl = document.getElementById("stat-pct");
  const detailEl = document.getElementById("stat-detail");
  const breakdownEl = document.getElementById("stat-breakdown");

  if (total === 0) {
    pctEl.textContent = "–";
    detailEl.textContent = "No buildings in view at this zoom.";
    breakdownEl.textContent = "";
    return;
  }

  const pct = Math.round((green / total) * 100);
  pctEl.textContent = `${pct}% mapped`;
  detailEl.textContent = `${green} with height data / ${yellow} without, in current view (${total} total)`;

  if (green > 0) {
    const floorsPct = Math.round((withFloors / green) * 100);
    const heightPct = Math.round((withHeight / green) * 100);
    breakdownEl.textContent =
      `Of those mapped: ${floorsPct}% via floor count, ${heightPct}% via exact height (m)`;
  } else {
    breakdownEl.textContent = "";
  }
}

main().catch((err) => {
  console.error(err);
  document.getElementById("stat-detail").textContent = "Failed to load: " + err.message;
});
