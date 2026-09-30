# Stage 3 isolated calendar

> Historical rehearsal record. Production cutover completed on 2026-09-27;
> the separate Study API was retired on 2026-09-28. The commands below describe
> the old isolated test environment and must not be used as a production update.
> The old Vultr instance was deleted after the 2026-09-30 migration; its SSH
> tunnel and test port are no longer available.

Stage 3 uses a new copy of the Stage 2 test database and port `127.0.0.1:3103`.
It does not modify the production database, production containers, old Study JSON,
or the Stage 2 container on port 3102.

## Features in this build

- One calendar with a multi-day task form and task list below it.
- User-owned categories with a chosen color, category filters, edit and delete.
- Manual completion; incomplete tasks show `todo` before their start date and
  `doing` afterwards. An overdue label appears past the end date.
- Browser CSRF token for all API writes; login and registration rate limiting.
- Email verification for registration and existing accounts. Isolated mail is
  captured to files and is **not** delivered to real addresses.
- An independent reminder worker uses each verified user's IANA time zone.
  It scans once a minute, includes both end dates, and retries delivery failures
  at most three times. A unique task/date/time constraint prevents duplicate
  schedule records. SMTP cannot guarantee exactly once delivery if the process
  crashes after SMTP accepts a message and before the database marks it sent.

The worker scans the current and prior four minutes. A reminder more than four
minutes late after downtime is skipped. A skipped local time during spring DST
does not send; a repeated local time during fall DST is scheduled once.

## Testing

Historical procedure: after the kit reported `STAGE 3 ISOLATED READY`, an SSH
tunnel to the now-deleted old server exposed `127.0.0.1:3103`. Do not point
this historical test workflow at the current production server. The tester
visited `http://127.0.0.1:3103` and logged in with an existing account. Create a
category and a task spanning several days, change its status, delete the
category, and confirm the task remains uncategorized. Admin user management and
registration approval remain on the page. Stage 2 and production are separate.

For captured email testing, use an address you control. The capture directory
is printed in the kit output. On the server, only root should read its newest
JSON file; the `text` field contains the one-time code. Do not post that code
or the capture file in chat.

## Before production

For the chosen Outlook.com sender, follow [OUTLOOK_MAIL.md](OUTLOOK_MAIL.md)
to authorize Graph delegated mail sending and test delivery to a mailbox you
control. Other SMTP providers remain available when configured. Use
`COOKIE_SECURE=true`, a long independent
`EMAIL_CODE_PEPPER`, and `REQUIRE_VERIFIED_EMAIL=true`. Make a fresh consistent
database backup and run the production migration only after the isolated review.
At the time of this rehearsal, the old Study API route remained live. It was
removed during the later production retirement.
