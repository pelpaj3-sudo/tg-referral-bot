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

  welcomeSubscribe(config, referrerUser) {
    const intro = referrerUser
      ? `👋 Привіт! Тебе запросив ${displayName(referrerUser)}.\n\n`
      : `👋 Привіт!\n\n`;
    return (
      intro +
      `Це бот, де ти заробляєш за запрошення друзів.\n\n` +
      `За кожного друга, який приєднається за твоїм посиланням і підпишеться на канал, тобі нараховується ${money(config.referralBonus)}.\n\n` +
      `Щоб почати користуватися ботом, підпишись на наш канал 👇 і натисни «Я підписався».`
    );
  },

  notSubscribedYet() {
    return '❌ Здається, ти ще не підписався(-лась) на канал. Підпишись і натисни кнопку ще раз 👇';
  },

  verifiedWelcome() {
    return '✅ Дякуємо за підписку! Тепер тобі доступні всі функції бота — обери розділ у меню нижче.';
  },

  welcomeBack() {
    return '👋 Радий бачити знову! Обери розділ у меню нижче.';
  },

  referralCreditedNotification(newUser, referrer, config) {
    return (
      `🎉 Твій реферал ${displayName(newUser)} підписався на канал!\n` +
      `+${money(config.referralBonus)} на баланс.\n\n` +
      `👥 Всього запрошено: ${referrer.referralsCount}\n` +
      `💰 Поточний баланс: ${money(referrer.balance)}`
    );
  },

  balance(user, config) {
    return (
      `💰 Твій баланс: ${money(user.balance)}\n\n` +
      `📈 Всього зароблено: ${money(user.totalEarned)}\n` +
      `📤 Всього виведено: ${money(user.totalWithdrawn)}\n` +
      `👥 Запрошено друзів: ${user.referralsCount}\n\n` +
      `Мінімальна сума для виведення — ${money(config.minWithdrawal)}.`
    );
  },

  referralLink(link, config) {
    return (
      `🔗 Ось твоє реферальне посилання:\n\n${link}\n\n` +
      `Надішли його друзям — за кожного, хто підпишеться на канал, отримаєш ${money(config.referralBonus)} 💸`
    );
  },

  shareText(config) {
    return `Приєднуйся, тут можна заробляти по ${money(config.referralBonus)} за друга 💸`;
  },

  myReferrals(referrals, link) {
    if (!referrals.length) {
      return (
        `👥 Поки що ти нікого не запросив(-ла). Час це виправити 😉\n\n` +
        `Твоє посилання:\n${link}`
      );
    }
    const totalEarned = referrals
      .filter((r) => r.referralCredited)
      .length;
    const lines = referrals
      .slice()
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map((r) => {
        const status = r.referralCredited ? '✅' : '⏳';
        return `${status} ${displayName(r)}`;
      });
    return (
      `👥 Твої реферали (${referrals.length}):\n\n${lines.join('\n')}\n\n` +
      `✅ — підписався і зарахований, ⏳ — ще не підписався\n` +
      `Зараховано: ${totalEarned} з ${referrals.length}`
    );
  },

  notEnoughBalance(user, config) {
    const left = Math.max(0, config.minWithdrawal - user.balance);
    return (
      `😔 Для виведення потрібно мінімум ${money(config.minWithdrawal)}, а в тебе ${money(user.balance)}.\n\n` +
      `Накопич ще ${money(left)}, щоб можна було вивести кошти. Запроси друзів за своїм посиланням!`
    );
  },

  askRequisites(user) {
    return (
      `💸 Буде виведено весь твій баланс: ${money(user.balance)}.\n\n` +
      `Введи реквізити для отримання коштів (номер картки або гаманець) одним повідомленням.`
    );
  },

  withdrawRequested(amount) {
    return (
      `✅ Заявку на виведення ${money(amount)} створено.\n\n` +
      `Очікуй, адміністратор обробить її найближчим часом.`
    );
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

  howItWorks(config) {
    return (
      `ℹ️ Як це працює:\n\n` +
      `1️⃣ Отримай своє реферальне посилання\n` +
      `2️⃣ Надішли його друзям\n` +
      `3️⃣ Коли друг перейде за посиланням і підпишеться на канал — тобі нарахують ${money(config.referralBonus)}\n` +
      `4️⃣ Накопич ${money(config.minWithdrawal)} і виведи всі кошти одним запитом\n\n` +
      `Питання? Пиши: ${config.supportContact}`
    );
  },

  unknownCommand() {
    return 'Не розпізнав команду 🙂 Скористайся кнопками меню нижче.';
  },

  cancelled() {
    return 'Скасовано.';
  },

  accessDenied() {
    return '⛔ У тебе немає доступу до цього розділу.';
  },

  adminMenuIntro() {
    return '🛠 Адмін-панель\n\nОбери розділ:';
  },

  adminStats(stats) {
    const topLines = stats.top.length
      ? stats.top
          .map((u, i) => `${i + 1}. ${displayName(u)} — ${u.referralsCount} (${money(u.totalEarned)})`)
          .join('\n')
      : 'Поки немає рефералів';
    return (
      `📊 Статистика бота\n\n` +
      `👥 Всього користувачів: ${stats.totalUsers}\n` +
      `✅ Верифіковано: ${stats.verifiedUsers}\n` +
      `🤝 Зараховано рефералів: ${stats.totalReferrals}\n` +
      `💰 Нараховано бонусів: ${money(stats.totalEarned)}\n` +
      `💸 Виплачено: ${money(stats.totalPaid)}\n` +
      `⏳ Заявок в очікуванні: ${stats.pendingCount} на суму ${money(stats.pendingSum)}\n\n` +
      `🏆 Топ реферери:\n${topLines}`
    );
  },

  noRequests() {
    return '🎉 Активних заявок на виведення немає.';
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

  askBroadcastText() {
    return '📢 Введи текст розсилки одним повідомленням. Його буде надіслано всім користувачам бота.';
  },

  broadcastStarted(count) {
    return `⏳ Починаю розсилку для ${count} користувачів...`;
  },

  broadcastDone(success, fail) {
    return `✅ Розсилку завершено.\nНадіслано: ${success}\nПомилок: ${fail}`;
  },
};
