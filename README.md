# Doom Arena

A Pronto reference app with a browser-based 3D arena and a Cloudflare Workers release. The mirror carries the runtime sources and keeps the app under `apps/doom`.

The `cd` workflow runs on a `v*` tag or manual dispatch. It builds and publishes the static Worker, then runs `sayt verify@cloudflare` against the returned origin. Configure `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets. No database or signing secret is required for this static release.

From the monorepo root, run `mise x -- just sayt -d apps/doom generate`, then `build`, `lint`, `test`, and `integrate`. A build without deployment is `mise x -- just sayt -d apps/doom release@cloudflare --snapshot`.

[[docs/index|Documentation]] · [[brief|Product brief]] · [[ir.html|Application contract]]
