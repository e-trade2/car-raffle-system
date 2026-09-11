// ---- Telegram customer notifications ----
// Messages a customer's linked Telegram account when their order status
// changes (approved/rejected) or they win a raffle. This is a different use
// of TELEGRAM_BOT_TOKEN than verifyTelegramInitData in utils.js - that only
// verifies Mini App launches came from Telegram; this actually calls
// Telegram's Bot API to push a message out.
//
// The link between "this order" and "this Telegram chat" is the phone
// number: upsertTelegramUser (db.js) records {telegramId, phone, ...} the
// moment someone shares their contact with the bot, via POST /telegram/link
// in routes/public.js. sendMessage's chat_id can be that same numeric
// telegramId directly, because Telegram treats a bot's chat with a user who
// has started/messaged it as chat_id == user_id - no separate "chat id"
// needs to be tracked.
//
// Best-effort by design, same philosophy as alerts.js: a buyer who never
// linked Telegram (still the common case - it's optional) or who has
// blocked the bot must never cause the admin action that triggered the
// message (approve/reject/draw) to fail or even slow down. notifyCustomer
// swallows every failure itself so callers can fire-and-forget it after
// already sending their HTTP response, exactly like reportLockout in
// alerts.js is called without awaiting it.

const { normalizePhone } = require('./utils');

const TELEGRAM_API_BASE = 'https://api.telegram.org';

// Same Mini App the companion bot's MINI_APP_URL points at (see
// car-raffle-telegram-bot/bot.js) - kept as its own env var here rather than
// reusing INTERNAL_API_KEY/TELEGRAM_BOT_TOKEN's "shared with the bot" setup,
// because this one is just a public URL, not a secret, and this server may
// want to send it even if the bot integration itself isn't configured.
const MINI_APP_URL = process.env.MINI_APP_URL || '';
if (MINI_APP_URL && !/^https:\/\//.test(MINI_APP_URL)) {
  // Non-fatal here (unlike the bot's own startup check) - a Buy Now button
  // is a nice-to-have on top of the notification, not the entire point of
  // this process, so a bad URL should log loudly rather than crash the
  // whole server. Telegram will just silently reject the button at send
  // time otherwise, which is a much more confusing failure to debug.
  console.warn('⚠️  MINI_APP_URL is set but does not start with https:// - Telegram requires HTTPS for Mini App buttons, so Buy Now buttons will fail to send.');
}

const SUPPORTED_LANGS = ['om', 'am', 'en'];
const BUY_NOW_LABEL = {
  om: '🚗 Amma Bitadhu',
  am: '🚗 አሁን ይግዙ',
  en: '🚗 Buy Now'
};

/**
 * Inline "Buy Now" button that opens the raffle Mini App, for attaching to
 * any customer-facing Telegram message (order approved/rejected, winner
 * announcement, new raffle, general announcement). Returns null - meaning
 * "send with no button" - when MINI_APP_URL isn't configured, so this
 * feature is opt-in the same way the rest of the Telegram integration is:
 * every call site stays functional without it, just without the button.
 *
 * @param {string} [language] - 'om'/'am'/'en' (telegramUsers.language);
 *   falls back to English for anyone who hasn't picked one, or picked one
 *   this server doesn't recognize.
 */
function buyNowButton(language) {
  if (!MINI_APP_URL) return null;
  const lang = SUPPORTED_LANGS.includes(language) ? language : 'en';
  return {
    inline_keyboard: [[
      { text: BUY_NOW_LABEL[lang], web_app: { url: MINI_APP_URL } }
    ]]
  };
}

/**
 * Same as sendTelegramMessage, but sends a photo with the given text as its
 * caption instead of a text-only message - used when an announcement/new
 * raffle has an image attached. `photoUrl` must be a URL Telegram's own
 * servers can fetch (an absolute http(s) URL) - it does not accept a local
 * relative path or a raw file upload here, so callers with a locally-stored
 * image must resolve it to an absolute URL first (see toAbsoluteImageUrl in
 * routes/admin.js).
 *
 * Telegram caps photo captions at 1024 characters; anything longer is
 * truncated here rather than left to fail outright, since a caption that's
 * merely long is still far more useful delivered-and-trimmed than not
 * delivered at all.
 */
