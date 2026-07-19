const { Markup } = require('telegraf');
const { bot } = require('./telegram');
const config = require('./config');
const db = require('./db');
const texts = require('./texts');

if (!config.adminIds.length) {
  console.warn('Увага: ADMIN_IDS порожній — ніхто не матиме доступу до адмін-панелі.');
}
if (!config.channelChatId) {
  console.warn('Увага: канал для верифікації не налаштовано (CHANNEL_USERNAME/CHANNEL_ID). Усі користувачі вважатимуться верифікованими автоматично, поки канал не буде додано.');
}
if (!config.miniAppUrl) {
  console.warn('Увага: MINI_APP_URL не задано — бот не зможе відкрити Mini App.');
}

// Telegram's client caches Mini App pages by URL, sometimes ignoring HTTP
// cache headers entirely. Appending a version tied to process start time
// makes every deploy look like a brand-new URL, forcing a fresh load.
const miniAppUrlVersioned = config.miniAppUrl
  ? `${config.miniAppUrl}${config.miniAppUrl.includes('?') ? '&' : '?'}v=${Date.now()}`
  : '';

function isAdmin(ctx) {
  return config.adminIds.includes(String(ctx.from.id));
}

function openAppKeyboard() {
  if (!config.miniAppUrl) return undefined;
  // Inline web_app buttons launch reliably across Telegram clients; the reply
  // (bottom) keyboard variant of the same button type is flakier on some
  // clients, where it needs the chat menu button instead to actually open.
  return Markup.inlineKeyboard([[Markup.button.webApp('🚀 Відкрити кабінет', miniAppUrlVersioned)]]);
}

// ---------- ensure every user exists in db ----------
bot.use(async (ctx, next) => {
  if (ctx.from) {
    const existing = db.getUser(ctx.from.id);
    if (!existing) {
      db.ensureUser(ctx.from.id, ctx.from, null);
    }
    if (isAdmin(ctx) && existing && !existing.verified) {
      db.setVerified(ctx.from.id);
    }
  }
  return next();
});

// ---------- /start ----------
// All actual functionality (balance, referral link, withdrawals, admin panel)
// lives in the Mini App now — the chat bot's only job is the entry point and
// capturing the referrer from a classic `?start=` deep link as a fallback for
// clients that don't open `?startapp=` links directly into the Mini App.
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  const payload = (ctx.startPayload || '').trim();
  const existing = db.getUser(id);

  if (payload && payload !== id && existing && !existing.referrerId && !existing.verified) {
    const candidate = db.getUser(payload);
    if (candidate) db.setReferrer(id, payload);
  }

  await ctx.reply(texts.startGreeting(), openAppKeyboard());
});

// ---------- admin: resolve withdrawal requests from chat notifications ----------
bot.action(/wd_approve_(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const wid = ctx.match[1];
  const w = db.getWithdrawal(wid);
  if (!w || w.status !== 'pending') return ctx.answerCbQuery('Заявку вже оброблено');
  db.resolveWithdrawal(wid, 'approved');
  db.addWithdrawn(w.userId, w.amount);
  await ctx.editMessageText(texts.adminWithdrawalResolved(w, 'approved'));
  await ctx.answerCbQuery('Позначено як виплачено');
  try {
    await ctx.telegram.sendMessage(w.userId, texts.withdrawalApproved(w, config));
  } catch (err) {
    console.error('Не вдалося сповістити користувача:', err.message);
  }
});

bot.action(/wd_reject_(\d+)/, async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  const wid = ctx.match[1];
  const w = db.getWithdrawal(wid);
  if (!w || w.status !== 'pending') return ctx.answerCbQuery('Заявку вже оброблено');
  db.resolveWithdrawal(wid, 'rejected');
  db.updateBalance(w.userId, w.amount);
  await ctx.editMessageText(texts.adminWithdrawalResolved(w, 'rejected'));
  await ctx.answerCbQuery('Відхилено, кошти повернено');
  try {
    await ctx.telegram.sendMessage(w.userId, texts.withdrawalRejected(w, config));
  } catch (err) {
    console.error('Не вдалося сповістити користувача:', err.message);
  }
});

// ---------- any other message: point back to the app ----------
bot.on('text', async (ctx) => {
  await ctx.reply(texts.startGreeting(), openAppKeyboard());
});

bot.catch((err, ctx) => {
  console.error(`Помилка обробки update ${ctx.updateType}:`, err);
});

async function setupMenuButton() {
  if (!config.miniAppUrl) return;
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: 'Кабінет', web_app: { url: miniAppUrlVersioned } },
    });
  } catch (err) {
    console.error('Не вдалося встановити кнопку меню Mini App:', err.message);
  }
}

module.exports = { bot, setupMenuButton };
