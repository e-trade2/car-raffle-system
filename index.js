require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

const db = require('./db');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;

// Express sends "X-Powered-By: Express" on every response by default - free
// reconnaissance for an attacker (confirms the framework, narrows which
// CVEs/known issues to try) for zero benefit to real users. No reason to
// volunteer it.
app.disable('x-powered-by');

// Only trust the X-Forwarded-For header when explicitly told to (i.e. you've
// actually deployed behind a reverse proxy/load balancer like Render, Fly.io,
// Railway, or nginx). Trusting it unconditionally would let a client spoof
// their own IP and dodge the login rate limiter in server/routes/admin.js.
if (process.env.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Stops browsers from ever guessing a served file (e.g. a receipt/car photo
// upload) is something other than what its Content-Type says it is. Doesn't
// touch framing/CSP - deliberately not setting X-Frame-Options here since
// this is also served as a Telegram Mini App, which loads the page in an
// embedded webview that a blanket frame-deny would break.
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});

app.use(session({
  secret: process.env.SESSION_SECRET || 'change-this-secret-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 8 * 60 * 60 * 1000, // 8 hours
    httpOnly: true,
    // 'auto' = secure only over HTTPS (checks req.secure, which respects the
    // trust-proxy setting above) - stays usable over plain http://localhost
    // in dev, but won't send the session cookie in cleartext once deployed
    // behind HTTPS. sameSite:'lax' stops the cookie being attached to
    // cross-site POSTs, which is the main practical CSRF defense here since
    // the admin panel doesn't use separate CSRF tokens.
    secure: 'auto',
    sameSite: 'lax'
  }
}));

// Car photos (raffle listing images) are public marketing content, so they
// stay served as plain static files. Payment receipts live in this same
// uploads/ folder (at its root, not under cars/) but are NOT mounted here -
// they're financial documents, and a static mount means anyone who ever
// obtains the URL (leaked via browser history, a referrer header, a shared
// screenshot, etc.) can view it forever with zero access control beyond an
// unguessable filename. Receipts are only reachable through the
// authenticated GET /api/orders/:id/receipt route in routes/public.js.
const uploadsDir = path.join(__dirname, '..', 'uploads');
const carPhotosDir = path.join(uploadsDir, 'cars');
if (!fs.existsSync(carPhotosDir)) fs.mkdirSync(carPhotosDir, { recursive: true });
app.use('/uploads/cars', express.static(carPhotosDir));

// API routes
app.use('/api', publicRoutes);
app.use('/api/admin', adminRoutes);

// Static frontend (customer app + admin panel)
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// The two most common "forgot to finish setup" security gaps are both
// silent otherwise - the app works fine either way, so nothing forces you
// to notice before real customers/money show up. Print a loud warning
// instead of staying quiet about it.
function printStartupWarnings() {
  const warnings = [];
  if (!process.env.SESSION_SECRET) {
    warnings.push('SESSION_SECRET is not set in .env - falling back to the default secret checked into source. Set a long random SESSION_SECRET before going live.');
  }
  try {
    const data = db.load();
    const defaultPwAdmins = data.admins.filter(a => bcrypt.compareSync('admin123', a.passwordHash));
    if (defaultPwAdmins.length) {
      warnings.push(`Still using the default admin password (admin123) for: ${defaultPwAdmins.map(a => a.username).join(', ')}. Change it in Admin -> Settings -> Change Password.`);
    }
  } catch {
    // A broken check shouldn't block startup - worst case we just don't warn.
  }
  if (warnings.length) {
    console.warn('\n\u26A0\uFE0F  SECURITY WARNINGS:');
    warnings.forEach(w => console.warn(`   - ${w}`));
    console.warn('');
  }
}
printStartupWarnings();

app.listen(PORT, () => {
  console.log(`Car raffle system running at http://localhost:${PORT}`);
  console.log(`Admin panel at http://localhost:${PORT}/admin  (default: admin / admin123)`);
});
