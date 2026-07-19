const { Markup } = require('telegraf');

function withdrawalActions(id) {
  return Markup.inlineKeyboard([
    Markup.button.callback('✅ Виплачено', `wd_approve_${id}`),
    Markup.button.callback('❌ Відхилити', `wd_reject_${id}`),
  ]);
}

module.exports = {
  withdrawalActions,
};
