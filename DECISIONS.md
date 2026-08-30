# Decisions

A running log of the choices made while building this site and why. See
[CLAUDE.md](CLAUDE.md) for the overall spec/background and [README.md](README.md)
for how to run/use the site. Newest entries at the bottom.

## 1. Don't trust stars.optgeo.org's own `building` layer

Planetiler's `Building.java` bakes a synthetic `render_height` of 5m into
every building that has neither `height` nor `building:levels`. Every
building therefore has *some* render height, so presence of a value cannot
distinguish "mapped" from "unmapped". Ruled out for this project's core
purpose. See `Building.java` link in CLAUDE.md.

## 2. Don't use Shortbread's `buildings` layer

Shortbread schema v1.0's `buildings` layer intentionally carries only
geometry and a meaningless `dummy` field — no height/floor attributes at
all. Not usable today; might be revisited if the schema grows those fields.

## 3. Use taroverture (Overture buildings schema) as the buildings source

`tunnel.optgeo.org/martin/buildings` exposes `height`, `num_floors`,
`@height_source`, `@geometry_source`, and `sources` as independent fields,
which is exactly the kind of provenance information the other two options
lack.

## 4. Empirically verify `sources` / `@height_source` semantics before coding the filter

CLAUDE.md's first draft assumed `@height_source` would cleanly say whether a
building's height/floor data came from OSM. This was unverified (MVT tiles
are binary, couldn't be decoded sight-unseen). Fetched and decoded z14
tiles with `mapbox_vector_tile` (Python) across three areas with very
different data density:

- Vientiane AOI (Chao Anouvong Stadium, 14/12861/7360) — the target of the
  original JICA fieldwork.
- Paris center (14/8299/5636) — assumed height-rich, western European.
- London center (14/8186/5448) — assumed height-rich, English-speaking.

Findings (see CLAUDE.md's "フェーズ0の検証結果" for the Japanese-language
summary with counts):

- `@height_source` is populated (`"OpenStreetMap"` or `"Microsoft ML
  Buildings"`) **only when `height` is present**. It is always `null` when
  a feature has `num_floors` but no `height` — it does not track floor-count
  provenance at all.
- There is no dedicated source field for `num_floors`. Empirically, every
  sampled feature with `num_floors` set had `provider: "osm"` somewhere in
  `sources` (Microsoft/Google AI footprint detection never carries a floor
  count). This is used as a proxy, not a schema guarantee.
- `sources` is a JSON-array-of-objects string. Vientiane's sample only ever
  had a single provider per feature; Paris and London had many features with
  **both** `microsoft` and `osm` fused (Microsoft-detected footprint,
  OSM-sourced height) — so a naive "does the geometry involve OSM" check is
  not equivalent to "is the height/floor value OSM's".

**Resulting filter** (implemented in `docs/app.js` as `IS_OSM_ATTRIBUTED`):

```
(height present AND @height_source == "OpenStreetMap")
  OR
(num_floors present AND "osm" is one of the providers in `sources`)
```

## 5. Add a third, deliberately faint tier for non-OSM footprints

Original design was binary: green (mapped) vs. yellow (unmapped), where
"unmapped" silently absorbed both "OSM building, no height yet" and
"not an OSM building at all, just an AI-detected footprint". A user review
pointed out these are different things and conflating them overstates the
"buildings waiting for input" narrative with footprints nobody in OSM has
even created yet.

Split into three tiers. The third tier (no `osm` in `sources` at all) is
rendered as a flat, very-low-opacity gray (`fill-opacity: 0.08`) — present
for spatial context only, explicitly excluded from the on-screen coverage
percentage, and given a de-emphasized legend row so it doesn't compete with
the actual call to action.

## 6. Nudge toward floor count over exact height in the edit call-to-action

Working hypothesis (from fieldwork experience): counting a building's
storeys is something a surveyor can do by eye on site; measuring exact
height in metres generally requires equipment most volunteer mappers don't
carry. If true, campaigns like this one should ask contributors for
`building:levels`, not `height`.

To make the site itself produce evidence either way, `updateStats()` now
also reports, among currently-mapped (green) buildings in view, what
fraction have `num_floors` vs. `height` set. The click-to-edit popup on
yellow buildings likewise says "Add floor count" first rather than "Add
height", to actually push contributors that direction rather than just
observe passively.

## 7. Static site under `docs/`, deployed via GitHub Pages from `main`

No backend, no build step — plain HTML/CSS/JS loading MapLibre GL JS from a
CDN, fetching the background style and building tiles directly from
`stars.optgeo.org` / `tunnel.optgeo.org` client-side. Simplest possible
deployment for a public awareness site with no dynamic server-side needs.

