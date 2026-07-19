function money(n) {
  return `${Number(n).toFixed(2).replace(/\.00$/, '')} грн`;
}

function displayName(user) {
  if (!user) return 'користувач';
  if (user.username) return `@${user.username}`;
  return user.firstName || `id${user.id}`;
}

module.exports = {
  money,

  startGreeting() {
    return '👋 Привіт! Тисни кнопку нижче, щоб відкрити свій кабінет — там баланс, реферальне посилання, список рефералів і вивід коштів.';
  },

  referralCreditedNotification(newUser, referrer, config) {
    return (
      `🎉 Твій реферал ${displayName(newUser)} підписався на канал!\n` +
      `+${money(config.referralBonus)} на баланс.\n\n` +
      `👥 Всього запрошено: ${referrer.referralsCount}\n` +
      `💰 Поточний баланс: ${money(referrer.balance)}`
    );
  },

  adminNewWithdrawal(w, user) {
    return (
      `💸 Заявка на виведення #${w.id}\n\n` +
      `👤 Користувач: ${displayName(user)} (id ${user.id})\n` +
      `💰 Сума: ${money(w.amount)}\n` +
      `💳 Реквізити: ${w.requisites}`
    );
  },

  adminWithdrawalResolved(w, status) {
    const label = status === 'approved' ? '✅ Виплачено' : '❌ Відхилено';
    return `Заявка #${w.id} на ${money(w.amount)}: ${label}`;
  },

  withdrawalApproved(w, config) {
    return `✅ Виплату на ${money(w.amount)} здійснено! Дякуємо, що ти з нами 💙\nПитання: ${config.supportContact}`;
  },

  withdrawalRejected(w, config) {
    return (
      `❌ Заявку на виведення ${money(w.amount)} відхилено. Кошти повернено на баланс.\n` +
      `Якщо є питання — звернись до підтримки: ${config.supportContact}`
    );
  },
};
