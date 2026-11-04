This reworks the companion AI assistant's allowances and reliability, adds web search and server-side memory, and gives admins an AI Logs tool.

**Allowances by tier**
- Three daily allowances per account, set per tier (standard / subscriber / admin) on the Tools admin page: chat (every message; defaults 200/200/500), calendar requests (30/50/200) and web searches (5/30/100).
- Calendar requests and searches count once per message, the first time a message uses them. When one runs out the companion says so with a fixed reply instead of calling the model again.
- The tier is read from the database on each request, so subscription changes apply at once.

**Fallback and refunds**
- The main model (default free `glm-4.7-flash`) answers first. On any failure other than a rejected key, the rest of that message uses the fallback model (default paid `glm-4-flashx-250414`, same key). `thinking` is only sent to GLM 4.5+.
- If both fail, the user sees "AI 服务暂时繁忙" and every allowance the message took is refunded; a failed search refunds only the search. Errors carry a `code` (`disabled`, `quota`, `busy`, `config`), and the panel keeps AI mode on `busy`/`config` instead of dropping to the local guide.

**Web search**
- A `web_search` tool calls Zhipu Web Search (`search_std`, 5 results). Sources are returned to the panel as outbound links.
- Search results are untrusted: within one message, calendar tools are refused after a search and search is refused after calendar tools.

**Memory**
- The last five rounds per account are kept in `assistant_memory`, so a conversation continues across pages and hosts; the browser no longer sends history. "清空对话" in the companion menu clears it.

**AI Logs**
- `assistant_calls` records metadata per message (tier, outcome, allowances counted, tool names, model, fallback, rounds, tokens, searches, duration). `assistant_errors` records every provider or server error with status, provider code, redacted provider text and whether the fallback recovered.
- No conversation text is stored in either table, and both are kept for 30 days.
- New admin APIs `/api/assistant/admin/calls` and `/admin/errors`. New admin-only page `tools.garyhub.uk/ai-logs/` with a 24-hour summary, per-user table, filterable call and error lists; listed in the Tools catalog and companion knowledge.
- The connection test now checks the main model, the fallback model and search separately.

**Compatibility**
- Settings gain columns in place, and the new tables have no foreign keys, so a rollback to v2.2.0.0 still works and account deletion still runs; account deletion clears the new tables.

**Release adapter**
- Registers the v2.3.0.0 adapter against merged main a75a1e3, with the matching no-TOTP variant.
- Phase 3 runs a new `assistant-http.cjs` with a stand-in model and search server.
- Phase 6 checks the AI Logs page and API gates.
- README, project context, release notes and validation records are updated. Production verification remains pending installer output.

**Validation**
- calendar-app: 87/87. lab-service: 85/87; the two failures are the existing Lili/Pudding geometry checks.
- All seven isolated checks pass locally: assistant-http 63, asset-response 53, companion 301, sites 59 and the rest. Notices reach 5 synthetic accounts and are deduplicated.
