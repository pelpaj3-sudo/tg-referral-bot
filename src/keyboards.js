const { Markup } = require('telegraf');

function mainMenu(userId, config) {
  const rows = [
    ['💰 Баланс', '🔗 Моє посилання'],
    ['👥 Мої реферали', '💸 Вивести кошти'],
    ['ℹ️ Як це працює?'],
  ];
  if (config.adminIds.includes(String(userId))) {
    rows.push(['🛠 Адмін-панель']);
  }
  return Markup.keyboard(rows).resize();
}

function cancelOnly() {
  return Markup.keyboard([['❌ Скасувати']]).resize();
}

function subscribe(config) {
  const buttons = [];
  if (config.channelInviteLink) {
    buttons.push([Markup.button.url('📢 Перейти на канал', config.channelInviteLink)]);
  }
  buttons.push([Markup.button.callback('✅ Я підписався', 'verify_subscription')]);
  return Markup.inlineKeyboard(buttons);
}

function shareLink(link, shareText) {
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(shareText)}`;
  return Markup.inlineKeyboard([Markup.button.url('📤 Поділитися посиланням', shareUrl)]);
}

function withdrawalActions(id) {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Виплачено', `wd_approve_${id}`),
    Markup.button.callback('❌ Відхилити', `wd_reject_${id}`),
  ]);
}

function adminMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Статистика', 'admin_stats')],
    [Markup.button.callback('📋 Заявки на виведення', 'admin_requests')],
    [Markup.button.callback('📢 Розсилка', 'admin_broadcast')],
  ]);
}

module.exports = {
  mainMenu,
  cancelOnly,
  subscribe,
  shareLink,
  withdrawalActions,
  adminMenu,
};
