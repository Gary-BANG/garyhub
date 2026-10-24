# Fix mouse hover in Tools (v1.4.0.1)

A mouse could produce no hover response when the primary input capability query reported no hover or no fine pointer, while Tab focus still selected the tool. Respond to actual pointer and mouse entry/movement instead of gating the handler and animation on primary-device media queries. Remove the coarse-device CSS transform override, retain touch compatibility-event filtering and reduced-motion behavior, and invalidate pointer geometry after scrolling.

The release requires deployed v1.4.0.0 and retains both capability variants. Reuse the existing updater with a small version-specific adapter; verify exact fixed JS/CSS bytes over HTTPS and version their HTML references. Include install/rollback/source-import entry points, a tools-scoped repair notice and current project/validation records.

Validation: controlled reproduction of the old failure; 12 catalog/DOM tests including 5 new input regressions; Node20 HTTP for both variants with existing login, CSP, 49 distribution assertions and publication deduplication; 14 adapter/rollback protections. Browser connection unavailable: real visual/mouse/frame-rate acceptance remains unverified. Source only; production and GitHub merge status are separate.
