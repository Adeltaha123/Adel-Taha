# Deployment

Run npm ci and npm run dev locally. Vite uses port 5173 and proxies /api to port 3001. Copy .env.example to .env to change API settings. Keep environment files and databases out of Git.

## Shared backend

Use Node.js 22.15 or newer on a server with persistent disk:

```sh
npm ci
npm run api:build
npm run api:start
```

Configure API_HOST, API_PORT, API_DB, and API_ORIGINS through .env or environment variables. API_ORIGINS is comma-separated and should include the actual frontend origin and native origins in .env.example. Use an HTTPS reverse proxy and process supervisor. The default bind address is loopback; containers may need API_HOST=0.0.0.0.

The health endpoint is /api/health. Use SQLite-aware backups or stop the API before copying database files. Run one API instance with persistent local disk.

## Clients

Set VITE_API_URL to the public HTTPS API origin before building, for example https://api.example.com (without /api). This public URL is not a secret. Alternatively, reverse-proxy /api on the web frontend origin.

Run npm run build and host dist over HTTPS. GitHub Pages only hosts the frontend: the Publish web app workflow builds and deploys it on every push to main (or manually from Actions). In the repository's Settings → Pages, Source must be GitHub Actions. The workflow reads the VITE_API_URL repository variable; accounts require a separately hosted API, and without one the site works on each device only.

For mobile, set the public API origin before npm run mobile:sync. A phone's localhost refers to the phone, not the PC. Build/sign in Android Studio or Xcode.

Before public release, complete account recovery/deletion, backups, privacy disclosures, and device tests. Hosting, email services, store accounts, and signing credentials are not provisioned.
