const { Markup } = require('telegraf');
const { bot } = require('./telegram');
const config = require('./config');
const db = require('./db');
const texts = require('./texts');
const kb = require('./keyboards');
const services = require('./services');

if (!config.adminIds.length) {
  console.warn('Увага: ADMIN_IDS порожній — ніхто не матиме доступу до адмін-панелі.');
}
if (!config.channelChatId) {
  console.warn('Увага: канал для верифікації не налаштовано (CHANNEL_USERNAME/CHANNEL_ID). Усі користувачі вважатимуться верифікованими автоматично, поки канал не буде додано.');
}
if (!config.miniAppUrl) {
  console.warn('Увага: MINI_APP_URL не задано — кнопка відкриття Mini App у боті буде прихована.');
}

// userId -> { type: 'withdraw' | 'broadcast' }
const pendingAction = new Map();

function isAdmin(ctx) {
  return config.adminIds.includes(String(ctx.from.id));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function mainMenuKeyboard(userId, cfg) {
  const base = kb.mainMenu(userId, cfg);
  if (!cfg.miniAppUrl) return base;
  const rows = [[Markup.button.webApp('🚀 Особистий кабінет', cfg.miniAppUrl)], ...base.reply_markup.keyboard];
  return Markup.keyboard(rows).resize();
}

function requireVerified(ctx, next) {
  const user = db.getUser(ctx.from.id);
  if (isAdmin(ctx) || (user && user.verified)) return next();
  return ctx.reply(texts.welcomeSubscribe(config, null), kb.subscribe(config));
}

function requireAdmin(ctx, next) {
  if (!isAdmin(ctx)) return ctx.reply(texts.accessDenied());
  return next();
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
bot.start(async (ctx) => {
  const id = String(ctx.from.id);
  const payload = (ctx.startPayload || '').trim();

  let referrerUser = null;
  const existing = db.getUser(id);

  if (payload && payload !== id) {
    const candidate = db.getUser(payload);
    if (candidate && !existing.referrerId && !existing.verified) {
      db.setReferrer(id, payload);
      referrerUser = candidate;
    }
  }

  if (isAdmin(ctx)) {
    return ctx.reply(texts.welcomeBack(), mainMenuKeyboard(id, config));
  }

  if (existing.verified) {
    return ctx.reply(texts.welcomeBack(), mainMenuKeyboard(id, config));
  }

  return ctx.reply(texts.welcomeSubscribe(config, referrerUser), kb.subscribe(config));
});

// ---------- verification ----------
bot.action('verify_subscription', async (ctx) => {
  await ctx.answerCbQuery();
  const id = String(ctx.from.id);
  const result = await services.checkAndCreditVerification(ctx.telegram, id, isAdmin(ctx));
  if (!result.subscribed) {
    return ctx.reply(texts.notSubscribedYet(), kb.subscribe(config));
  }
  return ctx.reply(texts.verifiedWelcome(), mainMenuKeyboard(id, config));
});

// ---------- main menu: balance ----------
bot.hears('💰 Баланс', requireVerified, async (ctx) => {
  const user = db.getUser(ctx.from.id);
  await ctx.reply(texts.balance(user, config));
});

// ---------- main menu: referral link ----------
bot.hears('🔗 Моє посилання', requireVerified, async (ctx) => {
  const link = services.referralLink(ctx.botInfo.username, ctx.from.id);
  await ctx.reply(texts.referralLink(link, config), kb.shareLink(link, texts.shareText(config)));
});

// ---------- main menu: my referrals ----------
bot.hears('👥 Мої реферали', requireVerified, async (ctx) => {
  const id = String(ctx.from.id);
  const referrals = db.allUsers().filter((u) => u.referrerId === id);
  const link = services.referralLink(ctx.botInfo.username, id);
  await ctx.reply(texts.myReferrals(referrals, link));
});

// ---------- main menu: withdraw ----------
bot.hears('💸 Вивести кошти', requireVerified, async (ctx) => {
  const id = String(ctx.from.id);
  const user = db.getUser(id);
  if (user.balance < config.minWithdrawal) {
    return ctx.reply(texts.notEnoughBalance(user, config));
  }
  pendingAction.set(id, { type: 'withdraw' });
  await ctx.reply(texts.askRequisites(user), kb.cancelOnly());
});

// ---------- how it works ----------
bot.hears('ℹ️ Як це працює?', async (ctx) => {
  await ctx.reply(texts.howItWorks(config));
});

// ---------- cancel ----------
bot.hears('❌ Скасувати', async (ctx) => {
  pendingAction.delete(String(ctx.from.id));
  await ctx.reply(texts.cancelled(), mainMenuKeyboard(ctx.from.id, config));
});

// ---------- admin: menu entry ----------
bot.hears('🛠 Адмін-панель', requireAdmin, async (ctx) => {
  await ctx.reply(texts.adminMenuIntro(), kb.adminMenu());
});
bot.command('admin', requireAdmin, async (ctx) => {
  await ctx.reply(texts.adminMenuIntro(), kb.adminMenu());
});

bot.action('admin_stats', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  await ctx.reply(texts.adminStats(services.computeStats()));
});

bot.action('admin_requests', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  const pending = db.pendingWithdrawals();
  if (!pending.length) {
    return ctx.reply(texts.noRequests());
  }
  for (const w of pending) {
    const user = db.getUser(w.userId);
    await ctx.reply(texts.adminNewWithdrawal(w, user), kb.withdrawalActions(w.id));
  }
});

