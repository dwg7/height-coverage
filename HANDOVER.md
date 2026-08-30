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

Not yet deployed — GitHub Pages needs to be enabled for this repo (Settings
→ Pages → Deploy from a branch → `main` / `docs`), and this session's
changes need to be pushed for that to take effect. Was authorized to push
in this session; check `git log` / `git status` to see if that already
happened by the time you're reading this.

## Known issues / open threads

1. **`tunnel.optgeo.org` intermittent failures.** During testing, the Paris
   center tile (`14/8299/5636`) reliably 530'd from Cloudflare when
   requested with an `Origin` header (i.e. from a real browser context),
   while the same URL succeeded without one, and an unrelated tile
   (Vientiane) succeeded either way. Documented as an accepted upstream
   limitation (DECISIONS.md #8), not something this app works around. If
   this recurs for other cities/tiles, it's worth spot-checking with:
   ```bash
   curl -o /dev/null -w '%{http_code}\n' -H "Origin: https://dwg7.github.io" \
     "https://tunnel.optgeo.org/martin/buildings/{z}/{x}/{y}"
   ```
   before assuming it's a regression in this code.

2. **`building_part` unused.** taroverture's `building_part` layer often has
   *more* height coverage than the parent `building` footprint (observed
   96% in London vs. 41% on `building` alone) — likely because
   multi-section buildings get per-section height/levels tags in OSM. This
   site currently ignores it entirely for simplicity. Worth a follow-up if
   the "waiting for input" framing needs to account for buildings that are
   already partially mapped via their parts.

3. **No automated tests.** Verification so far is manual browser QA only.
   If this project grows, consider at least a smoke test that fetches the
   base style + a known tile and asserts the classification counts are
   sane (regression guard against taroverture schema changes upstream).

4. **Only tested in the Claude Code browser preview tool** (Chromium-based).
   Hasn't been checked on mobile viewports or Safari/Firefox.

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
