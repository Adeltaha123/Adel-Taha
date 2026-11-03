# My PA

A local-first personal assistant for iOS, Android, and web with English/Arabic and RTL support. The new interface uses React + TypeScript, Capacitor packages both mobile apps, and one Node.js/TypeScript backend serves all clients. No Python is required.

## Features

- Tasks, search, priority matrix, checklists, undo, notes, calendar, journal, and habits.
- Accounts, cloud synchronization, offline edits, conflict resolution, and personal/team workspaces.
- Teams with single-use invitations and task assignment.
- Expo Assistant: server-backed AI chat, voice transcription, device speech playback, and reviewed task/note suggestions. See [setup and privacy](docs/ASSISTANT.md).
- Expo login/register, automatic SQLite synchronization, Arabic-first setup, calendar/time selection, and local task check-ins with snooze. See [reminders and saving](docs/TASK-CHECKINS.md).
- English/Arabic command previews through typed input or the existing voice flow.
- Native scheduled reminders, quiet hours, and overdue rescheduling. Browser reminders require the app to be running.

## Run

For **Expo Go SDK 58**, use the React Native app in `mobile/`. Run `npm ci --prefix mobile`, then `npm run expo:start` and scan the QR code with a matching Expo Go build. See [phone setup and feature coverage](docs/EXPO.md) for the shared backend URL, network setup, and native testing instructions.

Use Node.js 22.15 or newer:

```sh
npm ci
npm run dev
```

This starts the frontend and API. Open the Vite URL, choose a device PIN, and register in Account for optional sync. Importing existing device records is explicit. On Windows use npm.cmd if PowerShell blocks npm.ps1.

```sh
npm run check
npx playwright install chromium
npm run test:e2e
npm run mobile:sync
npm run android:open
npm run ios:open
```

The last command requires macOS/Xcode. Signed release packages and store listings have not been produced.

## Structure

Feature screens live in src/features, the React shell in src/app, sync in src/cloud, persistence in src/data, and device adapters in src/platform. server contains the shared API and SQLite database layer; shared contains API contracts. android and ios contain native projects. tests includes regression, API, command/reminder, and Chromium scenarios.

React migration is incremental: the shell, tasks, accounts, commands, and reminders use React; established screens retain modular JavaScript. See [architecture](docs/ARCHITECTURE.md), [deployment](docs/DEPLOYMENT.md), and [mobile setup](docs/MOBILE.md).

## Limits

Cloud sync includes text records and assignments; audio and personal provider keys stay on the device. The PIN gates the interface without encrypting storage. Server passwords are hashed; sessions last 24 hours and use client session storage. Email verification, password recovery, and account deletion are not implemented.

Native microphone, background delivery, biometrics, sharing, and installation still need device testing. Optional AI/transcription requires provider configuration and internet.
