Add a project-based bilingual Research Dictionary for maintaining precise research terminology while editing papers and READMEs. Tools links to the Calendar-hosted page; shared sign-in protects per-user projects. A two-row header and wide detail pane support search, tags, manual entry editing, contextual Prompt downloads and JSON import/export.

Import preview distinguishes exact duplicates, compatible additions and ambiguous/multi-sense conflicts. Explicit choices protect manual edits; revisions and retry receipts prevent lost updates and duplicate writes. The last import can be undone before subsequent changes. The additive SQLite tables participate in account deletion and current backups.

Registers v1.4.1.0 against reviewed main 637d86f (v1.4.0.1), using the existing overlay builder and backup/cutover/rollback runtime with reviewed TOTP/no-TOTP entry-point variants. The adapter verifies live assets and private API authentication. Includes isolated Node 20 HTTP tests, real Chromium desktop/mobile checks, import/migration tests, deployment protection tests and package validation.

Source-prepared and locally validated. No GitHub merge or production deployment is claimed. The upgrade ZIP includes install, rollback and safe review-branch source-import entry points.
