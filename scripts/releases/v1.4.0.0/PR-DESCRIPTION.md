# Searchable Tools icon grid and Dock (v1.4.0.0)

Tools now has a compact SVG icon grid and optional single-row Dock, with distance-based magnification, bilingual search, names and descriptions, saved layout preference, keyboard navigation and touch/reduced-motion behavior. Existing destinations, shared sign-in, themes and the animated background are retained.

This release requires deployed v1.3.6.1 and explicitly supports the existing with/without-TOTP capability variants. It reuses the reviewed updater, adds a version-specific adapter and HTTPS checks, and includes install, rollback and protected source-import entry points. The shared builder accepts an optional source commit title; older adapters are unchanged.

Validation: 7 catalog/DOM tests; both variants on Node20 with new Dock HTTP checks, 29 tool checks, 49 distribution assertions and notification idempotency; 15 adapter/rollback protections; affected auth and notification regressions. Final package hashes, baselines, PowerShell and isolated Git-import checks are required before delivery. Browser connection was unavailable, so desktop/mobile visual and frame-rate acceptance remains pending. See docs/GARYHUB_V1_4_0_0_TESTS.md.

Source prepared and automated checks passed. No production deployment or real recipient count is claimed. Maintainer reviews and merges main separately.
