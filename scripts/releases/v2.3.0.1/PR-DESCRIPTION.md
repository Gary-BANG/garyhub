This fixes the companion assistant for models that always think, such as `glm-5.3-flash` and `glm-5.3-flashx`. Zhipu currently gives new accounts token packages for these two models.

With `glm-5.3-flash` as the main model, the admin connection test failed. Zhipu answered HTTP 400 with code 1210: "该模型始终思考，不支持关闭思考；请使用 low、high 或 max" (the model always thinks and cannot switch thinking off; use low, high or max). Every GLM 4.5+ request was sending `thinking: {type: "disabled"}`.

**What changed in `complete()`**
- `glm-5.3*` models get `reasoning_effort: "low"` instead of `thinking`, with 2048 more `max_tokens` to leave room for the reasoning.
- Other GLM 4.5+ models still switch thinking off.
- If any other model refuses the switch the same way (400 with "思考", "thinking" or "reasoning" in the message), the request is retried once with `reasoning_effort` within its time budget. The model is then remembered in the Calendar process. The retry is not logged as an error and does not trigger the fallback model; other 400s still do.
- No schema, route or UI change. Version and asset `?v=` move to 2.3.0.1.

**Release adapter**
- Registers the v2.3.0.1 adapter on top of the v2.3.0.0 commit e89fc65, reusing v2.3.0.0's seven isolated checks.
- The no-TOTP overrides keep their 7- and 12-line differences.
- README, project context, release notes and validation records are updated. Production verification remains pending installer output.

**Validation**
- calendar-app: 87/87.
- lab-service: 85/87. The two failures are the existing Lili/Pudding geometry checks.
- All seven isolated checks pass locally. Notices reach 5 synthetic accounts and are deduplicated.
