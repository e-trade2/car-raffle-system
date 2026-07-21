// ---- Security alerting ----
// Lockouts (account or IP) previously only went into data/db.json and the
// console - nobody would notice unless they happened to be watching the
// terminal or tried to log in themselves. This module sends an email when
// lockouts start piling up, so a real brute-force attempt doesn't go
// unnoticed for hours or days.
//
// It's opt-in: if SMTP_* env vars aren't set, alerts just log a clear
// warning to the console instead of silently failing or throwing. That
// keeps the app runnable out of the box without forcing every deployment
// to wire up an email account.
//
// Alerts are debounced per-key so a single confused user mistyping their
// password a few times doesn't start blasting your inbox - only repeated
// lockout activity within the window triggers a send.

let nodemailer;
try {
  nodemailer = require('nodemailer');
} catch {
  nodemailer = null; // package.json lists it as a dependency; this guard just
  // avoids a hard crash if someone strips it out of node_modules manually.
}

const ALERT_DEBOUNCE_MS = 10 * 60 * 1000; // don't re-alert on the same key more than once per 10 min
const ALERT_ESCALATE_COUNT = 3; // only alert once a key has fired at least this many times in the window

const lockoutCounts = new Map(); // key -> { count, windowStart, lastAlertedAt }

let transporter = null;
function getTransporter() {
  if (transporter) return transporter;
  if (!nodemailer) return null;
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT) return null;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: SMTP_USER ? { user: SMTP_USER, pass: SMTP_PASS } : undefined
  });
  return transporter;
}

/**
 * Send a plain-text email via the configured SMTP transport. Used both by
 * reportLockout below and by the password-reset flow in routes/admin.js.
 * Throws if SMTP isn't configured or the send fails - callers that treat
 * email as best-effort (like reportLockout) should catch/ignore; callers
 * where the email IS the point (like password reset) should let the
 * failure surface as an error response rather than silently pretending
 * it sent.
 */
async function sendMail({ to, subject, text }) {
  const t = getTransporter();
  if (!t) {
    throw new Error('SMTP is not configured (SMTP_HOST/SMTP_PORT in .env)');
  }
  await t.sendMail({ from: process.env.ALERT_EMAIL_FROM || SafeFrom(), to, subject, text });
}

/**
 * Record a lockout-type security event and send an email alert if it's
 * happening repeatedly. Safe to call unconditionally - never throws, and
 * is a no-op (beyond a console line) when email isn't configured.
 *
 * @param {string} key - groups related events, e.g. `account:<username>` or `ip:<ip>`
 * @param {string} summary - short human-readable description for the log/email
 */
function reportLockout(key, summary) {
  const now = Date.now();
  const entry = lockoutCounts.get(key);
  if (!entry || now - entry.windowStart > ALERT_DEBOUNCE_MS) {
    lockoutCounts.set(key, { count: 1, windowStart: now, lastAlertedAt: 0 });
  } else {
    entry.count += 1;
  }
  const current = lockoutCounts.get(key);

  console.warn(`[security] ${summary} (key=${key}, count in window=${current.count})`);

  if (current.count < ALERT_ESCALATE_COUNT) return;
  if (now - current.lastAlertedAt < ALERT_DEBOUNCE_MS) return; // already alerted recently for this key

  const to = process.env.ALERT_EMAIL_TO;
  if (!to || !getTransporter()) {
    console.warn(
      '[security] Repeated lockout activity detected, but no email alert was sent because ' +
      'ALERT_EMAIL_TO / SMTP_* are not configured in .env. See .env.example.'
    );
    return;
  }

  current.lastAlertedAt = now;

  sendMail({
    to,
    subject: `[Raffle admin] Repeated security-relevant lockouts - ${key}`,
    text:
      `${summary}\n\n` +
      `This is the ${current.count}th lockout-related event for "${key}" in the last ` +
      `${Math.round(ALERT_DEBOUNCE_MS / 60000)} minutes.\n\n` +
      `If this isn't you, someone may be trying to brute-force an admin login.`
  }).catch(err => {
    console.error('[security] Failed to send lockout alert email:', err.message);
  });
}

function SafeFrom() {
  return process.env.SMTP_USER || 'alerts@localhost';
}

module.exports = { reportLockout, sendMail };
