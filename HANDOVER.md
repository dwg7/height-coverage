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

1. **BLOCKING: `tunnel.optgeo.org` rejects every Origin-bearing request —
   the live site's buildings layer currently does not load for real users.**
   Confirmed live on `https://dwg7.github.io/height-coverage/` (a user
   reported CORS console errors) and root-caused: any request to
   `tunnel.optgeo.org` that carries an `Origin` header — any value at all,
   not just github.io's — gets `530` from Cloudflare, while the identical
   request with no `Origin` header succeeds. Verified this holds even for
   a never-before-fetched tile and for `/martin/catalog`, so it isn't a
   caching artifact. See DECISIONS.md #8 for the full curl transcript.

   Since every real browser `fetch()` to a cross-origin URL always sends
   `Origin`, **this cannot be worked around from this app's client-side
   code.** It needs to be fixed upstream, on the Cloudflare
   zone/tunnel/Access config in front of `tunnel.optgeo.org` — almost
   certainly a WAF/Access rule that's rejecting Origin-bearing requests.

   **Action needed:** reach out to whoever administers that Cloudflare
   setup (Taro M., per CLAUDE.md) and ask them to check for an Access
   policy or firewall rule blocking requests with an `Origin` header, or
   to add an explicit CORS allow-list. Re-test with:
   ```bash
   curl -o /dev/null -w '%{http_code}\n' -H "Origin: https://dwg7.github.io" \
     "https://tunnel.optgeo.org/martin/buildings/14/12861/7360"
   ```
   This should return `200` once fixed; it returns `530` as of this
   writing (2026-08-30).

   No code changes were made to work around this — there isn't a
   client-side fix. Once the upstream config is corrected, the site
   should work as already verified during development (before this was
   caught, the classification/rendering/stats logic was confirmed correct
   against real decoded tiles across Vientiane/Paris/London).

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
