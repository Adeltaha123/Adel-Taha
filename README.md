# Maktab Assistant

A private, phone-first executive assistant for a CEO.

- **Voice notes:** tap the mic, speak in Egyptian Arabic or English, and watch the text appear live. With an OpenAI key you can switch to Whisper, which also keeps the audio and handles Arabic and English mixed in one sentence.
- **AI organizing:** a voice note or typed note in Arabic, English or Franco becomes prioritized tasks, checklists, delegations, notes and journal entries.
- **Priority matrix:** Do now / Schedule / Delegate / Drop, plus a daily Top 3 and a "Plan my day" briefing.
- **Checklists** inside every task, **notes**, a **journal**, and **habits** with streaks.
- **Assistant chat** that answers in the language you write in, and can add or complete tasks.
- **Lock screen:** fingerprint or Face ID where the phone supports it, with a 4-digit PIN as backup.
- Works offline once installed. AI and transcription need internet.

## Put it online with GitHub Pages (about 10 minutes)

1. On github.com, create a new repository named `maktab`. It must be **Public** to use GitHub Pages on a free account. The repository holds only the app's code, never your tasks or keys.
2. Upload these files to the repository: `index.html`, `manifest.webmanifest`, `sw.js`, `icon.svg`, `icon-192.png`, `icon-512.png`, and this `README.md`.
3. In the repository, go to **Settings → Pages**. Under "Build and deployment", choose **Deploy from a branch**, then branch **main** and folder **/ (root)**, and save.
4. After a minute your app is live at `https://YOUR-USERNAME.github.io/maktab/`.

## Install it on your phone

- **iPhone (Safari):** open the link, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open the link, tap the ⋮ menu, then **Install app** or **Add to Home screen**.

On first open you choose a PIN, and the phone offers to register your fingerprint or face.

## Turn on the AI

1. Create an API key at platform.claude.com/settings/keys (choose the Default Workspace), or an OpenAI key at platform.openai.com/api-keys.
2. In Maktab, open **Settings (⚙) → AI**, paste the key, choose **Who analyzes your notes** (Claude or ChatGPT), and tap **Save**.
3. With an OpenAI key, Maktab switches the **Voice engine** to OpenAI transcription, which is best for long or mixed Arabic-English voice notes.

## Privacy and safety

- Tasks, notes, voice notes and keys are stored **only on this phone**, in the browser's storage. Nothing is uploaded to GitHub.
- Text goes to the AI you chose (Anthropic or OpenAI) only when you use an AI feature. Audio goes to OpenAI only when the OpenAI voice engine is on.
- Use **Settings → Export backup** regularly. Clearing browser data or losing the phone erases everything else.
- The API keys live on the device. If the phone is lost, revoke the keys in the Anthropic and OpenAI consoles.

## Voice tips

- The first time you record, allow microphone access.
- **Phone speech** is free and live. It uses Google's speech service on Android and Apple's on iPhone. Choose Arabic or English before recording.
- If the transcript misses a word, fix it in the box before tapping **Analyze & organize**.
