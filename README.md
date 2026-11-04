# My PA

A local-first personal assistant for iPhone, Android, and the web, with English/Arabic and RTL support. One Expo (React Native) app in `mobile/` runs on phones and is built for the browser; one Node.js/TypeScript API in `server/` serves accounts, sync, and the AI assistant. No Python is required.

Website: <https://adeltaha123.github.io/Adel-Taha/>

## Features

- Today overview, tasks with search, priority matrix, checklists, schedules, assignment and undo; notes and habits.
- 4-digit PIN lock, with optional unlock like the phone itself: Face ID, fingerprint, or the phone's own PIN. On the website the browser's Face ID / fingerprint login is used where available.
- Accounts, automatic sync, offline edits, conflict resolution, and personal/team workspaces with single-use invitations.
- Plans: Free (20 AI/voice requests a month), Personal (149 EGP/month, unlimited AI), and Team (499 EGP/month, up to 10 members with Owner, Admin, Member and Viewer roles; unlimited AI for every member). See [plans and roles](docs/PLANS.md).
- Assistant: server-backed AI chat, voice transcription, speech playback, and reviewed task/note suggestions. See [setup and privacy](docs/ASSISTANT.md).
- English/Arabic typed commands that work offline, and local task check-ins with snooze. See [reminders and saving](docs/TASK-CHECKINS.md).

## Run

Use Node.js 22.15 or newer. On Windows use `npm.cmd` if PowerShell blocks `npm`.

```sh
npm ci
npm ci --prefix mobile
npm run expo:dev
```

This starts the API and Expo together. Scan the QR code with Expo Go (SDK 58), or press `w` in the Expo terminal to open the web version. See [phone setup](docs/EXPO.md) for the API address, network setup, and testing.

The API runs 24/7 on Cloudflare Workers' free plan with a D1 database, at <https://mypa-api.mohamed-tamer.workers.dev>. See [Cloudflare](docs/CLOUDFLARE.md) for deploying, secrets, and limits. The website finds the API through `server.json` on the `server-address` branch (`npm run server:address`); phones use `EXPO_PUBLIC_API_URL` in `mobile/.env`.

To turn on a subscription after someone pays (changes the live server; `ADMIN_TOKEN` in `.env` must match the server's):

```sh
npm run plan                                  # list accounts and plans
npm run plan -- someone@mail.com personal 1   # Personal for 1 month
npm run plan -- someone@mail.com team 3       # Team for 3 months
```

```sh
npm run check        # type checks, unit and API tests, API build
npm run expo:check   # Expo type check
npm run test:expo    # browser tests of the Expo web build
npm run web:build    # website build in mobile/dist
```

## Structure

- `mobile/` — the app: screens in `mobile/src/features`, shell and UI kit in `mobile/src/app`, local storage and sync in `mobile/src/data`, device adapters (lock, notifications, voice) in `mobile/src/platform`. Files ending in `.web.ts` replace their neighbours in the browser build.
- `server/` — the API and SQLite database layer.
- `shared/` — code used by both: data types (`domain.ts`), API contracts, sync, commands, check-ins, assistant contracts.
- `tests/` — unit/API tests and the Expo browser scenarios.

See [architecture](docs/ARCHITECTURE.md) and [deployment](docs/DEPLOYMENT.md).

## Limits

The PIN hides the app from other people; it does not encrypt stored data. Cloud sync covers text records and assignments, not audio. Server passwords are hashed. A sign-in lasts 30 days and renews while the app is used, so each device signs in once. Email verification, password recovery, and account deletion are not implemented.

The website works on each device without an account. Accounts, sync, and the assistant need the API hosted somewhere public (GitHub Pages only hosts the website). Microphone, notifications, and Face ID still need testing on real phones; signed store builds have not been produced.
