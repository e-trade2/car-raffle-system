const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');

// Empty folders don't survive zip/git, so `data/` may not exist on a fresh
// checkout even though it's in the repo layout. Create it up front, same as
// uploads/ already does in index.js and routes/public.js.
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function defaultData() {
  return {
    admins: [
      {
        id: nanoid(8),
        username: 'admin',
        // default password: "admin123" -- CHANGE THIS after first login
        passwordHash: bcrypt.hashSync('admin123', 10),
        failedLoginAttempts: 0,
        lockedUntil: null,
        createdAt: new Date().toISOString()
      }
    ],
    raffles: [
      {
        id: nanoid(8),
        title: 'BYD Yuan UP',
        subtitle: 'Time Grey',
        imageUrl: '',
        price: 3000,
        totalNumbers: 3500,
        rating: 5.0,
        status: 'active', // active | ended
        badge: 'new', // new | hot | none
        drawAt: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
        takenNumbers: [],
        pending: {}, // { "348": { orderId, reservedUntil } }
        createdAt: new Date().toISOString()
      }
    ],
    orders: [],
    // One record per phone number, created the first time that phone is
    // used on an order. The `id` is a second factor a ticket-lookup caller
    // must present alongside the phone number - see getOrCreateCustomer()
    // and GET /tickets in routes/public.js.
    customers: [],
    banks: [
      { id: nanoid(6), name: 'Telebirr', holder: 'Getachew', account: '0924242419' },
      { id: nanoid(6), name: 'Commercial Bank of Ethiopia', holder: 'Getachew Fikadu Jirata', account: '1000528139489' }
    ]
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    save(defaultData());
  }
  const raw = fs.readFileSync(DATA_FILE, 'utf-8');
  const data = JSON.parse(raw);

  // Back-compat for db.json files written before `customers` existed:
  // without this, every phone number from before the upgrade would have
  // no customer id and could never pass the GET /tickets check below.
  if (!Array.isArray(data.customers)) data.customers = [];
  let migrated = false;
  for (const order of data.orders) {
    if (!order.phone) continue;
    const customer = getOrCreateCustomer(data, order.phone);
    if (order.customerId !== customer.id) {
      order.customerId = customer.id;
      migrated = true;
    }
  }
  if (migrated) save(data);

  return data;
}

// Looks up the customer record for a phone number, creating one (with a
// fresh id) the first time that phone is seen. The id is meant to travel
// back to the buyer once, at order-creation time, and be re-entered
// alongside the phone number to authorize a ticket lookup - a phone number
// alone is guessable/knowable by other people, so it can't be trusted as
// the sole key for handing back someone's order history and receipts.
function getOrCreateCustomer(data, phone) {
  let customer = data.customers.find(c => c.phone === phone);
  if (!customer) {
    customer = { id: nanoid(8).toUpperCase(), phone, createdAt: new Date().toISOString() };
    data.customers.push(customer);
  }
  return customer;
}

function save(data) {
  // Node is single-threaded and writeFileSync is synchronous, so this is
  // safe against concurrent corruption for this app's request volume.
  const tmpFile = DATA_FILE + '.tmp';
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2));
  fs.renameSync(tmpFile, DATA_FILE);
  return data;
}

// Sweep expired reservations back to available.
//
// Iterates orders (the source of truth for status), not raffle.pending -
// a raffle.pending entry can already be gone (deleted by a previous, buggy
// sweep run, or never written due to a crash) while the order itself is
// still incorrectly sitting in 'awaiting_payment'. Driving this off orders
// means any such already-broken order gets self-healed the next time this
// runs, instead of staying stuck forever just because its pending-map
// breadcrumb disappeared.
//
// Only 'awaiting_payment' orders are time-limited. Once a receipt is
// uploaded (status -> 'pending'), the buyer has already acted and is just
// waiting on the admin - time alone must never expire that out from under
// them; only an explicit admin reject should. Applying the same 30-minute
// clock to 'pending' orders was a real bug: a slow admin review could
// silently expire an order the buyer had already paid for.
function sweepExpired(data) {
  const now = Date.now();
  let changed = false;
  for (const order of data.orders) {
    if (order.status !== 'awaiting_payment') continue;
    if (!order.reservedUntil || new Date(order.reservedUntil).getTime() >= now) continue;

    order.status = 'expired';
    changed = true;

    const raffle = data.raffles.find(r => r.id === order.raffleId);
    if (raffle && raffle.pending) {
      for (const n of order.ticketNumbers) {
        const p = raffle.pending[String(n)];
        // Only clear the slot if it still points at *this* expired order -
        // a later order may have legitimately re-reserved the same number
        // after this one lapsed, and that must not be stolen back.
        if (p && p.orderId === order.id) delete raffle.pending[String(n)];
      }
    }
  }
  if (changed) save(data);
  return data;
}

module.exports = { load, save, sweepExpired, defaultData, getOrCreateCustomer, DATA_FILE };
