# cfarm-relay — Cloudflare Worker for CFarm notifications

This Worker sits between the local CFarm server and external notification channels
(Telegram today; Discord / Email / APNs future). The local server signs each
alert with HMAC-SHA256 and POSTs it here; the Worker fans out to every registered
channel.

## Why

iOS Safari blocks Web Push unless the page is installed to the Home Screen,
and push subscriptions expire. To reach iPhone / Android / Desktop without
requiring a PWA install, CFarm relays alerts through a Cloudflare Worker to
**Telegram Bot API** — which works on every device, free, no install required.

## Architecture

```
CFarm local server ──HMAC POST──► Cloudflare Worker ──► Telegram Bot API ──► users
                                          │
                                          └──► (future) Discord, Email, APNs
```

- `src/index.js` — Worker entry point (routes: `/relay`, `/register`, `/channels`, `/admin/issue-token`, `/healthz`)
- `src/verify.js` — HMAC signature verification (constant-time compare, 5-min window)
- `src/telegram.js` — Telegram `sendMessage` + `sendPhoto` wrapper, MarkdownV2 escaping
- `schema.sql` — D1 schema: `channels`, `delivery_log`, `bind_tokens`

## End-to-end setup (from blank)

### 1. Create a Cloudflare account

- Sign up at <https://dash.cloudflare.com/sign-up> (free tier is plenty).
- Workers free tier: **100,000 requests/day** — CFarm alert volume is <<1/day.

### 2. Install wrangler (Cloudflare's CLI)

```bash
npm install -g wrangler
wrangler login    # opens browser, auth flow
```

### 3. Initialize the D1 database

```bash
cd cfarm-relay
npx wrangler d1 create cfarm-relay-db
# Copy the printed `database_id` into wrangler.toml (replace REPLACE_AFTER_WRANGLER_D1_CREATE)
npx wrangler d1 execute cfarm-relay-db --file=./schema.sql --remote
```

### 4. Set secrets

```bash
# Get a bot token from @BotFather on Telegram:
#   1. Open Telegram, search @BotFather
#   2. /newbot → follow prompts → copy token
npx wrangler secret put TELEGRAM_BOT_TOKEN    # paste token

# Generate a shared secret (64 hex chars / 32 bytes):
openssl rand -hex 32
npx wrangler secret put CFARM_SHARED_SECRET   # paste same value into cameras.yaml later
```

### 5. Deploy

```bash
npx wrangler deploy
# Output: Published cfarm-relay (X.XX sec)
#         https://cfarm-relay.<your-subdomain>.workers.dev
```

### 6. Sanity-check

```bash
curl https://cfarm-relay.<your-subdomain>.workers.dev/healthz
# → {"ok":true,"db":"ok","ts":"2026-..."}
```

### 7. Wire up CFarm

Copy the worker URL and the same `CFARM_SHARED_SECRET` value into
`config/cameras.yaml`:

```yaml
cf_relay:
  enabled: true
  worker_url: "https://cfarm-relay.<your-subdomain>.workers.dev"
  shared_secret: "<paste from step 4>"
```

Restart CFarm. Server log should show:
```
CfRelay configured, worker_url=https://cfarm-relay.<sub>.workers.dev
```

### 8. Bind a Telegram channel

1. Open CFarm `/security` page → "📡 Kênh thông báo" card → "Bind Telegram".
2. Modal shows a one-time link. Open it on a device that has Telegram.
3. Telegram bot asks for chat_id; either:
   - Append `?chat_id=<your_id>` to the link (find chat_id via @userinfobot), or
   - Hit `/bind <token>` inside the bot chat (advanced).
4. Confirmation message arrives in Telegram within 1 second.
5. Status card shows ✅ "Telegram: 1 channel".

### 9. Send a test alert

As admin in CFarm:
```bash
curl -X POST http://localhost:8002/api/relay/test -b cookies.txt
```
Within ~2s the configured Telegram chat receives the test message.

## Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST   | `/relay`              | HMAC  | Receive signed alert from CFarm, fan-out to all active channels |
| POST   | `/admin/issue-token`  | HMAC  | CFarm backend asks Worker to mint a one-time bind token |
| GET    | `/register?token=...&chat_id=...` | none | Consume bind token, register chat_id |
| GET    | `/channels`           | none (consider gating) | List registered channels (audit) |
| GET    | `/healthz`            | none | Health check |

## Security notes

1. **HMAC verification is the gate**. Every `/relay` and `/admin/issue-token`
   request is rejected unless the HMAC-SHA256 over `${ts}.${raw_body}` matches
   `CFARM_SHARED_SECRET` AND the timestamp is within ±5 minutes.
2. **Constant-time compare** prevents timing attacks on signature bytes.
3. **`/register` tokens expire after 5 minutes** (default `ttl_seconds=300`).
4. **Telegram bot is publicly discoverable** by username — anyone can `/start`
   it, but they can't bind without a valid token from CFarm.
5. **Rotate `CFARM_SHARED_SECRET`** by issuing `wrangler secret put` AND
   updating `config/cameras.yaml`, then restarting CFarm. Old signed requests
   stop being valid immediately.

## Worker free tier limits

| Resource | Limit | CFarm usage (estimate) |
|----------|-------|------------------------|
| Requests | 100k/day | ~9 alerts × N channels ≈ 50/day |
| D1 rows  | 5 GB    | delivery_log auto-pruned after 7 days |
| CPU time | 10ms/req | typical relay fan-out = 2ms |
| Cold start| ~50ms first req after idle | acceptable for async alerts |

## Local development

```bash
npm install
npx wrangler dev
# → http://localhost:8787
```

`wrangler dev` reads `.dev.vars` for local secrets — create one:
```
TELEGRAM_BOT_TOKEN=your_test_bot_token
CFARM_SHARED_SECRET=test_secret_hex_64
```

## Files

| File | Purpose |
|------|---------|
| `wrangler.toml` | Worker name, D1 binding, env vars |
| `schema.sql` | D1 table definitions |
| `src/index.js` | Router, fan-out logic, scheduled prune |
| `src/verify.js` | HMAC sign + verify |
| `src/telegram.js` | Telegram API wrapper, MarkdownV2 escaping |
| `src/relay-room.js` | Durable Object placeholder (not wired) |