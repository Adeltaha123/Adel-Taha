# My PA assistant

The Expo app has five tabs: Today, Tasks, Assistant, Library, and Account. Library contains notes, habits, and offline commands. The original web/Capacitor UI is a separate frontend.

## Server setup

Set `OPENAI_API_KEY` in the repository root `.env`, then rebuild/restart the API. Never put it in `mobile/.env`, a Vite variable, an Expo public variable, or source control. Revoke any key previously posted in chat and use a replacement. Sign in through Account before opening Assistant.

The default conversational model is `gpt-6-luna`; recorded speech uses `gpt-transcribe`. Override with server-only `OPENAI_MODEL` and `OPENAI_TRANSCRIBE_MODEL` if your account requires another compatible model. Chat requires Responses API structured JSON output support. See the [model documentation](https://developers.openai.com/api/docs/models/gpt-6-luna) and [speech-to-text guide](https://developers.openai.com/api/docs/guides/speech-to-text). Model access, billing and a working key must be verified against your account; mocked tests do not establish them.

## Behavior and privacy

- Sending a message shares its text, recent conversation, and up to 50 tasks from the selected workspace with OpenAI. Notes and saved audio are not included in chat context. Responses use `store: false`; this does not override the provider's applicable data-retention policies.
- Task and note changes are proposals. Apply each suggestion explicitly; Undo uses the existing local undo mechanism. Completion rejects missing, completed, or renamed tasks. Actions do not directly modify the backend database.
- Voice records only after a tap and microphone permission. Tap Stop to transcribe; recording ends after 60 seconds. Review/edit the transcript before sending. Recording is limited to 6 MB and temporary native files are removed after transcription.
- Read aloud uses the device's speech engine. This is recorded voice input and device speech playback, not a live OpenAI voice call. Switching away stops recording and speech. The latest 100 conversation messages, including sent transcripts, are saved in the current workspace and synchronized to SQLite. In team workspaces these records are shared with workspace members. Restored messages do not restore executable proposals; ask again to obtain a fresh proposal. Raw microphone audio remains temporary and is not uploaded to the app database.
- Offline tasks, notes, habits, and command parsing remain usable without AI. Chat and transcription require connectivity. Authentication, request validation, size limits, timeouts, and rate limits protect the API; provider failures never return credentials.

## Testing

Run `npm run check`, `npm run test:e2e`, `npm run expo:check`, and `npm run test:expo`. The assistant API tests inject a mocked OpenAI transport. Browser tests use a simulated microphone and mocked AI responses to check transcript review, explicit application, undo, and retry behavior. Physical iOS/Android microphone permissions, interruptions, speech playback, and live model quality still require device/account testing.
