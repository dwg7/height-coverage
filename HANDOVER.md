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
`/docs`) — live at https://dwg7.github.io/height-coverage/. **However, see
issue #1 below: the buildings layer does not actually load for real
visitors right now** because of an upstream CORS/Cloudflare problem on
`tunnel.optgeo.org`, discovered only after deploying (the dev-loop testing
that validated the classification logic used `curl` checks that happened
to not trigger it). The background map, panel, and stats UI all load fine;
only the building tiles fail.

## Known issues / open threads

1. **BLOCKING: the machine behind `tunnel.optgeo.org` / `jaxa.optgeo.org`
   is offline — the live site's buildings layer currently does not load.**
   Confirmed live on `https://dwg7.github.io/height-coverage/` (a user
   reported CORS console errors). Two earlier theories in this doc's
   history were wrong (one specific tile being flaky; then "any `Origin`
   header gets blocked") — see DECISIONS.md #8 for the full trail. The
   actual cause, confirmed by hfu: `ssh jaxa.optgeo.org` (their normal way
   of reaching that machine, an SSH-over-WebSocket gateway on the same
   host as the Martin tile server) fails with `websocket: bad handshake`,
   and hfu recalled doing network reconfiguration on that machine around
   the same time — so the `cloudflared` tunnel connector most likely just
   hasn't reconnected since. `stars.optgeo.org` (separate, healthy
   infrastructure) is unaffected.

   **This is expected fallout of a network change on hfu's own machine,
   not a mystery outage or a bug in this app** — nothing to fix in this
   repo. Once hfu reconnects that machine's network / restarts
   `cloudflared`, it should resolve itself. Sanity-check with:
   ```bash
   curl -o /dev/null -w '%{http_code}\n' "https://jaxa.optgeo.org/"
   curl -o /dev/null -w '%{http_code}\n' \
     "https://tunnel.optgeo.org/martin/buildings/14/9999/9999"
   ```
   Both return `530` as of this writing (2026-08-30); both should return
   something other than `530` once the machine is back (a real SSH
   handshake / non-cached `200` respectively — that specific tile
   coordinate is picked deliberately because it's out of any real
   geographic range, so a `200` there can only come from a live origin,
   never a stale cache).

   Once it's back, the site should work as already verified during
   development — the classification/rendering/stats logic was confirmed
   correct against real decoded tiles across Vientiane/Paris/London before
   this outage was noticed, and `docs/app.js` now also shows a clear
   in-app message ("Buildings layer unavailable right now...") instead of
   hanging on "Loading…" when the buildings source fails to load, so
   future outages like this are less confusing for visitors.

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
