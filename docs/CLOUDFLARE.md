# The API on Cloudflare (free plan)

The API runs on Cloudflare Workers with a D1 (SQLite) database, 24/7, at <https://mypa-api.mohamed-tamer.workers.dev>. The same code also runs under Node for development and tests: `server/app.ts` is the whole API, `server/worker.ts` starts it on Cloudflare with D1, and `server/node.ts` / `server/index.ts` start it on a PC with `node:sqlite`. `wrangler.toml` holds the Worker's settings.

## Deploying

Server changes deploy with:

```powershell
npm run deploy:api
```

It reads `CLOUDFLARE_API_TOKEN` from `.env`. To deploy automatically on every push to `main` instead, add the same token on GitHub under **Settings → Secrets and variables → Actions → New repository secret**, named `CLOUDFLARE_API_TOKEN`; the *Deploy API to Cloudflare* workflow then runs the tests, deploys, and checks the live API. Without that secret the workflow skips the deploy.

The token needs the **Edit Cloudflare Workers** template plus **Account → D1 → Edit**. The schema is created or upgraded by the API itself on start (`migrate()` in `server/db.ts`).

## Settings and secrets

| Name | Where | Purpose |
|---|---|---|
| `API_ORIGINS` | `wrangler.toml` | Websites allowed to call the API |
| `PASSWORD_ITERATIONS` | `wrangler.toml` | PBKDF2 rounds for new passwords (10,000 on the free plan) |
| `SUBSCRIBE_CONTACT` | `wrangler.toml` | Who people contact to subscribe, shown on Account |
| `OPENAI_API_KEY` | secret | Voice transcription and the assistant |
| `ADMIN_TOKEN` | secret, and `.env` | Lets `npm run plan` change subscriptions |

Change a secret with `npx wrangler secret put NAME` (with `CLOUDFLARE_API_TOKEN` set), then it applies immediately. Change a `wrangler.toml` value and run `npm run deploy:api`.

## Checking it

```powershell
node scripts/smoke-api.mjs https://mypa-api.mohamed-tamer.workers.dev
```

runs read-only checks (health, CORS for the website, sign-in providers, password checking, authentication). CI runs the full version against the Worker in Cloudflare's local runtime on every push. Live logs are in the Cloudflare dashboard under **Workers & Pages → mypa-api → Logs**.

## Free plan limits

- **100,000 requests a day.** Each open app syncs about every 30 seconds while in use, which is plenty for a personal user or small team.
- **About 10 ms of CPU per request.** This is why new passwords use 10,000 PBKDF2 rounds (old scrypt passwords still work and are upgraded at the next login), voice recordings are uploaded as the raw request body, and sync writes are single conditional statements. On the $5/month Workers plan, raise `PASSWORD_ITERATIONS` to 210000; passwords upgrade as people sign in.
- **D1: 5 GB of storage, 5 million rows read and 100,000 rows written a day.**
- **Rate limits** (sign-in attempts, AI requests) are counted per Cloudflare location rather than globally.

## Backups

D1 keeps 30 days of point-in-time history. To restore, use `npx wrangler d1 time-travel restore mypa --timestamp=<time>`. For a copy on your PC: `npx wrangler d1 export mypa --remote --output=backup.sql`.
