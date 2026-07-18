const path = require('path');
const express = require('express');
const { bot } = require('./telegram');
const config = require('./config');
const db = require('./db');
const kb = require('./keyboards');
const texts = require('./texts');
const services = require('./services');
const { telegramAuthMiddleware } = require('./telegramAuth');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

function isAdminId(id) {
  return config.adminIds.includes(String(id));
}

function displayName(user) {
  if (!user) return 'Користувач';
  if (user.username) return `@${user.username}`;
  return user.firstName || `id${user.id}`;
}

function serializeUser(user, botUsername) {
  return {
    id: user.id,
    balance: round2(user.balance),
    totalEarned: round2(user.totalEarned),
    totalWithdrawn: round2(user.totalWithdrawn),
    referralsCount: user.referralsCount,
    verified: user.verified,
    referralLink: services.referralLink(botUsername, user.id),
    referralBonus: config.referralBonus,
    minWithdrawal: config.minWithdrawal,
    isAdmin: isAdminId(user.id),
    channelInviteLink: config.channelInviteLink,
    supportContact: config.supportContact,
  };
}

function round2(n) {
  return Math.round(Number(n) * 100) / 100;
}

// Ensures the caller has a row in the DB, capturing the referrer from
// start_param on first contact — mirrors bot.js's /start handler for users
// who land in the Mini App before ever talking to the bot in chat.
function ensureCallerUser(req) {
  const id = String(req.tgUser.id);
  let user = db.getUser(id);
  if (!user) {
    const referrerId = req.startParam && req.startParam !== id ? req.startParam : null;
    const referrerExists = referrerId && db.getUser(referrerId);
    user = db.ensureUser(id, req.tgUser, referrerExists ? referrerId : null);
  }
  if (isAdminId(id) && !user.verified) {
    db.setVerified(id);
    user = db.getUser(id);
  }
  return user;
}

app.use('/api', telegramAuthMiddleware);

app.get('/api/me', async (req, res) => {
  const user = ensureCallerUser(req);
  const botInfo = await bot.telegram.getMe();
  res.json(serializeUser(user, botInfo.username));
});

app.post('/api/verify', async (req, res) => {
  const id = String(req.tgUser.id);
  ensureCallerUser(req);
  const result = await services.checkAndCreditVerification(bot.telegram, id, isAdminId(id));
  const botInfo = await bot.telegram.getMe();
  res.json({
    subscribed: result.subscribed,
    user: result.user ? serializeUser(result.user, botInfo.username) : null,
  });
});

app.get('/api/referrals', (req, res) => {
  const id = String(req.tgUser.id);
  const referrals = db.allUsers()
    .filter((u) => u.referrerId === id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map((u) => ({
      name: displayName(u),
      joinedAt: u.createdAt,
      credited: u.referralCredited,
    }));
  res.json({ referrals });
});

app.post('/api/withdraw', async (req, res) => {
  const id = String(req.tgUser.id);
  const user = db.getUser(id);
  if (!user || !user.verified) return res.status(403).json({ error: 'not_verified' });

  const requisites = String((req.body && req.body.requisites) || '').trim();
  if (!requisites) return res.status(400).json({ error: 'requisites_required' });
  if (user.balance < config.minWithdrawal) return res.status(400).json({ error: 'balance_too_low' });

  const amount = user.balance;
  db.updateBalance(id, -amount);
  const w = db.createWithdrawal(id, amount, requisites);

  for (const adminId of config.adminIds) {
    try {
      await bot.telegram.sendMessage(adminId, texts.adminNewWithdrawal(w, user), kb.withdrawalActions(w.id));
    } catch (err) {
      console.error('Не вдалося сповістити адміна:', err.message);
    }
  }

  res.json({ ok: true, amount: round2(amount) });
});

function requireAdmin(req, res, next) {
  if (!isAdminId(req.tgUser.id)) return res.status(403).json({ error: 'forbidden' });
  return next();
}

app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const stats = services.computeStats();
  res.json({
    totalUsers: stats.totalUsers,
    verifiedUsers: stats.verifiedUsers,
    totalReferrals: stats.totalReferrals,
    totalEarned: round2(stats.totalEarned),
    totalPaid: round2(stats.totalPaid),
    pendingCount: stats.pendingCount,
    pendingSum: round2(stats.pendingSum),
    top: stats.top.map((u) => ({
      name: displayName(u),
      referralsCount: u.referralsCount,
      totalEarned: round2(u.totalEarned),
    })),
  });
});

app.get('/api/admin/requests', requireAdmin, (req, res) => {
  const pending = db.pendingWithdrawals().map((w) => {
    const user = db.getUser(w.userId);
    return {
      id: w.id,
      amount: round2(w.amount),
      requisites: w.requisites,
      createdAt: w.createdAt,
      user: displayName(user),
      userId: w.userId,
    };
  });
  res.json({ requests: pending });
});

app.post('/api/admin/withdrawals/:id/:action', requireAdmin, async (req, res) => {
  const { id, action } = req.params;
  if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'bad_action' });

  const w = db.getWithdrawal(id);
  if (!w || w.status !== 'pending') return res.status(409).json({ error: 'already_resolved' });

  if (action === 'approve') {
    db.resolveWithdrawal(id, 'approved');
    db.addWithdrawn(w.userId, w.amount);
    try {
      await bot.telegram.sendMessage(w.userId, texts.withdrawalApproved(w, config));
    } catch (err) {
      console.error('Не вдалося сповістити користувача:', err.message);
    }
  } else {
    db.resolveWithdrawal(id, 'rejected');
    db.updateBalance(w.userId, w.amount);
    try {
      await bot.telegram.sendMessage(w.userId, texts.withdrawalRejected(w, config));
    } catch (err) {
      console.error('Не вдалося сповістити користувача:', err.message);
    }
  }

  res.json({ ok: true });
});

app.post('/api/admin/broadcast', requireAdmin, async (req, res) => {
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });

  const users = db.allUsers();
  res.json({ ok: true, total: users.length });

  let success = 0;
  let fail = 0;
  for (const u of users) {
    try {
      await bot.telegram.sendMessage(u.id, text);
      success += 1;
    } catch (err) {
      fail += 1;
    }
    await new Promise((resolve) => setTimeout(resolve, 60));
  }
  console.log(`Розсилка через Mini App завершена: успішно ${success}, помилок ${fail}`);
});

app.use((err, req, res, next) => {
  console.error('Помилка API:', err);
  res.status(500).json({ error: 'internal_error' });
});

function startServer() {
  return app.listen(config.port, () => {
    console.log(`Mini App API запущено на порту ${config.port}`);
  });
}

module.exports = { app, startServer };
