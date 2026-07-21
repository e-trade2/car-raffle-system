# Car Raffle System — Getachew Fikadu Jirata

A full ticket-raffle system: customer-facing app (home → detail → number picker →
checkout → payment receipt upload → my tickets) plus an admin panel to manage
raffles, bank accounts, and approve/reject payments.

Matches the flow from the app screenshots:
1. Home — active raffle(s), countdown, progress bar
2. Detail — pick quantity, pick your own lucky numbers or buy random
3. Number grid — see taken (red) / available (dark) numbers live
4. Checkout step 1/3 — confirm order, enter name + phone
5. Checkout step 2/3 — pick a bank/Telebirr account, upload payment receipt
6. Checkout step 3/3 — "awaiting admin approval" status
7. Admin approves or rejects from the admin panel → ticket becomes Confirmed
8. Customer checks "My Tickets" using their phone number + the Customer ID
   they were given at checkout (a second factor so one buyer can't look up
   another buyer's tickets by phone number alone)

## Stack

- **Backend:** Node.js + Express
- **Storage:** a single JSON file (`data/db.json`) — no database server to install.
  Good for a raffle with up to a few thousand tickets. If you outgrow it later,
  swap `server/db.js` for a real database without touching the routes much.
- **Auth:** simple session-based admin login (username/password)
- **Uploads:** payment receipt images stored in `/uploads`, served only through
  the app (admin panel shows them in a lightbox)

## Quick start (local)

```bash
npm install
npm start
```

- Customer app: http://localhost:3000
- Admin panel: http://localhost:3000/admin
  - Login: **admin** / a random password generated the first time the
    server runs (printed once to the console — see below). Save it, then
    change it in Admin → Settings → Change Password whenever you like.

The first time it runs, `data/db.json` is created automatically with:
- One admin account (username `admin`, password randomly generated and
  printed to the console on that first run only — if you lose it, recover
  with `node server/reset-admin.js <username> <password>` rather than
  deleting `data/db.json`, which would also wipe every raffle/order on file)
- One example raffle (BYD Yuan UP, 3,000 Birr/ticket, 3,500 numbers)
- Two bank accounts (Telebirr + CBE) — edit/remove these in Admin → Bank Accounts

### Forgot the admin username/password?

Two ways to recover, in order of what to try first:

1. **Email reset** (if set up): Admin → Settings → set a Recovery Email once
   (requires `SMTP_*` configured in `.env` — see `.env.example`). After that,
   "Forgot password?" on the login screen emails a reset link.
2. **Server script** (always available, no setup needed): run this on the
   machine hosting the app:

```bash
npm run reset-admin -- <newUsername> <newPassword>
# e.g.
npm run reset-admin -- admin MyNewStrongPass123
```

This sets the admin's username/password to whatever you give it, clears any
active lockout, and invalidates any outstanding email reset link, so you can
log straight back in.

## Deploying

This app has zero native dependencies, so it runs anywhere Node.js runs:
**Render, Railway, Fly.io, a plain VPS, etc.**

1. Push/upload this folder to your host
2. Set environment variables - `PORT` and `SESSION_SECRET` are the two that
   matter for a basic deploy; see `.env.example` for the full list (Telegram
   bot bridge, SMTP for lockout alerts + admin password reset, etc.) - all
   optional, the app runs fine with just the two above
3. `npm install && npm start`

**Important:** `data/db.json` and `uploads/` must live on **persistent disk**.
On platforms with ephemeral filesystems (e.g. some serverless/Heroku setups),
attach a persistent volume, or migrate `server/db.js` to a real database.

### Telegram Mini App

This app can be opened as a Telegram Mini App - `telegram-web-app.js` is
already loaded in `public/index.html`, and it calls `Telegram.WebApp.ready()`/
`expand()` automatically when present. Point your bot's Web App URL (via
@BotFather → Menu Button, or a `web_app` button like the companion
`car-raffle-telegram-bot` repo sends) at your deployed domain.

**Optional: auto-fill name/phone from the bot.** If you're using the
companion Telegram bot, it can hand off the phone number it collects to this
app, so the Mini App opens with checkout already filled in instead of asking
the buyer to retype it. To enable:

1. Set `INTERNAL_API_KEY` (same random string in both this app's `.env` and
   the bot's `.env`) and `TELEGRAM_BOT_TOKEN` (same token as the bot's
   `BOT_TOKEN`) here - see `.env.example`.
2. The bot then calls `POST /api/telegram/link` after each contact share,
   and the Mini App calls `POST /api/telegram/prefill` on load, which
   verifies Telegram's signed `initData` before returning anything (see
   `verifyTelegramInitData` in `server/utils.js`).

Leaving these unset is fine - the app just won't prefill anything, and
buyers type their name/phone like normal.

## How ticket numbers avoid double-booking

- When a customer starts checkout, their chosen (or randomly assigned) numbers
  are marked **pending** and reserved for **30 minutes**.
- If they finish payment + upload a receipt, the order becomes **pending admin
  review** — numbers stay reserved.
- If admin **approves**, numbers become **permanently taken** and the order is
  **confirmed**.
- If admin **rejects**, or the 30-minute window expires without payment, the
  numbers are released back to the pool automatically.

## Project structure

```
server/
  index.js          Express app entrypoint
  db.js             JSON-file data store (load/save/sweep expired reservations)
  utils.js          Availability, formatting, and Telegram initData verification
  alerts.js         Email sending (lockout alerts + password-reset emails)
  reset-admin.js    Server-side admin recovery script (npm run reset-admin)
  routes/
    public.js       Customer API: raffles, numbers, orders, payment, tickets,
                     Telegram bot bridge (/telegram/link, /telegram/prefill)
    admin.js         Admin API: auth, forgot/reset password, raffle/bank CRUD,
                     order approval, draw
public/
  index.html / app.js            Customer-facing app
  admin/
    index.html / admin.js        Admin panel
    reset-password.html          Standalone page opened from reset emails
data/db.json         Auto-created on first run (raffles, orders, admins, banks,
                     customers, telegramUsers)
uploads/              Payment receipt images
```

## Notes / next steps you may want

- **Real payment integration** (Telebirr/Chapa API) instead of manual receipt
  review — the current flow assumes an admin manually checks each receipt,
  matching what your screenshots showed.
- **SMS/Telegram notifications** to the buyer when their order is approved.
- **Multiple admin accounts / roles** — currently a single shared admin login.
- Swap the JSON store for Postgres/MySQL if ticket volume gets large
  (thousands of concurrent buyers) — the route logic won't need to change much,
  only `server/db.js`.
