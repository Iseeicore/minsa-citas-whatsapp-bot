# WhatsApp Inbox

A WhatsApp Business Cloud API "web inbox" MVP built with Next.js (App Router), deployed on Vercel as serverless functions. Postgres via Neon, Prisma ORM with the Neon serverless (HTTP) driver adapter, Tailwind CSS, and short polling (every 4s) for realtime-ish updates in the UI.

## Stack

- Next.js 16 (App Router, TypeScript)
- Prisma ORM 6.x + `@prisma/adapter-neon` + `@neondatabase/serverless`
- Postgres via [Neon](https://neon.tech)
- Tailwind CSS
- Zod for input validation
- Client polling every 4s (`fetch` + `setInterval`) — no WebSockets, no extra data-fetching library

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

   This also runs `prisma generate` via the `postinstall` script.

2. Copy `.env.example` to `.env` and fill in real values (a Neon `DATABASE_URL` and your WhatsApp Cloud API credentials).

3. Apply the schema to your local/dev Neon database:

   ```bash
   npx prisma migrate dev
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

## Production migrations (Vercel)

`DATABASE_URL` and the WhatsApp env vars are already configured in Vercel. The `build` script runs `prisma migrate deploy` before `next build`, so pending migrations apply automatically on every deploy:

```json
"build": "prisma migrate deploy && next build"
```

This is an MVP-simple approach (migrations run inline with the build), not a full CI/CD migration pipeline with staged approval — acceptable for this project's scale, but worth revisiting if the team grows or migrations become risky to run unattended.

## Environment variables

See `.env.example`:

- `WHATSAPP_TOKEN` — WhatsApp Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` — the sending phone number ID
- `WHATSAPP_VERIFY_TOKEN` — shared secret for the webhook verification handshake
- `WHATSAPP_APP_SECRET` — used to validate the `X-Hub-Signature-256` header on incoming webhooks
- `DATABASE_URL` — Neon Postgres connection string

## Notes

- The webhook route (`app/api/webhook/route.ts`) runs on the Node.js runtime (not Edge) because signature verification needs Node's `crypto` module.
- The 24-hour customer service window (required before sending free-text messages) is computed from the conversation's **last inbound message**, not overall conversation activity.
- No authentication/login and no automated tests are included — out of scope for this MVP.
