# Architecture

## One app, three targets

`mobile/` is an Expo SDK 58 (React Native) app with its own package lock. The same code runs in Expo Go, native builds, and the browser (react-native-web). Where a device API differs, a `name.web.ts` file replaces `name.ts` in the web build; for example `platform/secure.ts` uses the iOS Keychain / Android Keystore while `secure.web.ts` uses browser storage, and `platform/phone-auth.ts` uses expo-local-authentication while `phone-auth.web.ts` uses WebAuthn.

Node.js + TypeScript + Fastify supplies one API; SQLite stores accounts, sessions, workspaces, invitations, and records. `shared/` holds code both sides use: data types (`domain.ts`), API contracts (`api.ts`), record merging (`sync.ts`), the command parser (`commands.ts`), check-in planning (`checkins.ts`), dashboard calculations (`productivity.ts`), and assistant contracts (`assistant.ts`). Metro resolves the `.js` import suffixes in these NodeNext sources to TypeScript.

## Code boundaries

Keep screens in `mobile/src/features`, the shell and UI kit in `mobile/src/app`, local persistence and sync in `mobile/src/data/store.ts`, and device APIs in `mobile/src/platform`. On the server, `app.ts` defines routes, `records.ts` validates records, `database.ts` owns persistence, `assistant.ts` the AI routes, and `oauth.ts` social sign-in.

## App lock

`platform/lock.ts` keeps a 4-digit PIN as a salted SHA-256 hash and offers phone unlock: Face ID, fingerprint, or the phone's own PIN/passcode on phones, and a WebAuthn platform credential in browsers. Phone unlock is saved only after one successful prompt. The app relocks after three minutes in the background; in the browser a reload within three minutes of use stays unlocked for that tab. Five wrong PINs start a 30-second wait. The lock gates the interface and does not encrypt AsyncStorage.

## Authentication and synchronization

The Assistant uses authenticated routes in `server/assistant.ts`. The server calls OpenAI Responses with a strict output schema and transcription with bounded audio uploads. The app applies approved proposals through its scoped local store. Provider keys never enter the app bundle. See ASSISTANT.md.

Signing in selects the personal workspace and restores cached account scopes. Edits queue a debounced sync; offline records are retained. Conversation records store bounded text history per user within the current workspace; team membership also grants access to them. `shared/checkins.ts` plans local task check-ins and the notification adapter schedules them.

Passwords use salted scrypt hashes. Random sessions and invitation codes are stored as hashes. Sessions last 24 hours; invitations last seven days and are single use. Membership checks isolate workspaces. Authentication endpoints are rate limited.

Mutations carry expected record versions. Stale edits return conflicts instead of overwriting data. Tombstones preserve deletions; identical retries are idempotent. Device records are imported into a workspace only when the user chooses to.

SQLite uses WAL and foreign keys. Deploy one API instance with persistent local storage. Node 22.15 emits an experimental warning for built-in SQLite.

## Website

GitHub Pages hosts the Expo web build, served from `/Adel-Taha` (set through `EXPO_BASE_URL` in `mobile/app.config.js`). `mobile/public/sw.js` retires the service worker of the earlier web app: browsers that still run it install this one, which deletes the old caches, unregisters, and reloads into the current app.

## Current limits

No email verification, password reset, account deletion, or production API hosting is provisioned. Audio does not sync. Microphone, notifications, and Face ID need validation on physical devices.

Run `npm run check`, `npm run expo:check`, and `npm run test:expo` after substantial changes. See [deployment](DEPLOYMENT.md) and [phone setup](EXPO.md).
