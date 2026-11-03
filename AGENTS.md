# Project guide

This is My PA, a local-first English/Arabic personal assistant. The app uses React, Vite and Capacitor, with a shared Node.js/TypeScript API in server/, contracts in shared/, and existing JavaScript feature modules undergoing incremental migration. Do not introduce Python.

- Read README.md and docs/ARCHITECTURE.md before substantial changes.
- Keep feature UI in src/features, external services in src/services, persistence in src/data, and native adapters in src/platform.
- Use src/types/domain.ts for new TypeScript features. Existing JS is not fully typed yet.
- Preserve local storage keys, the maktab IndexedDB database/audio store, and the mypa-share cache unless implementing a deliberate compatible migration.
- Keep API keys out of source, fixtures, environment variables exposed by Vite, logs, and committed native assets.
- Preserve Arabic, RTL layout, safe areas, and offline task/note/habit behavior.
- Run npm run check and npm run test:e2e after substantial code changes. Tests cover JSDOM, API, and Chromium workflows; they do not establish native device API compatibility.
- Build before Capacitor sync. Commit native project sources, not copied web bundles, signing materials, local SDK paths, or build outputs.
- Use docs/MOBILE.md to distinguish generated native project setup from native feature completion and signed release builds.
- The Expo SDK 58 app is in mobile/ with its own package lock. Reuse shared/ logic and src/types/domain.ts; do not import DOM or Capacitor APIs into native screens. See docs/EXPO.md. For Expo changes run expo:check, SDK dependency checks, native bundle exports, and test:expo with its documented test API URL.
