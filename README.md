# Height Coverage

A small awareness site: how many OpenStreetMap building footprints already
have height or floor-count data, and how many are still waiting for it?

**Live:** https://dwg7.github.io/height-coverage/

## What it shows

Every building is colored by whether its height/floor data is attributable
to OpenStreetMap:

- 🟩 **Green** — has `height` or floor count (`num_floors`,
  i.e. `building:levels` in OSM), and it's traceable to OpenStreetMap.
- 🟨 **Yellow** — the building exists in OSM, but has no height/floor
  data yet. This is the actual call to action: click one to jump straight
  into the iD editor at that spot.
- ⬜ **Faint gray** — not an OSM building at all, just an AI-detected
  footprint (Microsoft ML Buildings / Google Open Buildings, fused in via
  [Overture Maps](https://docs.overturemaps.org/)). Shown only as
  unobtrusive spatial context, not part of the coverage stats.

All three are flat fills (not 3D extrusion) — see
[DECISIONS.md #9's addendum](DECISIONS.md#addendum-globe-projection--fill-extrusion-breaks-viewport-stats)
for why.

A collapsible panel in the corner reports, for whatever's currently in
view: the percent mapped, and — among mapped buildings — what fraction
used floor count vs. exact height in metres. That breakdown exists to test
a working hypothesis: that counting storeys is something a field surveyor
can realistically do, while measuring exact height in metres generally is
not. See
[DECISIONS.md](DECISIONS.md#6-nudge-toward-floor-count-over-exact-height-in-the-edit-call-to-action).
A second panel shows the raw `num_floors`/`height`/`@height_source` of
whichever building the cursor is over, for spot-checking the
classification.

This is a generic tool, not tied to any one place — pan/zoom anywhere in
the world (the URL hash, `#map=z/lat/lng/bearing/pitch`, tracks your
position, so a specific view is shareable). The map defaults to a globe
projection (fading to flat mercator by about zoom 5), reinforcing that
this isn't a single-region tool. The default view on load is Vientiane's
Chao Anouvong Stadium area (Chanthabuly, Laos), the first real-world case
this was built for.

## How it works

No backend, no build step — a static page (`docs/index.html` +
`docs/app.js`, loaded as an ES module) using
[MapLibre GL JS 6.x](https://maplibre.org/) from a CDN, composing two
tile sources client-side:

- **Background** — [stars.optgeo.org](https://stars.optgeo.org)'s
  `positron` style: OpenMapTiles' official light/near-monochrome
  "Positron" basemap, adapted to point at stars's own tiles and fonts
  (see [hfu/stars#5](https://github.com/hfu/stars/pull/5)) and with
  undersea maritime boundary lines filtered out. Chosen so the background
  doesn't visually compete with the building coloring. Covers everything
  except buildings: roads, land use, water, labels.
- **Buildings** — `stars.optgeo.org/overture_buildings`, a tileset on the
  [Overture Maps](https://docs.overturemaps.org/) buildings schema
  (built by smellman / Taro Matsuzawa, proxied by stars from his own
  PMTiles hosting — see [DECISIONS.md #9](DECISIONS.md#9-switch-the-buildings-source-to-starsoptgeoorgoverture_buildings--resolves-8-entirely)).
  Chosen specifically because it separates `height` and `num_floors` as
  independent fields with a `sources`/`@height_source` provenance trail —
  see [CLAUDE.md](CLAUDE.md) and [DECISIONS.md](DECISIONS.md) for why the
  more obvious OpenMapTiles/Shortbread options don't work for this
  purpose.

## Running locally

Any static file server pointed at `docs/` works, e.g.:

```bash
python3 -m http.server 8123 --directory docs
```

Then open `http://localhost:8123`. (`.claude/launch.json` wires this up for
the Claude Code browser preview tool automatically.) Because `app.js` is
loaded as an ES module (`<script type="module">`), a browser cache can
serve a stale copy across reloads more aggressively than usual — a
cache-busting query string (`?v=2`, etc.) helps when iterating locally.

## Known limitations

- **Stats are viewport-only.** There is no backend aggregation, so the
  percentage shown is only for what's currently rendered on screen, not a
  global total for the visible region.
- **`building_part` features are not used**, only the top-level `building`
  layer. Buildings with `has_parts: true` (e.g. complexes with sections of
  different heights) may have more height data on their parts than their
  outer footprint reflects. Left for a future iteration.
- No editing happens on this site itself — clicking an unmapped building
  links out to the standard [iD editor](https://www.openstreetmap.org/edit),
  by design (see CLAUDE.md's non-goals).
- No automated tests; verification has been manual browser QA against the
  live deployment.

## More context

- [CLAUDE.md](CLAUDE.md) — full background, the OSM-attribution schema
  investigation, and the classification logic, in Japanese.
- [DECISIONS.md](DECISIONS.md) — why each technical choice was made,
  including a couple of debugging trails (a since-resolved upstream outage,
  a MapLibre v6 regression) kept on record for anyone who hits something
  similar.
- [HANDOVER.md](HANDOVER.md) — current status and open threads for whoever
  picks this up next.

## License

See [LICENSE](LICENSE). Basemap © OpenStreetMap contributors. Buildings via
Overture Maps Foundation.
