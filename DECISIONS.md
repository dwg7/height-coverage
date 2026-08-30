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

## 8. `tunnel.optgeo.org` blocks every request that carries an `Origin` header (correction: not "flaky", 100% reproducible)

An earlier version of this entry mischaracterized this as one specific
tile (Paris) being intermittently flaky. That was wrong — the real user
hit this live on GitHub Pages (dwg7.github.io) for the *Vientiane* tile,
which this entry had claimed was reliable. Re-tested properly and found
the actual, 100%-reproducible rule:

```bash
curl -o /dev/null -w '%{http_code}\n' "https://tunnel.optgeo.org/martin/buildings/14/12861/7360"
# -> 200
curl -o /dev/null -w '%{http_code}\n' -H "Origin: https://dwg7.github.io" \
  "https://tunnel.optgeo.org/martin/buildings/14/12861/7360"
# -> 530
curl -o /dev/null -w '%{http_code}\n' -H "Origin: https://example.com" \
  "https://tunnel.optgeo.org/martin/buildings/14/12861/7360"
# -> 530 (any Origin value, not just github.io)
```

Confirmed this is independent of Cloudflare caching by hitting a tile
coordinate that had never been requested before (`14/9999/9999`) and the
`/martin/catalog` metadata endpoint: both succeed with no `Origin` header
and both fail (`530`, a Cloudflare edge-level "couldn't reach origin"
error) the instant any `Origin` header is present, regardless of its
value.

**Since every real cross-origin browser `fetch()` always sends an `Origin`
header, this means tunnel.optgeo.org cannot currently serve tiles to any
real website's client-side JS at all** — not to dwg7.github.io, not to
any other domain. It coincidentally "worked" during this project's own
dev-loop testing only because those checks used `curl` without an
explicit `Origin` header, or hit Cloudflare's cache from an earlier such
request.

Root cause is outside this repo: almost certainly a Cloudflare Access
policy or WAF/firewall rule in front of the `cloudflared` tunnel that
rejects Origin-bearing requests, configured on the `tunnel.optgeo.org`
side (Taro M.'s infrastructure), not something fixable from this app's
code. Decision: this needs to be raised with whoever administers that
Cloudflare zone — see HANDOVER.md for the current ask. No client-side
workaround exists (a request without `Origin` cannot be made from
browser JS to a cross-origin URL).