async function sendTelegramPhoto(chatId, photoUrl, caption, replyMarkup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const CAPTION_LIMIT = 1024;
  const safeCaption = caption && caption.length > CAPTION_LIMIT
    ? `${caption.slice(0, CAPTION_LIMIT - 1)}…`
    : caption;

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendPhoto`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      photo: photoUrl,
      caption: safeCaption,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    const detail = (body && body.description) || res.statusText;
    throw new Error(`Telegram sendPhoto failed (${res.status}): ${detail}`);
  }
  return body.result;
}

/**
 * Push the same message to every customer who has linked Telegram (skips
 * banned users) - the shared implementation behind both the general
 * Announcements broadcast and the "new raffle" broadcast in
 * routes/admin.js, which previously each ran their own near-identical
 * Promise.allSettled loop. Sends a photo (caption = text) when
 * opts.imageUrl is given, otherwise plain text - Buy Now button attached
 * either way, localized per-recipient same as notifyCustomer. Never
 * throws: one admin action pushing to hundreds of recipients must not be
 * able to fail the HTTP response, and one blocked/broken recipient must
 * not stop the rest from being messaged.
 *
 * @param {object} data - loaded db data (needs .telegramUsers)
 * @param {string} text
 * @param {object} [opts]
 * @param {string} [opts.imageUrl] - absolute https URL (see sendTelegramPhoto)
 * @param {boolean} [opts.includeBuyButton] - attach the "Buy Now" Mini App
 *   button to the push. Defaults to true (the original, always-on
 *   behavior) - pass false for an announcement where a buy button doesn't
 *   make sense (e.g. a general update or a warning unrelated to purchasing).
 * @returns {Promise<{total: number, sent: number, failed: number}>}
 */
async function notifyAllCustomers(data, text, opts = {}) {
  if (!isConfigured()) return { total: 0, sent: 0, failed: 0 };
  const includeBuyButton = opts.includeBuyButton !== false;
  const recipients = (data.telegramUsers || []).filter(u => !u.banned);
  const results = await Promise.allSettled(recipients.map(u => {
    const markup = includeBuyButton ? buyNowButton(u.language) : null;
    return opts.imageUrl
      ? sendTelegramPhoto(u.telegramId, opts.imageUrl, text, markup)
      : sendTelegramMessage(u.telegramId, text, markup);
  }));
  const failed = results.filter(r => r.status === 'rejected').length;
  return { total: recipients.length, sent: recipients.length - failed, failed };
}

function isConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

/**
 * Low-level send via Telegram's Bot API. Throws on missing config or a
 * non-ok response (e.g. 403 = user blocked the bot, 400 = chat not found) -
 * mirrors sendMail() in alerts.js, which also throws and leaves it to the
 * caller to decide whether a failure should be best-effort (swallowed) or
 * surfaced. notifyCustomer() below is the best-effort caller for this file;
 * nothing here needs the surfaced-error path today, but it's exported in
 * case a future caller wants the message to genuinely have to succeed.
 *
 * No parse_mode is set (plain text) - order data going into these messages
 * (raffle titles, rejection reasons) is admin-authored, not attacker
 * input, but plain text sidesteps ever having to think about escaping for
 * Telegram's HTML/Markdown parsers entirely.
 *
 * @param {object} [replyMarkup] - e.g. the result of buyNowButton(); passed
 *   through untouched, so any Telegram reply_markup shape works, not just
 *   this file's own buttons.
 */
async function sendTelegramMessage(chatId, text, replyMarkup) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
      ...(replyMarkup ? { reply_markup: replyMarkup } : {})
    })
  });

  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true) {
    const detail = (body && body.description) || res.statusText;
    throw new Error(`Telegram sendMessage failed (${res.status}): ${detail}`);
  }
  return body.result;
}

/**
 * Look up the Telegram account linked to an order's phone number and send
 * it a message. Never throws:
 *   - no TELEGRAM_BOT_TOKEN configured -> silent no-op (feature is optional)
 *   - phone was never linked to a Telegram account -> silent no-op (the
 *     normal case for anyone who didn't come in through the bot)
 *   - the send itself fails -> logged, not thrown
 * so every call site can fire this off after responding to the HTTP
 * request without a try/catch or .catch() of its own.
 *
 * Matching is normalized-phone-first (see utils.normalizePhone - handles
 * "0939752825" vs "251939752825" vs "+251939752825" all referring to the
 * same subscriber), with an exact-phone check kept as a belt-and-suspenders
 * fallback. If neither finds a link, and the caller knows this order's
 * Telegram @username (e.g. an admin typed it into the Approve Ticket form
 * because the phone on the order doesn't match what's on file), that's
 * tried last - usernames are stored on the same telegramUsers record
 * (upsertTelegramUser in db.js) whenever the user shared it with the bot.
 *
 * @param {object} data - loaded db data (needs .telegramUsers)
 * @param {object} order - the order to notify about; must have `.phone`
 * @param {string} text - message body
 * @param {object} [opts]
 * @param {string} [opts.username] - fallback @username (without '@') to
 *   match on if no telegramUsers record's phone matches this order's phone
 */
async function notifyCustomer(data, order, text, opts = {}) {
  try {
    if (!isConfigured()) return;
    const users = data.telegramUsers || [];
    const normalizedOrderPhone = normalizePhone(order.phone);
    let link = users.find(u => normalizedOrderPhone && normalizePhone(u.phone) === normalizedOrderPhone)
      || users.find(u => u.phone === order.phone);
    if (!link && opts.username) {
      const target = String(opts.username).replace(/^@/, '').toLowerCase();
      link = users.find(u => u.username && u.username.toLowerCase() === target);
    }
    if (!link) return; // this buyer never shared their phone (or username) with the bot
    await sendTelegramMessage(link.telegramId, text, buyNowButton(link.language));
  } catch (err) {
    console.error(`[telegram] Failed to notify order ${order.id} (phone ${order.phone}):`, err.message);
  }
}

/**
 * Resolve a Telegram @username to a numeric chat id, so the admin only
 * ever has to type the handle they already know rather than hunting down
 * an internal id. There is no Bot API call that goes "username -> chat
 * id" directly (sendMessage's chat_id accepts "@name" only for public
 * channels, never for a private user chat) - the only way a bot can learn
 * a user's chat id is from an update that user generated by messaging the
 * bot. getUpdates (long-poll style, no webhook required) returns the
 * last batch of those; this scans them for a message whose sender's
 * username matches, newest first, and returns that chat id.
 *
 * This only sees messages sent to the bot since Telegram last delivered
 * them elsewhere (getUpdates consumes its queue), so the admin has to
 * message the bot *before* clicking "Link Telegram" in Settings - the UI
 * copy says as much. Returns null (never throws) if nothing matches, so
 * the route can turn that into a friendly "we didn't see a message from
 * that username yet" instead of a 500.
 *
 * @param {string} username - without the leading '@', case-insensitive
 * @returns {Promise<string|null>} chat id as a string, or null
 */
async function findChatIdByUsername(username) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
  if (!username) return null;
  const target = username.replace(/^@/, '').toLowerCase();

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getUpdates?limit=100`);
  const body = await res.json().catch(() => null);
  if (!res.ok || !body || body.ok !== true || !Array.isArray(body.result)) {
    throw new Error(`Telegram getUpdates failed (${res.status}): ${(body && body.description) || res.statusText}`);
  }

  // Newest first: last() before first(), so a re-share/newer message from
  // the right person wins over a stale one still sitting in the batch.
  for (let i = body.result.length - 1; i >= 0; i--) {
    const msg = body.result[i].message || body.result[i].edited_message;
    const from = msg && msg.from;
    if (from && from.username && from.username.toLowerCase() === target) {
      return String(msg.chat.id);
    }
  }
  return null;
}

/**
 * Push a DM to every admin who has linked a Telegram chat id (see
 * findChatIdByUsername / POST /api/admin/telegram/link-account). Same
 * best-effort contract as notifyCustomer: never throws, so callers can
 * fire this off after already responding to the HTTP request. Each
 * admin's send is wrapped individually so one admin's blocked bot / bad
 * chat id can't stop the others from being notified.
 *
 * @param {object} data - loaded db data (needs .admins)
 * @param {string} text - message body
 */
async function notifyAdmin(data, text) {
  if (!isConfigured()) return;
  const targets = (data.admins || []).filter(a => a.telegramChatId);
  for (const admin of targets) {
    try {
      await sendTelegramMessage(admin.telegramChatId, text);
    } catch (err) {
      console.error(`[telegram] Failed to notify admin ${admin.username}:`, err.message);
    }
  }
}

module.exports = { sendTelegramMessage, sendTelegramPhoto, notifyCustomer, notifyAllCustomers, notifyAdmin, findChatIdByUsername, isConfigured, buyNowButton };
