# WhatsApp Inbox

A WhatsApp Business Cloud API "web inbox" MVP built with Next.js (App Router), deployed on Vercel as serverless functions. Postgres via Neon, Prisma ORM with the Neon serverless (HTTP) driver adapter, Tailwind CSS, and short polling (every 4s) for realtime-ish updates in the UI.

## Stack

- Next.js 16 (App Router, TypeScript)
- Prisma ORM 6.x + `@prisma/adapter-neon` + `@neondatabase/serverless`
- Postgres via [Neon](https://neon.tech)
- Tailwind CSS
- Zod for input validation
- Client polling every 4s (`fetch` + `setInterval`) — no WebSockets, no extra data-fetching library

## Project structure

```
app/                         Next.js routes (kept thin): inbox UI, /api/*, /webhook/whatsapp, sandbox pages
  components/                inbox and Sandbox UI; Sandbox.tsx is the chat container
    sandbox-chat/            its presentational pieces (header, composer, bubbles, DNI card, debug panel) and helpers
lib/
  db/                        Prisma client (lazy) and the DATABASE_ENABLED flag
  whatsapp/                  outbound messages and media download (Meta Cloud API)
    webhook/                 inbound pipeline: payload mapping, store + turn lock, answering the citizen,
                             in-memory redelivery check (no-database mode)
  integrations/              HTTP clients for external services: RENIEC, quejas
    minsa/                   MINSA client split by endpoint: identity, catalog, booking (+ wire, format, fakes)
  observability/             structured logger, tracer, PII masking, file sink
  security/                  webhook perimeter: payload filter, rate limiter, lexical guard
  fsm/                       the conversation state machine
    core/                    engine: session types, executor, the turn dispatcher (handle)
    session/                 session persistence (database or in-memory), expiry guard and re-verification,
                             per-citizen turn lock
    routing/                 first contact, welcome, main menu, lexical-guard routing, entry into a flow
    parsing/                 reading citizen input: dates, times, selections, text
      ai/                    Gemini-assisted parsing, one module per task (distrito, menu intent, fecha, hints);
                             gemini.ts is the one shared request helper
    flows/
      cita/                  appointment flow: handlers-cita.ts routes each state to steps/
        steps/               one module per conversation step (identity, ubigeo, catalog, fecha, hora, booking…)
          hora/              the hora step: list, typed times, "1".."10" choice, confirmation, ask-or-book
      reclamo/               complaint flow
      emergency/             emergency cut
      out-of-scope/          out-of-scope detection and the official channels it points to
tests/                       cross-module suites: security/, stress/, integration/, smoke/ (real Neon), support/
data/                        static datasets (Peru districts)
prisma/                      schema and migrations
scripts/  docs/              tooling and project documentation
```

Conventions (enforced by ESLint where noted):

- **Imports always use the `@/` alias** — relative imports are rejected (`no-restricted-imports`).
- **No import cycles** (`import/no-cycle`); cycles only through a lazy `import()` are allowed.
- **Unit tests live next to the file they cover** (`x.ts` + `x.test.ts`); scenario tests sit in the folder of the area they exercise (e.g. `flows/cita/hora-choice.test.ts`).
- **Features are grouped by flow, not by layer**: a bug in a conversation step lives under `lib/fsm/flows/<flow>/`.

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
"build": "prisma migrate deploy && next build --webpack"
```

(`--webpack` forces the classic compiler instead of Turbopack — Turbopack's production build had a `_global-error` prerender crash specific to this Next.js version.)

This is an MVP-simple approach (migrations run inline with the build), not a full CI/CD migration pipeline with staged approval — acceptable for this project's scale, but worth revisiting if the team grows or migrations become risky to run unattended.

## Environment variables

See `.env.example`:

- `META_ACCESS_TOKEN` — WhatsApp Cloud API access token
- `META_PHONE_NUMBER_ID` — the sending phone number ID
- `META_WEBHOOK_VERIFY_TOKEN` — shared secret for the webhook verification handshake
- `META_APP_SECRET` — used to validate the `X-Hub-Signature-256` header on incoming webhooks
- `META_GRAPH_API_VERSION` — Graph API version to call (e.g. `v21.0`)
- `DATABASE_URL` — Neon Postgres connection string (not needed with `DATABASE_ENABLED=false`)
- `DATABASE_ENABLED` — set to exactly `false` to run without a database (see below). Unset or any other value keeps the database.

## Running without a database (`DATABASE_ENABLED=false`)

For deployments that only need the bot to answer (message reactivity) and must not store anything:

- Prisma is never constructed and no connection is opened; `DATABASE_URL` can be absent.
- Each citizen's conversation state lives in the process's memory and is evicted after an hour idle (six times the 10-minute session idle timeout, so the "your session expired" answer still works).
- Meta's redeliveries of the same message are skipped by an in-memory list of message ids kept for a day.
- Nothing is recorded: no `Conversation`/`Message` rows, no delivery statuses. The web inbox (`/api/conversations*`, `/api/messages/send`) answers `503 {"error":"persistence disabled"}`.
- The per-citizen turn lock runs in memory even if `DATABASE_URL` is set.
- Build with `npm run build:no-db` (no `prisma migrate deploy`).

**Run exactly ONE instance in this mode.** State is per process: a second replica would not see the sessions the first one holds and would break conversations mid-flow, and a restart makes every in-progress citizen start over. Scaling out needs a shared store (for example Redis with TTLs) behind `lib/fsm/session/session-store.ts` and `lib/whatsapp/webhook/inbound-dedupe.ts`.

## Run with Docker (MINSA server)

The `Dockerfile` builds the no-database deployment: a multi-stage image on `node:22-alpine` (the Node version CI runs) that builds with `npm run build:no-db` and Next's standalone output, runs as the unprivileged `node` user on port 3000, and probes `GET /api/health` as its `HEALTHCHECK`.

```bash
# 1. Put the secrets in a git-ignored .env next to docker-compose.yml:
#    META_ACCESS_TOKEN, META_PHONE_NUMBER_ID, META_WEBHOOK_VERIFY_TOKEN, META_APP_SECRET
#    (+ the SANDBOX_USE_REAL_* / MINSA_* / RENIEC_* / QUEJAS_* / GOOGLE_* values for real integrations)
# 2. Build and start:
docker compose up -d --build
# 3. Check it:
curl http://localhost:3000/api/health   # {"status":"ok","database":"disabled"}
```

- `docker-compose.yml` fixes `DATABASE_ENABLED=false`; a missing required secret stops `docker compose up` with a message instead of starting a broken bot. `HOST_PORT` changes the published port (default 3000).
- Point Meta's webhook callback at `https://<server>/webhook/whatsapp` (TLS terminates in front of the container, e.g. the server's reverse proxy).
- `next.config.ts` only switches to standalone output when `NEXT_OUTPUT_STANDALONE=true` (set by the Dockerfile), so Vercel builds are unchanged.

## Notes

- The webhook route (`app/webhook/whatsapp/route.ts`) runs on the Node.js runtime (not Edge) because signature verification needs Node's `crypto` module. The path is fixed at `/webhook/whatsapp` to match the callback URL already registered in Meta for Developers.
- The 24-hour customer service window (required before sending free-text messages) is computed from the conversation's **last inbound message**, not overall conversation activity.
- This WABA's contacts use Meta's **Business-Scoped User ID (BSUID)** scheme (rolled out April–July 2026), not classic phone-number identifiers. Webhook payloads carry `user_id`/`from_user_id` instead of `wa_id`/`from`, and outbound sends must use `recipient` (with `recipient_type: "individual"`) instead of `to` — using `to` is silently accepted by the Graph API but never actually delivers. `Conversation.phoneNumber` is populated only if Meta ever includes the legacy fields as a fallback.
- No authentication/login and no automated tests are included — out of scope for this MVP.

## Sandbox (Cita / Reclamo flow tester)

Alongside the real chat inbox, `/` has a **Sandbox** tab: a simulated conversation tester for the two citizen-facing flows — scheduling a medical appointment ("Cita") and filing a complaint ("Reclamo") — driven by typing messages directly, no real WhatsApp needed. It runs its own small flat state machine (`lib/fsm/`) with a dedicated `SandboxSession` table (separate from `Conversation`/`Message`) and never touches the real chat.

It's **gated off by default** (`SANDBOX_ENABLED=false`) because this app has no authentication of its own — anyone hitting the public URL would otherwise see it.

Env vars (see `.env.example`):

- `SANDBOX_ENABLED` — must be `"true"` for `/api/sandbox` to respond (404 otherwise).
- `SANDBOX_USE_REAL_MINSA` — `"true"` calls the real MINSA APIs (identity + catalog/booking) and the real quejas API; `"false"` (default) uses hardcoded fake data (DNI `12345678`, OTP `1234`, distrito `lurigancho`).
- `SANDBOX_USE_REAL_RENIEC` — same toggle for the RENIEC lookup used by the Reclamo flow.
- `MINSA_API_HOST`, `MINSA_INTEGRATION_SECRET`, `MINSA_CONVERSATION_ID_PLACEHOLDER` — only needed when `SANDBOX_USE_REAL_MINSA=true`.
- `RENIEC_LOOKUP_BASE_URL` — only needed when `SANDBOX_USE_REAL_RENIEC=true`.
- `QUEJAS_API_BASE_URL` — the quejas API base URL (reused for both real and — with the flag off — skipped fake submission).

With everything left at its default (`false`), the Sandbox runs entirely offline against fixed test data.