bot.action('admin_broadcast', async (ctx) => {
  if (!isAdmin(ctx)) return ctx.answerCbQuery();
  await ctx.answerCbQuery();
  pendingAction.set(String(ctx.from.id), { type: 'broadcast' });
  await ctx.reply(texts.askBroadcastText(), kb.cancelOnly());
});

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

// ---------- free-text fallback: pending actions ----------
bot.on('text', async (ctx) => {
  const id = String(ctx.from.id);
  const action = pendingAction.get(id);

  if (action && action.type === 'withdraw') {
    pendingAction.delete(id);
    const user = db.getUser(id);
    const requisites = ctx.message.text.trim();
    if (user.balance < config.minWithdrawal) {
      return ctx.reply(texts.notEnoughBalance(user, config), mainMenuKeyboard(id, config));
    }
    const amount = user.balance;
    db.updateBalance(id, -amount);
    const w = db.createWithdrawal(id, amount, requisites);
    await ctx.reply(texts.withdrawRequested(amount), mainMenuKeyboard(id, config));
    for (const adminId of config.adminIds) {
      try {
        await ctx.telegram.sendMessage(adminId, texts.adminNewWithdrawal(w, user), kb.withdrawalActions(w.id));
      } catch (err) {
        console.error('Не вдалося сповістити адміна:', err.message);
      }
    }
    return;
  }

  if (action && action.type === 'broadcast') {
    if (!isAdmin(ctx)) {
      pendingAction.delete(id);
      return;
    }
    pendingAction.delete(id);
    const messageText = ctx.message.text;
    const users = db.allUsers();
    await ctx.reply(texts.broadcastStarted(users.length));
    let success = 0;
    let fail = 0;
    for (const u of users) {
      try {
        await ctx.telegram.sendMessage(u.id, messageText);
        success += 1;
      } catch (err) {
        fail += 1;
      }
      await sleep(60);
    }
    return ctx.reply(texts.broadcastDone(success, fail), mainMenuKeyboard(id, config));
  }

  await ctx.reply(texts.unknownCommand());
});

bot.catch((err, ctx) => {
  console.error(`Помилка обробки update ${ctx.updateType}:`, err);
});

async function setupMenuButton() {
  if (!config.miniAppUrl) return;
  try {
    await bot.telegram.setChatMenuButton({
      menuButton: { type: 'web_app', text: 'Кабінет', web_app: { url: config.miniAppUrl } },
    });
  } catch (err) {
    console.error('Не вдалося встановити кнопку меню Mini App:', err.message);
  }
}

module.exports = { bot, setupMenuButton };