## 8. `tunnel.optgeo.org`'s origin machine is down (corrected twice — see below)

This entry has been wrong twice while chasing the real cause; keeping both
corrections on record since the debugging trail itself is useful.

**First (wrong) theory:** one specific tile (Paris) was intermittently
flaky. Disproven when a real user hit CORS errors live on GitHub Pages for
the *Vientiane* tile, which this entry had called reliable.

**Second (wrong) theory:** `tunnel.optgeo.org` rejects any request that
carries an `Origin` header, regardless of value — based on `curl` tests
where adding `-H "Origin: ..."` (any value) turned a `200` into a
Cloudflare `530`, while the identical request with no `Origin` succeeded.
This looked 100% reproducible and origin-independent, so it seemed like a
firewall/Access rule keyed on the mere presence of `Origin`.

**Actual cause, confirmed by the site owner:** the machine behind the
tunnel is unreachable. hfu normally reaches it for admin via
`ssh jaxa.optgeo.org` (a WebSocket-tunneled SSH endpoint on the same host
as the `tunnel.optgeo.org` Martin tile server) and that now fails with
`websocket: bad handshake` — i.e. Cloudflare can't complete even a raw
SSH-over-WebSocket upgrade to that origin. Checking DNS confirmed
`jaxa.optgeo.org`, `tunnel.optgeo.org`, and `stars.optgeo.org` all resolve
to the same two Cloudflare anycast IPs (same zone), but:

```bash
curl -o /dev/null -w '%{http_code}\n' "https://jaxa.optgeo.org/"
# -> 530, even with NO Origin header at all
curl -o /dev/null -w '%{http_code}\n' "https://stars.optgeo.org/openstreetmap_jp_planet/14/9999/9999"
# -> 200, a tile coordinate never requested before, no Origin header
curl -o /dev/null -w '%{http_code}\n' -H "Origin: https://dwg7.github.io" \
  "https://stars.optgeo.org/openstreetmap_jp_planet/14/9999/9999"
# -> 200, same tile, WITH a real cross-origin Origin header
```

`stars.optgeo.org` is demonstrably alive (serves brand-new, never-cached
tiles, with or without `Origin`), while `jaxa.optgeo.org` fails even a
plain GET with no `Origin` at all. That rules out "Origin-header-triggered
blocking" as the mechanism — it correlates with Origin in `tunnel.optgeo.org`'s
case purely by coincidence: every "successful" no-Origin response this
session observed for `tunnel.optgeo.org` was a **stale Cloudflare edge
cache hit** left over from this project's own earlier `curl` testing
(without `-H Origin`, which happens not to disturb the cache key for
those specific URLs), not a live round-trip to the origin. Any request
that actually needs to reach the origin — SSH, a brand-new tile
coordinate, `/martin/catalog` — fails with `530` regardless of headers,
because **the origin machine (or its `cloudflared` connector) is simply
not connected to Cloudflare right now.** `stars.optgeo.org` is unaffected
because it runs on separate, currently-healthy infrastructure, not the
same personal machine.

**Decision:** this is an outage on hfu's/Taro M.'s own machine, not a
Cloudflare config issue and not fixable from this app's code at all. Next
step is entirely operational: whoever has physical/remote access to that
host needs to check whether it's powered on and networked, and restart
`cloudflared` (or reboot) if not. See HANDOVER.md for the current status.
No further client-side investigation is useful here — once the tunnel
reconnects, the site should work exactly as verified during development.

## 9. Switch the buildings source to `stars.optgeo.org/overture_buildings` — resolves #8 entirely

Rather than wait on the personal machine behind `tunnel.optgeo.org` to come
back, hfu pointed out that the Overture buildings dataset it was serving
was itself built by smellman (Taro Matsuzawa) — `tunnel.optgeo.org` was
only ever proxying smellman's own tileset, not producing it.

Found that smellman hosts the same dataset directly, as static PMTiles,
at `https://dev.smellman.org/static/overture-latest/` — `buildings.pmtiles`
(168GB) plus `base`, `addresses`, `divisions`, `places`, `transportation`.
Verified before asking anyone to change infrastructure:

- **Same dataset, not just similarly named:** the PMTiles metadata's
  `planetiler:githash` (`0e5588c4a6e8c29a270a33afe8df62027d889604`),
  schema (the `@geometry_source`/`@height_source`/`sources` fields), and
  actual decoded tile contents for Vientiane and Paris sample tiles are
  byte-for-byte identical in substance to what `tunnel.optgeo.org` served
  (e.g. Vientiane: 8631 buildings, 20 with height/floor data, both times).
