require('dotenv').config();

const channelUsername = (process.env.CHANNEL_USERNAME || '').trim();
const channelId = (process.env.CHANNEL_ID || '').trim();

const channelChatId = channelUsername || channelId || '';
const channelInviteLink = (process.env.CHANNEL_INVITE_LINK || '').trim()
  || (channelUsername ? `https://t.me/${channelUsername.replace(/^@/, '')}` : '');

module.exports = {
  botToken: (process.env.BOT_TOKEN || '').trim(),
  adminIds: (process.env.ADMIN_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  channelChatId,
  channelInviteLink,
  referralBonus: Number(process.env.REFERRAL_BONUS || 7),
  minWithdrawal: Number(process.env.MIN_WITHDRAWAL || 70),
  supportContact: (process.env.SUPPORT_CONTACT || '@support').trim(),
  miniAppUrl: (process.env.MINI_APP_URL || '').trim(),
  port: Number(process.env.PORT || 3000),
};
