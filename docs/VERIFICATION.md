# Release snapshot verification — 0.1.4

Verified on macOS arm64 on 2026-10-16.

- `npm test`: all eight Node test groups passed.
- `npm run test:native`: standalone Electron startup, real window input, state animations, output escaping and explicit show/hide passed.
- `npm run test:treasure-native`: independent total-credit chest and gifted-credit pouch, real native clicks, view switching, currency separation, decimal precision, focus, refresh and account clearing passed.
- `npm run build:plugin`: companion package built successfully.
- `npm run package:mac`: macOS application and local ZIP built; strict code-sign verification passed. Local ad-hoc signing is not Apple notarization.

## Publishing privacy checks

This snapshot starts a new Git history with a GitHub noreply author address. It includes product source, required assets, tests, documentation and licenses. Personal recordings, cloned-voice samples, production videos, original local Git history, installation notes, real account/session data and runtime credentials are excluded. The preview image uses synthetic test balances.

Source and included binary assets were scanned for personal filesystem paths, local machine identifiers and common credential signatures. No such findings remained in the publishing snapshot. The original project's private files and history remain local.

## Dependency audit

`npm audit` on this pinned dependency snapshot reported **3 high-severity dependency findings** involving `electron`, `extract-zip` and `http-cache-semantics`. The main Electron fixes require a major runtime upgrade. Functional test and build success should not be interpreted as a clean dependency-security audit. The published snapshot retains the tested Electron 33.4.11 runtime; it does not silently upgrade the installed application.