- **Already correctly configured for browser use:** `curl -r 0-1023` on
  `buildings.pmtiles` returns `206 Partial Content` (range requests work,
  which is how PMTiles avoids downloading the whole 168GB file) and
  `Access-Control-Allow-Origin` reflects whatever `Origin` is sent, with
  `Access-Control-Allow-Credentials: true` — permissive enough to work
  from any site including GitHub Pages, unlike `tunnel.optgeo.org`.

Asked the `stars-21` session (which operates stars.optgeo.org) to proxy
these PMTiles the same way it already proxies other remote sources like
`bvmap` and `openstreetmap_jp_planet` — Martin's `pmtiles.sources`
mechanism, which serves range requests straight through to the remote
file with no local copy or extra storage/bandwidth cost. hfu confirmed
this with stars-21 directly. Result: six new sources are live —
`stars.optgeo.org/{overture_buildings,overture_base,overture_addresses,overture_divisions,overture_places,overture_transportation}`.

Re-verified independently after the switch: `overture_buildings`'s
TileJSON matches, a live tile fetch for the same Vientiane coordinate
returns the exact same byte count (2,477,274 bytes) as the original
`tunnel.optgeo.org` fetch from earlier in this project, and decodes to the
same 8631/20 building counts. `docs/app.js`'s `BUILDINGS_URL` now points
here instead of `tunnel.optgeo.org`.

**Why this is strictly better than the old setup**, beyond just fixing the
outage: this data no longer depends on any personal machine staying
online and its Cloudflare Tunnel staying connected — it's proxied
straight from smellman's own host, with stars.optgeo.org (already a more
established piece of shared infrastructure this project depends on
anyway for the background layer) as the single point of contact instead
of two separate personal endpoints.

### Addendum: globe projection + fill-extrusion breaks viewport stats

Around the same time as the buildings-source switch above, also upgraded
MapLibre GL JS from 4.7.1 to 6.6.0 (the user's request — "かなり古いよね" —
it really was, and a major-version jump was needed since 5.x/6.x moved
fast) and enabled globe projection (`style.projection = {type: "globe"}`)
on the reasoning that a tool explicitly framed as worldwide, not tied to
one region, should look the part when zoomed out; MapLibre fades a globe
back to flat mercator by about zoom 5 regardless, so it was assumed to be
a purely cosmetic, zero-risk addition. v6 also **dropped the UMD bundle
entirely** — it ships ESM-only now (`maplibre-gl.mjs`, no more
`window.maplibregl` global) — so `docs/index.html`'s script tag became
`<script type="module" src="app.js">` and `app.js` gained a top-of-file
`import * as maplibregl from ".../maplibre-gl.mjs"`. Separately, took the
opportunity to switch `hash: true` to `hash: "map"` so the URL fragment
is namespaced (`#map=z/lat/lng/bearing/pitch`) instead of a bare,
collision-prone hash.

That "purely cosmetic" assumption about globe was wrong. After this
upgrade and switching the buildings source to
`stars.optgeo.org/overture_buildings`, a user reported the stats panel's
"N with height data" count reading `0` no matter where they panned —
including locations independently confirmed (by decoding the same
PMTiles directly in Python) to have OSM-attributed buildings within
~150m of the view center. So this wasn't data sparsity.

Debugging trail:

