# Expo Go (SDK 58)

The new React Native application is in `mobile/`. The repository root remains the existing web/Capacitor app and shared TypeScript API. Do not run Expo in the root or copy the Capacitor android/ios folders into mobile.

## Open on a phone

1. Install an Expo Go build matching SDK 58 from https://expo.dev/go. Store availability can lag the SDK release. If your iPhone build does not support SDK 58, use Expo's supported installation path or an Expo development build; changing the app's sdkVersion field cannot fix a native SDK mismatch.
2. Run `npm ci` in the repository root, then `npm ci --prefix mobile`.
3. Copy `.env.example` to `.env` in the repository root and set `OPENAI_API_KEY` there to enable voice and AI chat. Never put it in mobile/.env.
4. Copy mobile/.env.example to mobile/.env. Its default `EXPO_PUBLIC_API_URL=auto` makes the phone use the computer that serves Expo, on API port 3001, so a changed Wi-Fi address needs no edit. For a deployed backend, set its HTTPS origin instead (no /api suffix).
5. Start the API (reachable from your phone) and Expo together:

```powershell
npm.cmd run expo:dev
```

It prints the API address and the `exp://` link, warns when `OPENAI_API_KEY` is missing, and writes a matching QR code to mobile/.expo/expo-go-qr.svg. Ctrl+C stops both servers.

Scan the terminal QR with Expo Go on Android or the iPhone Camera. The computer and phone need network access to each other; allow Node on your private network if Windows Firewall prompts. Open `http://YOUR-PC-IP:3001/api/health` on the phone to diagnose backend connectivity. localhost on the phone is the phone itself. Restart Expo after changing .env.

If the default Metro port is occupied, run `npm --prefix mobile start -- --port 8083`. A tunnel for Metro does not automatically expose the API. Use a reachable HTTPS API when testing over different networks.

Local tasks, notes, habits, commands, overview, and focus timer work without configuring an API. Account, team, and AI features need it. New installations start in Arabic on a dedicated login/register page; Continue offline preserves guest access. Native credentials use SecureStore; browser-preview sessions are memory-only. Records use a separate AsyncStorage key and do not overwrite the original web app's storage. Log in and explicitly import device records to transfer them into a workspace. Signing in selects the personal workspace automatically. Previously saved native sessions restore their last cached workspace. Device records stay separate until explicitly imported. Edits queue database synchronization after one second; foreground polling and a manual sync button provide retries. Offline pending edits remain on the device.

## Features and current boundary

Native screens include a daily overview, workload counts, shareable summary, focus timer, task search/filtering/editing/checklists/assignment/undo, notes, habit check-ins, English/Arabic command previews, accounts, teams, invitations, and conflict resolution. The timer survives backgrounding by storing its end time; it does not send a background alarm.

This is a native frontend alongside the existing web app, not full feature parity. Calendar export and PIN/biometrics have not been ported to Expo. Expo has its own local scheduled task check-ins. The new Assistant has a separate server-backed chat and voice workflow. Expo Go cannot load Capacitor plugins. Those features remain in the web/Capacitor app. Shared domain types, command parsing, synchronization and dashboard calculations avoid duplicate business logic.

## Verification

```sh
npm run check
npm run test:e2e
npm run expo:check
cd mobile
npx expo install --check
npx expo-doctor
npm run export
```

Run npm run test:expo from the root for Expo browser integration tests. The script builds the web preview with a disposable test API URL and starts a temporary API/static server. It does not change mobile/.env. The exported web preview is for tests; build again with your real API URL before distributing it.

Type checks and Android/iOS JavaScript exports do not prove hardware behavior. Test the SDK 58 project in Expo Go on both phones before release. Expo Go is a development client; signed store apps require separate build and release steps.

## Validation recorded on 2026-10-30

- 21 regression/API tests and three existing web browser scenarios passed. Five Expo browser scenarios passed, covering Arabic login, account autosave and re-login, calendar/time selection, snoozing, offline data, and voice. Expo coverage includes a simulated microphone, editable transcription, AI proposal review, apply-once behavior, undo, and request failure recovery. OpenAI responses were mocked; live account access was not tested.
- Native TypeScript and Expo SDK dependency checks passed. Android and iOS Hermes bundles exported successfully, separately, with `NODE_OPTIONS=--max-old-space-size=256` and `--no-minify` on this 4 GB Windows PC.
- Expo Doctor finished with one unresolved check: fetching Expo's online configuration schema failed during TLS connection establishment. The other checks passed. Rerun Doctor when that connection is available.
- No physical iPhone/Android Expo Go session or signed native build was verified. Physical microphone, speaker, notification permissions, and scheduled delivery still require device testing.

On a memory-constrained PC, keep tests and exports serial. Metro is configured for one worker. For a lower-memory native bundle check, run `node node_modules/expo/bin/cli export --platform android --no-minify --output-dir dist-android` from mobile with NODE_OPTIONS set to --max-old-space-size=256, then repeat for ios. These are validation bundles, not signed distribution packages.
