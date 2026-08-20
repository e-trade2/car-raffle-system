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

const TELEGRAM_API_BASE = 'https://api.telegram.org';

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
 */
async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  const res = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
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
 * @param {object} data - loaded db data (needs .telegramUsers)
 * @param {object} order - the order to notify about; must have `.phone`
 * @param {string} text - message body
 */
async function notifyCustomer(data, order, text) {
  try {
    if (!isConfigured()) return;
    const link = (data.telegramUsers || []).find(u => u.phone === order.phone);
    if (!link) return; // this buyer never shared their phone with the bot
    await sendTelegramMessage(link.telegramId, text);
  } catch (err) {
    console.error(`[telegram] Failed to notify order ${order.id} (phone ${order.phone}):`, err.message);
  }
}

module.exports = { sendTelegramMessage, notifyCustomer, isConfigured };
