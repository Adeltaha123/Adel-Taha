# Architecture

## Expo SDK 58 frontend

`mobile/` contains an independently locked React Native/Expo SDK 58 app using the same Node API. Its native UI, storage, and keychain adapters live under mobile/src. Shared types stay in src/types/domain.ts. The command parser is reused, and shared/sync.ts now handles record comparison and merging for both clients. shared/productivity.ts supplies validated dates, overview counts, and timer arithmetic. The separate install prevents React Native's required React version from conflicting with the established web build. See EXPO.md for feature coverage and device instructions.

The established web frontend uses React + TypeScript and Capacitor. The new Expo frontend uses React Native. Node.js + TypeScript + Fastify supplies one shared API; SQLite stores accounts, sessions, workspaces, invitations, and records. No Python is needed.

React does not automatically make an app faster. Tasks use memoized rows, local search, and bounded rendering (50 rows per page). Account, command, and reminder screens load lazily. Browser tests exercise 2,000 tasks; device performance needs measurement.

## Code boundaries

src/app/ReactApp.tsx owns the shell. An external-store adapter bridges existing render events with React. Tasks, accounts, commands, and reminders use React; other screens retain JavaScript through LegacyView. New code uses strict TypeScript; existing JavaScript has syntax/import/name checks but is not fully typed.

Keep UI in src/features, persistence in src/data, synchronization in src/cloud, and native APIs in src/platform. shared/api.ts defines contracts. server/app.ts defines routes, records.ts validates records, and database.ts owns persistence.

## Authentication and synchronization

The Expo Assistant uses authenticated routes in `server/assistant.ts`. The server calls OpenAI Responses with a strict output schema and transcription with bounded audio uploads. `shared/assistant.ts` defines proposal contracts; the mobile feature applies approved proposals through the existing scoped local store. Provider keys never enter the mobile bundle. See ASSISTANT.md for setup, context-sharing limits, and testing boundaries.

Expo authentication selects the personal workspace and restores cached native account scopes. Edits queue a debounced sync; cached offline records are retained. Conversation records store bounded text history per user within the current workspace. Team workspace membership also grants access to these records. `shared/checkins.ts` plans local task check-ins; the Expo notification adapter schedules them, while the feature UI handles complete/snooze/dismiss. Calendar and time selection use React Native controls without DOM or Capacitor dependencies. Metro resolves relative `.js` imports in shared NodeNext sources to TypeScript during native bundling.

Passwords use salted scrypt hashes. Random sessions and invitation codes are stored as hashes. Sessions last 24 hours; invitations last seven days and are single use. Membership checks isolate workspaces. Owners issue invitations; assignees must be members. Authentication endpoints are rate limited.

Mutations carry expected record versions. Stale edits return conflicts instead of overwriting data. Tombstones preserve deletions; identical retries are idempotent. The client batches changes, preserves edits made during requests, and presents conflict resolution. Sync uses debounced HTTP and foreground polling.

Device records are explicitly imported. Account/workspace archives are isolated locally; logout restores device records. Settings, keys, audio blobs, and local audio IDs are excluded from cloud records. Undo checks workspace scope.

SQLite uses WAL and foreign keys. Deploy one API instance with persistent local storage. Node 22.15 emits an experimental warning for built-in SQLite. Test runtime upgrades; multi-instance hosting requires a storage change.

## Compatibility and reminders

Preserve mk_items, mk_salt, mk_cfg, mk_lang, mk_ui, mk_notified, session key mk_unlock, IndexedDB maktab/audio, and cache mypa-share. Cloud archives use additional scoped keys. Browser origins and native installations have separate storage. Current exports exclude audio and provider keys.

The production worker caches the application shell with hashed assets and supports subpaths. API responses are not cached. Registration is disabled in development and native containers.

The local parser supports English/Arabic tasks, notes, completion, and supported dates/times. Users preview before applying; completion requires a unique exact title. Typed commands work offline without AI; voice uses existing recording/transcription capabilities.

Native notifications schedule the nearest 60 future reminders, respect quiet hours, and refresh on edits or foregrounding. Exact Android timing depends on OS permission; otherwise alerts may be delayed. Browser reminders retain running-app behavior. Planning is unit tested; OS delivery needs hardware testing.

## Current limits

The PIN is an interface gate, not encryption. No managed AI credential service, email verification, password reset, account deletion, or production hosting is provisioned. Audio does not sync. Speech, biometrics, downloads, and share receivers need device validation or additional native adapters.

Run npm run check and npm run test:e2e after substantial changes. See [deployment](DEPLOYMENT.md) and [mobile setup](MOBILE.md).
