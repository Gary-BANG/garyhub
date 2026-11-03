This adds an AI schedule assistant to the site companion. Signed-in accounts can ask in a sentence to see, add or delete their own calendar items, for example "group meeting tomorrow at 3 pm" or "what is on this week".

**How the assistant works**
- Calendar's new `assistant-api.js` sends the message to an OpenAI-compatible chat-completions model. The default is Zhipu `glm-4.7-flash` with thinking off; Z.ai is the other choice.
- Along with the message it sends the account's date and time zone and four tools: `list_tasks`, `add_task`, `delete_task` and `open_page`.
- Reads run immediately. Additions and deletions are stored only as pending actions, and Calendar writes them, through the form's existing validation and the new shared `createTask`, after the owner presses Confirm in the companion.
- Each pending action expires after 15 minutes, applies at most once, and only the account that created it can confirm it.
- Tool errors go back to the model instead of failing the request.
- Usage is capped per account per day.

**Admin settings and key handling**
- An admin sets the provider, model, API key and daily limit on a new card on the Tools admin page, and can test the connection there.
- The key stays in `calendar.sqlite`. It is never returned to a browser and never logged, and provider error bodies are reduced to fixed messages.
- The assistant is off until a key is saved.

**Companion and Tools/Lab changes**
- Tools/Lab forwards the assistant routes for every host with the existing origin check and shared session. Chat and test requests get a longer upstream timeout.
- The companion loads a small `assistant.js` client.
- `panel.js` switches to AI mode for signed-in accounts when the assistant is on. It shows a disclosure, then confirmation cards, then the remaining-quota note, and falls back to the local guide on any failure.
- A confirmation emits `garyhub:records-changed`, so the Calendar home page reloads its tasks.
- The new usage and action tables have no foreign keys, so a rollback to v2.1.0.0 keeps account deletion working; account deletion clears them explicitly.

**Release adapter**
- Register the v2.2.0.0 adapter against merged main 62f430a, with the matching no-TOTP variant.
- Phase 3 adds `assistant-http.cjs`, which starts a stand-in model inside the Calendar test container.
- Phase 6 checks the assistant's login, origin and admin gates on every host.
- README, project context, release notes and validation records are updated. Production verification remains pending installer output.

**Fixes**
- `companion-brain.test.cjs` now uses `knowledge.permitted`, so v2.1.0.0's `public` Elsewhere entry is no longer counted as restricted.

**Validation**
- calendar-app: 86/86. lab-service: 85/87. The two failures are the Lili/Pudding harness-ring geometry checks, which predate this change.
- Locally, against real Calendar and Tools/Lab processes with seeded accounts and a stand-in model: assistant-http (36), asset-response (45), companion-http (301) and music-http (25) pass. Release notices reach 5 synthetic accounts and are deduplicated.
- The companion panel was checked in the browser with a stand-in assistant.
