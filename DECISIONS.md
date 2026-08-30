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

## 8. Accept `tunnel.optgeo.org` as a fragile dependency, don't try to fix it

While testing, one specific tile (Paris center) reliably returned
Cloudflare error 530 when requested with a browser-like `Origin` header,
while the exact same URL returned 200 without one, and while an
unrelated tile (Vientiane) returned 200 in both cases. This points to
edge-cached failure state at Cloudflare for that one tile/origin
combination, not a bug in this app's code — `tunnel.optgeo.org` is
explicitly a personal/dev tunnel (per its name and per CLAUDE.md's
description of its maintainer), not a production CDN.

Decision: document this as a known limitation (see CLAUDE.md and
HANDOVER.md) rather than working around it client-side (e.g. with retries
or a fallback tile source) for the MVP. If/when this site needs to be
production-grade, taroverture should move to hosting with real SLA
guarantees.
