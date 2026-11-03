# Dates, login and task check-ins

The Expo task editor uses a calendar grid and selectable hours/minutes, with a Clear schedule option. Date/time values remain local wall-clock values in the existing `due` and `time` fields. Set both to receive a check-in.

Use **Enable task reminders** in the editor and grant notification permission. The app schedules the nearest 60 future check-ins on this device. At the due time the notification asks whether the task is complete. Open the app to choose Completed, In 10 minutes, or Dismiss check-in. Snoozes and dismissals are saved with the task and synchronized. Editing the due date/time resets these flags. Completed and deleted tasks are removed from the schedule.

In-app check-ins also appear for overdue tasks, including when returning after the due time. Browser check-ins require the app to be open. Native local notifications work without the backend after scheduling, but OS permissions, battery restrictions, reboot behavior and exact delivery need real-device testing. Expo Go supports local notifications; remote push requires a development build. This implementation does not register push tokens or run a background server reminder service.

Account data is stored in SQLite (`data/my-pa.sqlite`) on the computer running the API. It is not a hosted cloud deployment: the server must be reachable for login and synchronization. Tasks, notes, habits, sent conversation text and transcripts synchronize; the offline guest workspace and raw microphone recordings are not automatically uploaded. Existing guest data can be copied explicitly from Account. Use a persistent disk, backups and HTTPS for production deployment.

New installations default to Arabic. The language switch preserves existing user choices. Device sessions use SecureStore; browser preview sessions remain memory-only and require signing in after refresh. Offline account edits remain in the cached workspace and retry on reconnect/foregrounding. Notifications are refreshed on record changes, and this app's scheduled notifications are cleared when leaving the signed-in/offline workspace for the login page.

The assistant's default is `gpt-6-luna`, configured through the server-only `OPENAI_MODEL`. Provider credentials are still required for live transcription/chat; the microphone entry remains visible and explains missing setup. No API key is bundled in the app.
