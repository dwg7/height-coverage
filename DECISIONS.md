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
