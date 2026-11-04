# GaryHub v2.3.0.0-r1 validation

Run on Windows 11 with Python 3.10 and Git 2.52; Node suites ran in WSL Ubuntu 22.04 on official Node v20.20.2 (servers, syntax) and v22.23.4 (tests that use `node:sqlite`), with calendar-app dependencies from `npm ci --build-from-source`.

- calendar-app `node --test`: 87 pass, 0 fail. The assistant suite now covers:
  - server memory (previous round and card summary, five-round window, clearing; browser history ignored);
  - fallback from `glm-4.7-flash` to `glm-4-flashx-250414` after a 429/1302, without `thinking` on the fallback;
  - both models failing → `busy`, nothing counted; 401 → `config`, no fallback;
  - web search with sources; calendar tools refused after a search; a failed search refunded;
  - data allowance exhausted → fixed reply without another model call; search 0 → no search tool; chat allowance exhausted → `quota`;
  - per-tier limits (standard, subscriber, admin);
  - admin call and error logs with metadata only, errors linked to calls; connection test per model and search;
  - the key absent from every response and redacted from provider text; repeatable migration; quota defaults.
- lab-service `node --test`: 85 pass, 2 fail — the pre-existing Lili/Pudding harness-ring geometry checks.
- Local stand-in for phase 3 (seeded synthetic accounts, Calendar and Tools/Lab on Node 20, stand-in model and search server), all seven configured checks in order: useful 29, study 19, asset-response 53, music 25, companion 301, sites 59, assistant 63 — all pass. The release notice reached 5 accounts including admins (20 notices); a second run reported `alreadyPublished`.
- The first local run failed `asset-response.cjs` with 403: it signs in as a member, and `/ai-logs/` is admin-only. The page moved to a separate `admin_asset_checksums` list that the deploy verifier checks by container hash and login gate; `assistant-http.cjs` checks guest 302, member 403 and admin 200.
- The no-TOTP overrides keep their original 7-line (`server.cjs`) and 12-line (`app.js`) differences. The companion bundle, dictionaries, tool catalog and auth-redirect list are identical in both services.
- Browser: companion demo with a stand-in assistant (search chip, disclosure, add card with remaining calendar requests, search answer with outbound source links, busy error keeps AI mode, clear conversation); AI Logs page rendered from stand-in API data (DOM check).

Not run locally: real model and search calls (need the admin's key), outbound HTTPS from the production Calendar container, the Docker-network phase 3 and the phase-6 HTTPS verifier. The installer runs the isolated checks inside both new images before any switch and stops without deploying if one fails. No production connection or real GitHub push/merge is performed.
