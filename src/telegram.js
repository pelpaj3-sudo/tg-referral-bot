const { Telegraf } = require('telegraf');
const config = require('./config');

if (!config.botToken) {
  console.error('Помилка: BOT_TOKEN не задано. Скопіюйте .env.example у .env і вкажіть токен від @BotFather.');
  process.exit(1);
}

const bot = new Telegraf(config.botToken);

module.exports = { bot };
