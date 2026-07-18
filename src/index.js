const { bot, setupMenuButton } = require('./bot');
const { startServer } = require('./server');

startServer();

// bot.launch() resolves only when polling stops, so it must not be awaited
// here — otherwise nothing after it (like the menu button setup) would ever run.
bot.launch().catch((err) => {
  console.error('Бот зупинився з помилкою:', err);
});
console.log('Бот запущено.');

setupMenuButton();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
