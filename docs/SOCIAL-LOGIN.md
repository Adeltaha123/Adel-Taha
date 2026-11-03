# Sign in with Google, Apple and Meta

The login screen shows **Continue with Google / Apple / Meta**. Each button turns on when its keys are in the root `.env`; until then it is dimmed and explains that it is not set up. Account → *Sign-in methods* links a provider to an existing email account.

## How it works

1. The app asks the API to start a sign-in and opens the provider's page in the phone's browser.
2. The provider sends the browser back to the API at `OAUTH_PUBLIC_ORIGIN/api/auth/oauth/callback/<provider>`. The API checks the result (PKCE and a signed ID token for Google and Apple; a code exchange plus a signed profile request for Meta) and requires a verified email.
3. The API sends the browser back to the app (`mypa://auth` in a built app, `exp://…/--/auth` in Expo Go) with a one-time hand-off code. Only the app that started the sign-in can trade it for a session.

A provider email that already belongs to a password account is never merged automatically: sign in with email, then link the provider from Account.

## 1. An HTTPS address for the API

Providers only redirect to HTTPS. The phone still talks to the API over Wi-Fi; only the provider's redirect needs HTTPS.

- **Quick test:** install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and run `cloudflared tunnel --url http://localhost:3001`. Put the printed `https://….trycloudflare.com` address in `OAUTH_PUBLIC_ORIGIN`. This address changes every run, so you must update it in `.env` and in each provider console each time.
- **To keep:** deploy the API (see DEPLOYMENT.md) or use a named Cloudflare tunnel on your own domain.

## 2. Provider keys

Use `OAUTH_PUBLIC_ORIGIN` as `<ORIGIN>` below.

| Provider | Where | Redirect / return URL | `.env` |
|---|---|---|---|
| Google | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID, type **Web application** | `<ORIGIN>/api/auth/oauth/callback/google` | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` |
| Apple | developer.apple.com (paid membership) → Identifiers → **Services ID** with Sign in with Apple; Keys → a Sign in with Apple key (.p8) | Domain: the host of `<ORIGIN>`; Return URL: `<ORIGIN>/api/auth/oauth/callback/apple` | `APPLE_CLIENT_ID` (Services ID), `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY` (.p8 text, newlines as `\n`) |
| Meta | developers.facebook.com → Create app → add **Facebook Login** | Valid OAuth Redirect URIs: `<ORIGIN>/api/auth/oauth/callback/facebook` | `META_APP_ID`, `META_APP_SECRET` |

Keep secrets only in the root `.env`, never in `mobile/.env`. Restart `npm run expo:dev` after editing it.

Notes:
- A Google consent screen in *Testing* mode only admits the test users you list. A Meta app in *Development* mode only admits people with a role on the app. Publish them before real users sign in.
- Meta must be allowed to return the `email` permission. Accounts without an email cannot sign in.
- Apple shares the user's name only on the first sign-in; later sign-ins use the email.

## What the database saves

The API stores everything in SQLite (`API_DB`, default `data/my-pa.sqlite`):
- accounts, sessions and linked sign-in providers;
- workspaces, team members and invitations;
- every task, note, habit, voice transcript and assistant conversation in a workspace, synced about one second after each change;
- each user's language, theme and assistant name ("My PA Sara"), so a new phone starts with the same settings.

Records created in offline mode stay on the phone until you sign in and import them from Account. Audio recordings stay on the device. Back up the `.sqlite` file together with its `-wal` file.
