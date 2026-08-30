# Handover

Status as of this session, for whoever (human or Claude) picks this up next.
Read [CLAUDE.md](CLAUDE.md) first for the spec/background, then
[DECISIONS.md](DECISIONS.md) for why things are built the way they are.

## Current state

Live and working: https://dwg7.github.io/height-coverage/ — a static
MapLibre GL JS 6.6.0 page (`docs/index.html` + `docs/app.js`, loaded as an
ES module, no build step). Confirmed working end-to-end this session,
including by the user directly in a real browser (this session's own
browser automation tool became unusable partway through — see the caveat
at the bottom of this file):

- Background: `stars.optgeo.org`'s `positron` style (OpenMapTiles'
  official light/near-monochrome basemap, adapted for stars — see
  [hfu/stars#5](https://github.com/hfu/stars/pull/5) — with maritime
  boundary lines filtered out).
- Buildings: `stars.optgeo.org/overture_buildings`, split into three flat
  fill layers (green/yellow/faint-gray) per [DECISIONS.md](DECISIONS.md)
  #4-5. Globe projection is on; all three layers had to be flat fills, not
  fill-extrusion, because of a MapLibre v6 + globe query bug — see
  DECISIONS.md #9's addendum.
- Viewport stats panel (collapsible) with the floor-count-vs-height
  breakdown, and a small hover panel showing the classification-relevant
  raw attributes of whatever building is under the cursor. See
  DECISIONS.md #11.
- Click-to-edit popup on yellow buildings linking to the iD editor,
  nudging toward floor count over exact height.

## This session's arc, briefly

Roughly in order: built the MVP (three-tier classification, verified
against real decoded tiles across Vientiane/Paris/London) → deployed to
GitHub Pages → the buildings tile source (`tunnel.optgeo.org`, hfu's
personal Cloudflare Tunnel) went offline mid-session from an unrelated
network change on that machine → traced it to the actual origin machine
(not a CORS/Access-policy issue, two wrong theories along the way, see
DECISIONS.md #8) → switched to `stars.optgeo.org/overture_buildings`,
which proxies the same dataset from smellman's own hosting, removing the
dependency on a single personal machine (DECISIONS.md #9) → added the
collapsible/hover UI panels → upgraded MapLibre 4.7.1 → 6.6.0 and turned
on globe projection → that combination broke viewport-wide stats querying
for the green layer specifically, took a few wrong turns to pin down
(zoomLevelsToOverscale, then an explicit bbox, then finally identifying
globe + fill-extrusion as the actual mechanism) → fixed by keeping globe
and rendering green as flat fill instead of extruded (DECISIONS.md #9
addendum) → upgraded the background from a minimal custom style to
OpenMapTiles' Positron, hosted on `stars.optgeo.org` via a PR to
`hfu/stars` (DECISIONS.md #10).

## Known issues / open threads

1. **`building_part` unused.** taroverture's `building_part` layer often
   has *more* height coverage than the parent `building` footprint
   (observed 96% in London vs. 41% on `building` alone) — likely because
   multi-section buildings get per-section height/levels tags in OSM.
   This site currently ignores it entirely for simplicity. Worth a
   follow-up if the "waiting for input" framing needs to account for
   buildings that are already partially mapped via their parts.

2. **No automated tests.** Verification so far is manual browser QA
   (plus, this session, independent Python verification of the raw tile
   data — see DECISIONS.md #4 and #9 — used specifically *because* the
   browser tool became unreliable). If this project grows, consider at
   least a smoke test that fetches the base style + a known tile and
   asserts the classification counts are sane (regression guard against
   upstream schema changes).

3. **This session's browser automation tool degraded badly and never
   recovered.** After extended use (many tabs, many hours), it reached a
   state where it could not load *any* MapLibre map — confirmed by
   testing MapLibre's own official demo style in complete isolation, in a
   freshly restarted browser process, with no other tabs open. Basic
   WebGL2 and Worker/module-Worker capability all checked out fine
   individually; the failure was specific to MapLibre's init pipeline
   never completing (`isStyleLoaded()` stuck `false` indefinitely, no
   error thrown). Several fixes in the back half of this session
   (queryRenderedFeatures behavior, the globe/fill-extrusion bug, the
   Positron style swap) were therefore verified by *reasoning + targeted
   Python-side data checks* rather than a live screenshot, with the user
   confirming the actual visual result in their own separate browser. If
   a future session sees a stuck "Loading buildings in view…" or a map
   that never renders, try a brand new tab and a fully restarted preview
   server before assuming the app or a tile source regressed — and if
   that doesn't help either, don't keep spending cycles on it; ask the
   user to check in their own browser instead, the way this session
   eventually did.

## Things intentionally left out of scope (see CLAUDE.md's 非目標)

- No in-site editing — by design, links out to iD instead.
- No backend / global aggregation of coverage stats — viewport-only,
  intentionally, to keep this a static site with zero infrastructure.
- No hardcoded place name in the tool's core logic — Vientiane is only the
  *default* view (see `DEFAULT_VIEW` in `docs/app.js`), not baked into the
  classification or rendering logic.
- No 3D building extrusion — dropped this session in favor of correct
  stats with globe projection on; see DECISIONS.md #9's addendum.

## How to resume local development

```bash
python3 -m http.server 8123 --directory docs
```

or, if using Claude Code's browser preview tooling, `.claude/launch.json`
already wires up a `docs-server` configuration for this. Because
`app.js` is an ES module, browsers can cache it more aggressively across
reloads than a classic script — append a cache-busting query string
(`?v=2`) when iterating and not seeing your edits take effect.

## Who to talk to about shared infrastructure

Two pieces of this depend on infrastructure this repo doesn't own:

- **`stars.optgeo.org`** (background style + buildings proxy): operated
  by a separate Claude Code session named `stars-21` in this environment
  (its own repo is `hfu/stars`, contribution flow documented in that
  repo's `CONTRIBUTING.md`). This session reached it via `SendMessage` to
  `stars-21` and, for the Positron style, by opening
  [hfu/stars#5](https://github.com/hfu/stars/pull/5) directly.
- **`dev.smellman.org`** (the actual origin of the Overture buildings
  PMTiles that `stars.optgeo.org/overture_buildings` proxies): smellman's
  (Taro Matsuzawa's) own server, reached only indirectly via the stars
  proxy — nothing in this project talks to it directly.
