const config = require('./config');
const db = require('./db');
const texts = require('./texts');

async function isSubscribed(telegram, userId) {
  if (!config.channelChatId) return true;
  try {
    const member = await telegram.getChatMember(config.channelChatId, userId);
    return ['member', 'administrator', 'creator'].includes(member.status);
  } catch (err) {
    console.error('Не вдалося перевірити підписку:', err.message);
    return false;
  }
}

// Checks the channel subscription for a user and, if newly verified, credits
// their referrer. Used by both the chat bot flow and the Mini App API so the
// two entry points can never disagree about when a referral counts.
async function checkAndCreditVerification(telegram, userId, isAdminUser) {
  const id = String(userId);
  const user = db.getUser(id);
  if (!user) return { subscribed: false, user: null };

  const subscribed = isAdminUser || (await isSubscribed(telegram, id));
  if (!subscribed) return { subscribed: false, user };

  if (!user.verified) {
    db.setVerified(id);
    if (user.referrerId && !user.referralCredited) {
      db.creditReferral(user.referrerId, config.referralBonus);
      db.markReferralCredited(id);
      const referrer = db.getUser(user.referrerId);
      try {
        await telegram.sendMessage(user.referrerId, texts.referralCreditedNotification(user, referrer, config));
      } catch (err) {
        console.error('Не вдалося сповістити реферера:', err.message);
      }
    }
  }

  return { subscribed: true, user: db.getUser(id) };
}

function computeStats() {
  const users = db.allUsers();
  const withdrawals = db.allWithdrawals();
  const pending = withdrawals.filter((w) => w.status === 'pending');
  const approved = withdrawals.filter((w) => w.status === 'approved');
  return {
    totalUsers: users.length,
    verifiedUsers: users.filter((u) => u.verified).length,
    totalReferrals: users.filter((u) => u.referralCredited).length,
    totalEarned: users.reduce((s, u) => s + u.totalEarned, 0),
    totalPaid: approved.reduce((s, w) => s + w.amount, 0),
    pendingCount: pending.length,
    pendingSum: pending.reduce((s, w) => s + w.amount, 0),
    top: users
      .filter((u) => u.referralsCount > 0)
      .sort((a, b) => b.referralsCount - a.referralsCount)
      .slice(0, 10),
  };
}

function referralLink(botUsername, userId) {
  return `https://t.me/${botUsername}?startapp=${userId}`;
}

module.exports = {
  isSubscribed,
  checkAndCreditVerification,
  computeStats,
  referralLink,
};
