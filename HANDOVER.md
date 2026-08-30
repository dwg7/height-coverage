# Handover

Status as of this session, for whoever (human or Claude) picks this up next.
Read [CLAUDE.md](CLAUDE.md) first for the spec/background, then
[DECISIONS.md](DECISIONS.md) for why things are built the way they are.

## Current state

MVP is built and working: `docs/index.html` + `docs/app.js`, a static
MapLibre GL JS page with no build step. Manually verified in-browser
(Claude's browser preview tool, `http.server` on `docs/`) that:

- The background style loads from `stars.optgeo.org` with its own
  `building` layer stripped out.
- The three-tier building classification (green/yellow/faint-gray) renders
  correctly for the Vientiane AOI, with sane counts (roughly 0.2% mapped,
  matching the premise of the whole site).
- The viewport stats panel updates on `moveend` and shows the floor-count
  vs. exact-height breakdown.
- Clicking a yellow building opens a popup linking out to the iD editor.

Deployed: pushed to `main` and GitHub Pages enabled (branch `main`, path
`/docs`) — live at https://dwg7.github.io/height-coverage/.

**Update:** the buildings source was switched from `tunnel.optgeo.org`
(hfu's personal Cloudflare Tunnel, which went offline mid-session after a
network reconfiguration — see DECISIONS.md #8 for that whole debugging
trail, including two wrong theories along the way) to
`stars.optgeo.org/overture_buildings`, which proxies the same dataset
directly from smellman's (Taro Matsuzawa's) own PMTiles hosting at
`dev.smellman.org`. Verified independently: identical schema, identical
`planetiler:githash`, byte-identical tile content for the Vientiane sample
coordinate. See DECISIONS.md #9. `docs/app.js`'s `BUILDINGS_URL` now
points at the new source; this is no longer a known issue, just history.

## Known issues / open threads

1. **`building_part` unused.** taroverture's `building_part` layer often has
   *more* height coverage than the parent `building` footprint (observed
   96% in London vs. 41% on `building` alone) — likely because
   multi-section buildings get per-section height/levels tags in OSM. This
   site currently ignores it entirely for simplicity. Worth a follow-up if
   the "waiting for input" framing needs to account for buildings that are
   already partially mapped via their parts.

2. **No automated tests.** Verification so far is manual browser QA only.
   If this project grows, consider at least a smoke test that fetches the
   base style + a known tile and asserts the classification counts are
   sane (regression guard against taroverture schema changes upstream).

3. **Only tested in the Claude Code browser preview tool** (Chromium-based).
   Hasn't been checked on mobile viewports or Safari/Firefox. Also, that
   browser tool itself became unreliable after extended use in this
   session — tabs would get stuck with MapLibre's style/worker pipeline
   never completing, unrelated to the actual site or tile server (the
   real, deployed GitHub Pages site worked fine once given enough patience
   or a fresh tab). If a future session sees the map stuck on "Loading
   buildings in view…" for a long time, try a brand new tab / restarted
   preview server before assuming the app or tile source regressed.

## Things intentionally left out of scope (see CLAUDE.md's 非目標)

- No in-site editing — by design, links out to iD instead.
- No backend / global aggregation of coverage stats — viewport-only,
  intentionally, to keep this a static site with zero infrastructure.
- No hardcoded place name in the tool's core logic — Vientiane is only the
  *default* view (see `DEFAULT_VIEW` in `docs/app.js`), not baked into the
  classification or rendering logic.

## How to resume local development

```bash
python3 -m http.server 8123 --directory docs
```

or, if using Claude Code's browser preview tooling, `.claude/launch.json`
already wires up a `docs-server` configuration for this.
