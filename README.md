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
8. Customer checks "My Tickets" by phone number any time

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
  - Default login: **admin / admin123** — change this immediately in
    Admin → Settings → Change Password (or edit `data/db.json` before first run).

The first time it runs, `data/db.json` is created automatically with:
- One admin account (admin / admin123)
- One example raffle (BYD Yuan UP, 3,000 Birr/ticket, 3,500 numbers)
- Two bank accounts (Telebirr + CBE) — edit/remove these in Admin → Bank Accounts

### Forgot the admin username/password?

There's no email-based "forgot password" flow - recovery requires access to
the server itself, same as most small self-hosted apps. Run this on the
machine hosting the app:

```bash
npm run reset-admin -- <newUsername> <newPassword>
# e.g.
npm run reset-admin -- admin MyNewStrongPass123
```

This sets the admin's username/password to whatever you give it and clears
any active lockout, so you can log straight back in.

## Deploying

This app has zero native dependencies, so it runs anywhere Node.js runs:
**Render, Railway, Fly.io, a plain VPS, etc.**

1. Push/upload this folder to your host
2. Set environment variables (optional, see `.env.example`):
   - `PORT` — defaults to 3000
   - `SESSION_SECRET` — set this to a long random string in production
3. `npm install && npm start`

**Important:** `data/db.json` and `uploads/` must live on **persistent disk**.
On platforms with ephemeral filesystems (e.g. some serverless/Heroku setups),
attach a persistent volume, or migrate `server/db.js` to a real database.

### Telegram Mini App

The original file used `telegram-web-app.js` — that script tag is kept in
`public/index.html`, so this still works as a Telegram Mini App. Just point
your bot's Web App URL at your deployed domain.

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
  utils.js          Availability + formatting helpers
  routes/
    public.js       Customer API: raffles, numbers, orders, payment, tickets
    admin.js         Admin API: auth, raffle/bank CRUD, order approval, draw
public/
  index.html / app.js       Customer-facing app
  admin/index.html / admin.js   Admin panel
data/db.json         Auto-created on first run (raffles, orders, admins, banks)
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
