# GaryHub v2.3.0.1-r1 validation

Same environment as v2.3.0.0: WSL Ubuntu 22.04 with official Node v20.20.2 (servers, syntax) and v22.23.4 (`node:sqlite` tests).

- calendar-app `node --test`: 87 pass, 0 fail. New assistant assertions:
  - `glm-5.3-flash` requests carry `reasoning_effort: "low"`, no `thinking`, and `max_tokens` 3072.
  - A model that refuses `thinking: disabled` with 400/1210 ("always thinks") is retried within the same request using `reasoning_effort`. The retry logs no error and does not switch to the fallback, and the model's next message uses `reasoning_effort` directly.
  - Any other 400 still moves to the fallback model.
- lab-service `node --test`: 85 pass, 2 fail. The failures are the pre-existing Lili/Pudding geometry checks.
- Local stand-in for phase 3 ran all seven checks inherited from v2.3.0.0, with asset hashes recomputed for 2.3.0.1, and all passed:
  - useful 29
  - study 19
  - asset-response 53
  - music 25
  - companion 301
  - sites 59
  - assistant 63
- Release notices reached 5 accounts including admins (10 notices); a second run reported `alreadyPublished`.
- The no-TOTP overrides keep their original 7-line and 12-line differences.

Not run locally:
- Real GLM-5.3 calls, including their tool-call format.
- The Docker-network phase 3.
- The phase-6 HTTPS verifier.