1. First fix: `queryRenderedFeatures()` called with no geometry argument
   (the "whole viewport" shortcut) turned out to depend on
   `zoomLevelsToOverscale`, whose default changed in v6. Setting it back
   to `undefined` fixed the *total* count (green+yellow) going from 0 to
   the expected ~2000 buildings at zoom 16 (past the source's maxzoom 14)
   — but the green-specific count stayed at 0.
2. Second fix attempt: passed an explicit full-canvas bounding box to
   `queryRenderedFeatures()` instead of omitting the geometry argument
   entirely, on the theory that the "no geometry" shortcut specifically
   mishandles the `fill-extrusion` layer (`buildings-input`) even though
   the flat `fill` layers (`buildings-not-input`, `buildings-non-osm`)
   were fine. This didn't fix it either.
3. User hypothesis, confirmed by disabling globe: **globe projection
   plus a `fill-extrusion` layer breaks `queryRenderedFeatures()`'s
   viewport-wide query for that layer specifically**, even at zoom levels
   where MapLibre has already faded the render to flat mercator (globe
   only affects rendering below ~zoom 5, per MapLibre's docs). The layer
   still renders correctly, and a point-based query
   (`queryRenderedFeatures(point, {...})`, used by the hover panel) works
   fine against it — only the geometry-less/bbox viewport query breaks,
   and only for `fill-extrusion`. This lines up with a MapLibre v6.1.0
   changelog entry, "Fix 3D buildings disappearing when the camera
   pitches up to look near the horizon, by growing tile-culling bounds"
   — plausibly that fix covers the renderer's tile-culling calculation
   but not `queryRenderedFeatures()`'s separate one, for globe mode
   specifically.

**Decision:** keep globe (worth it for this being an explicitly
worldwide, not-tied-to-one-region tool), and render the green
"OSM-attributed" layer as flat `fill` instead of `fill-extrusion` rather
than give up on globe. All three building layers are flat fills now; the
original "green extruded in 3D" design (CLAUDE.md's original framing)
is dropped in favor of correct stats. Verified by the user directly:
disabling globe alone fixed the count (confirming the mechanism), then
re-enabling globe with `buildings-input` switched to `fill` also fixed
it while keeping the globe view.

## 10. Switch the background style to Positron, hosted upstream on `stars`

The original background style (`stars.optgeo.org/style/openstreetmap_jp_planet`)
was a minimal, custom 15-layer style built just for this project's own use.
Once buildings had their own three-tier coloring, it made sense to upgrade
the background to something more polished — the user wanted a light,
near-monochrome basemap (white, not dark) that wouldn't visually compete
with the green/yellow/gray building fills.

Picked OpenMapTiles' official **Positron** style
(https://github.com/openmaptiles/positron-gl-style) — the light CARTO-style
basemap (background `rgb(242,243,240)`, muted grays throughout, no bright
colors), 50 layers, actively maintained. Confirmed schema compatibility
before committing to it: every source-layer Positron references (`aeroway`,
`boundary`, `building`, `landcover`, `landuse`, `park`, `place`,
`transportation`, `transportation_name`, `water`, `water_name`, `waterway`)
already exists in `openstreetmap_jp_planet`'s TileJSON `vector_layers`.

Rather than vendor a copy in this repo or fetch it from GitHub at runtime
(a third-party dependency this project doesn't control), asked the
`stars.optgeo.org` operator (the same peer session that hosts the
buildings proxy from decision #9) to host an adapted copy, the same way
their existing styles work. Opened
[hfu/stars#5](https://github.com/hfu/stars/pull/5) against their repo,
per its `CONTRIBUTING.md` gatekeeper flow:

- **Commit 1**: rewrote exactly two fields from the untouched upstream
  file — `sources.openmaptiles.url` (MapTiler's key-gated endpoint →
  `stars.optgeo.org/openstreetmap_jp_planet`) and `glyphs` (MapTiler's
  key-gated font URL → `tile.openstreetmap.jp`'s, matching what the
  existing `openstreetmap_jp_planet.json` style already uses). Diffed
  against a pretty-printed copy of the unmodified upstream to confirm
  only those two fields differed before opening the PR.
- **Commit 2**: added `["!=", ["get", "maritime"], 1]` to the three
  country/state boundary layers. Missed this in the first pass — the user
  had specifically asked for undersea EEZ/maritime boundary lines to be
  dropped as visual noise (and, in contested waters, a form of political
  content this project explicitly wants to stay out of — see CLAUDE.md's
  framing on staying apolitical). `maritime` is a standard OpenMapTiles
  `boundary` field, confirmed present on `openstreetmap_jp_planet`'s
  `boundary` source-layer; the `!=` comparison leaves untagged (land)
  boundaries untouched.

The gatekeeper session reviewed both commits independently (downloaded
upstream itself and diffed programmatically, rather than trusting the PR
description) before merging — because it was a *new* file, Martin needed
a restart to pick it up (existing-file updates apparently don't need
that; new files are only discovered via Martin's startup directory scan).
Now live at `https://stars.optgeo.org/style/positron`; `BASE_STYLE_URL`
in `docs/app.js` points there.

## 11. Collapsible info panel + a hover panel scoped to only the fields that matter

The top-left info panel (legend + stats) can be collapsed to just its
header — useful once you already know what the colors mean and want the
map itself unobstructed.

Added a second, bottom-left panel that shows the raw attributes of
whichever building is under the cursor, for spot-checking *why* a
building was classified the way it was without opening devtools. First
pass showed every property on the feature (`sources`, `@geometry_source`,
`id`, `version`, ...) — trimmed down after review to only what
`IS_OSM_ATTRIBUTED` actually reads: `num_floors`, `height`, and
`@height_source` (and the latter only when it's *not* `"OpenStreetMap"` —
when it is, the building is green by definition and the field is
redundant; it only earns its place for the rarer case of a
non-OSM-attributed height, e.g. Microsoft ML Buildings, which otherwise
renders identically to "no height at all"). Kept deliberately tiny
(no title, ~220px max width) so it can't crowd out the map.
