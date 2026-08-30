# Height Coverage

A small awareness site: how many OpenStreetMap building footprints already
have height or floor-count data, and how many are still waiting for it?

**Live:** https://dwg7.github.io/height-coverage/

## What it shows

Every building is colored by whether its height/floor data is attributable
to OpenStreetMap:

- 🟩 **Green** — has `height` or floor count (`num_floors`,
  i.e. `building:levels` in OSM), and it's traceable to OpenStreetMap.
- 🟨 **Yellow, flat** — the building exists in OSM, but has no height/floor
  data yet. This is the actual call to action: click one to jump straight
  into the iD editor at that spot.
- ⬜ **Faint gray, flat** — not an OSM building at all, just an AI-detected
  footprint (Microsoft ML Buildings / Google Open Buildings, fused in via
  [Overture Maps](https://docs.overturemaps.org/)). Shown only as
  unobtrusive spatial context, not part of the coverage stats.

A panel in the corner reports, for whatever's currently in view: the percent
mapped, and — among mapped buildings — what fraction used floor count vs.
exact height in metres. That breakdown exists to test a working hypothesis:
that counting storeys is something a field surveyor can realistically do,
while measuring exact height in metres generally is not. See
[DECISIONS.md](DECISIONS.md#6-nudge-toward-floor-count-over-exact-height-in-the-edit-call-to-action).

This is a generic tool, not tied to any one place — pan/zoom anywhere in the
world (the URL hash tracks your position, so a specific view is shareable).
The default view on load is Vientiane's Chao Anouvong Stadium area
(Chanthabuly, Laos), the first real-world case this was built for.

## How it works

No backend, no build step — a static page (`docs/index.html` +
`docs/app.js`) that loads [MapLibre GL JS](https://maplibre.org/) from a
CDN and composes two tile sources client-side:

- **Background** — [stars.optgeo.org](https://stars.optgeo.org)'s
  `positron` style (an OpenMapTiles Positron adaptation hosted for this
  project — see [hfu/stars#5](https://github.com/hfu/stars/pull/5) — over
  the same `openstreetmap_jp_planet` tiles): light, near-monochrome, so it
  doesn't compete with the building coloring. Covers everything except
  buildings: roads, land use, water, labels.
- **Buildings** — `tunnel.optgeo.org/martin/buildings` ("taroverture"), a
  tileset built on the [Overture Maps](https://docs.overturemaps.org/)
  buildings schema. Chosen specifically because it separates `height` and
  `num_floors` as independent fields with a `sources`/`@height_source`
  provenance trail — see [CLAUDE.md](CLAUDE.md) and [DECISIONS.md](DECISIONS.md)
  for why the more obvious OpenMapTiles/Shortbread options don't work for
  this purpose.

## Running locally

Any static file server pointed at `docs/` works, e.g.:

```bash
python3 -m http.server 8123 --directory docs
```

Then open `http://localhost:8123`. (`.claude/launch.json` wires this up for
the Claude Code browser preview tool automatically.)

## Known limitations

- **Stats are viewport-only.** There is no backend aggregation, so the
  percentage shown is only for what's currently rendered on screen, not a
  global total for the visible region.
- **`tunnel.optgeo.org` is a personal/dev endpoint**, not a production CDN,
  and has shown intermittent failures for specific tiles during testing.
  This is a known upstream limitation, not a bug in this app — see
  [DECISIONS.md](DECISIONS.md#8-accept-tunneloptgeoorg-as-a-fragile-dependency-dont-try-to-fix-it).
- **`building_part` features are not used**, only the top-level `building`
  layer. Buildings with `has_parts: true` (e.g. complexes with sections of
  different heights) may have more height data on their parts than their
  outer footprint reflects. Left for a future iteration.
- No editing happens on this site itself — clicking an unmapped building
  links out to the standard [iD editor](https://www.openstreetmap.org/edit),
  by design (see CLAUDE.md's non-goals).

## More context

- [CLAUDE.md](CLAUDE.md) — full background, the OSM-attribution schema
  investigation, and the classification logic, in Japanese.
- [DECISIONS.md](DECISIONS.md) — why each technical choice was made.
- [HANDOVER.md](HANDOVER.md) — current status and open threads for whoever
  picks this up next.

## License

See [LICENSE](LICENSE). Basemap © OpenStreetMap contributors. Buildings via
Overture Maps Foundation.
