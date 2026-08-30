/*
 * Height Coverage
 *
 * Background: stars.optgeo.org "openstreetmap_jp_planet" style, minus its own
 * `building` layer (that layer bakes a synthetic 5m render_height into every
 * building regardless of whether height/levels tags exist, so it cannot be
 * used to distinguish "has data" from "no data" -- see CLAUDE.md).
 *
 * Buildings: tunnel.optgeo.org/martin/buildings ("taroverture", an Overture
 * Maps buildings schema tileset). Split into three layers:
 *
 *   - green (extruded): height/floor data traces back to OpenStreetMap --
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
 * See DECISIONS.md #4-5 for how this was derived from decoded sample tiles.
 */

const BUILDINGS_URL = "https://tunnel.optgeo.org/martin/buildings/{z}/{x}/{y}";
const BASE_STYLE_URL = "https://stars.optgeo.org/style/openstreetmap_jp_planet";

// Default view: Chao Anouvong Stadium area, Vientiane (Chanthabuly, Laos) --
// the first real-world application of this generic tool. Overridable via
// the URL hash that maplibre's `hash: true` option maintains automatically.
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

const EXTRUSION_HEIGHT = [
  "case",
  ["has", "height"], ["get", "height"],
  ["*", ["get", "num_floors"], 3.66],
];

async function main() {
  const style = await fetch(BASE_STYLE_URL).then((r) => r.json());

  // Drop the base style's own `building` layer -- see header comment.
  style.layers = style.layers.filter((l) => l.id !== "building");

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
      id: "buildings-input",
      type: "fill-extrusion",
      source: "buildings",
      "source-layer": "building",
      minzoom: 12,
      filter: IS_OSM_ATTRIBUTED,
      paint: {
        "fill-extrusion-color": GREEN,
        "fill-extrusion-height": EXTRUSION_HEIGHT,
        "fill-extrusion-opacity": 0.85,
      },
    }
  );

  const map = new maplibregl.Map({
    container: "map",
    style,
    hash: true,
    ...DEFAULT_VIEW,
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

  // The buildings tile source (tunnel.optgeo.org) is a personal/dev
  // endpoint with known upstream reliability issues -- see DECISIONS.md #8.
  // Surface that plainly instead of leaving the panel stuck on "Loading…"
  // forever when its tiles fail to fetch.
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
}

function showEditPopup(map, e) {
  const [lon, lat] = e.lngLat.toArray();
  const editUrl = `https://www.openstreetmap.org/edit?editor=id#map=19/${lat.toFixed(6)}/${lon.toFixed(6)}`;

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
       <a class="edit-link" href="${editUrl}" target="_blank" rel="noopener">Add floor count in iD editor &rarr;</a>`
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

  for (const layerId of ["buildings-input", "buildings-not-input"]) {
    const feats = map.queryRenderedFeatures({ layers: [layerId] });
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
