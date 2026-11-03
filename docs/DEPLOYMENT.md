# Deployment

Run `npm ci`, `npm ci --prefix mobile`, and `npm run expo:dev` locally. Copy .env.example to .env to change API settings. Keep environment files and databases out of Git.

## Shared backend

Use Node.js 22.15 or newer on a server with persistent disk:

```sh
npm ci
npm run api:build
npm run api:start
```

Configure API_HOST, API_PORT, API_DB, and API_ORIGINS through .env or environment variables. API_ORIGINS is comma-separated and must include the website origin (`https://adeltaha123.github.io`); phone apps do not send an origin. Use an HTTPS reverse proxy and process supervisor. The default bind address is loopback; containers may need API_HOST=0.0.0.0.

The health endpoint is /api/health. Use SQLite-aware backups or stop the API before copying database files. Run one API instance with persistent local disk.

## Website

The Publish web app workflow builds the Expo app for the browser and deploys it to GitHub Pages on every push to main (or manually from Actions). In the repository's Settings → Pages, Source must be GitHub Actions.

The website finds its API in one of two ways. If the repository variable `EXPO_PUBLIC_API_URL` is set to a public HTTPS API origin (without /api), that fixed address is built in. Otherwise the app reads `server.json` from the `server-address` branch, which `npm run server:online` writes each time it starts the API on the owner's PC behind a free Cloudflare quick tunnel. Quick tunnels are meant for light use: the PC must stay on with that command running, and Cloudflare does not guarantee their uptime. Move to a hosted API (above) and set the variable when that is no longer enough.

To build the site locally: `npm run web:build` (output in mobile/dist).

## Phones

Set `EXPO_PUBLIC_API_URL` in mobile/.env to the public API origin before building. A phone's localhost refers to the phone, not the PC. Store builds need an Expo/EAS build with your Apple and Google developer accounts.

Before public release, complete account recovery/deletion, backups, privacy disclosures, and device tests. Hosting, email services, store accounts, and signing credentials are not provisioned.
