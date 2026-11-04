# Deployment

Run `npm ci`, `npm ci --prefix mobile`, and `npm run expo:dev` locally. Copy .env.example to .env to change API settings. Keep environment files and databases out of Git.

## Shared backend

The live API runs on Cloudflare Workers with D1; see [CLOUDFLARE.md](CLOUDFLARE.md) for deploying (`npm run deploy:api`), secrets, limits, and backups.

The same API also runs under Node.js 22.15 or newer, for development or on your own server with persistent disk:

```sh
npm ci
npm run api:build
npm run api:start
```

Configure API_HOST, API_PORT, API_DB, and API_ORIGINS through .env or environment variables. API_ORIGINS is comma-separated and must include the website origin (`https://adeltaha123.github.io`); phone apps do not send an origin. The health endpoint is /api/health. Under Node, run one instance with persistent local disk and use SQLite-aware backups.

## Website

The Publish web app workflow builds the Expo app for the browser and deploys it to GitHub Pages on every push to main (or manually from Actions). In the repository's Settings → Pages, Source must be GitHub Actions.

The website finds its API by reading `server.json` from the `server-address` branch, set with `npm run server:address -- https://…` (it checks /api/health before saving). Moving the API therefore needs no new website build. If the repository variable `EXPO_PUBLIC_API_URL` is set, that fixed address is built in instead.

To build the site locally: `npm run web:build` (output in mobile/dist).

## Phones

Set `EXPO_PUBLIC_API_URL` in mobile/.env to the public API origin (currently `https://mypa-api.mohamed-tamer.workers.dev`) and restart Expo. A phone's localhost refers to the phone, not the PC. Store builds need an Expo/EAS build with your Apple and Google developer accounts.

Before public release, complete account recovery/deletion, privacy disclosures, and device tests. Email services, store accounts, and signing credentials are not provisioned.
