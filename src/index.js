const { bot, setupMenuButton } = require('./bot');
const { startServer } = require('./server');
const config = require('./config');

startServer();

// Render's free tier spins the whole process down after ~15 min without an
// inbound HTTP request, which would also kill the bot's long-polling loop.
// Self-pinging the public URL keeps it counted as active traffic.
if (config.miniAppUrl) {
  setInterval(() => {
    fetch(config.miniAppUrl).catch(() => {});
  }, 10 * 60 * 1000);
}

// bot.launch() resolves only when polling stops, so it must not be awaited
// here — otherwise nothing after it (like the menu button setup) would ever run.
bot.launch().catch((err) => {
  console.error('Бот зупинився з помилкою:', err);
});
console.log('Бот запущено.');

setupMenuButton();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
