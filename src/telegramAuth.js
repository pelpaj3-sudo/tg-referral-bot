const crypto = require('crypto');
const config = require('./config');

const MAX_AUTH_AGE_SECONDS = 86400; // 24h, per Telegram's own recommendation

// Verifies the HMAC signature Telegram attaches to WebApp initData so we can
// trust req.tgUser without a login step. See:
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
function validateInitData(initData) {
  if (!initData) return null;

  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');

  const pairs = [];
  for (const [key, value] of params.entries()) pairs.push(`${key}=${value}`);
  pairs.sort();
  const dataCheckString = pairs.join('\n');

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(config.botToken).digest();
  const computedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (computedHash !== hash) return null;

  const authDate = Number(params.get('auth_date') || 0);
  if (!authDate || Date.now() / 1000 - authDate > MAX_AUTH_AGE_SECONDS) return null;

  const userJson = params.get('user');
  if (!userJson) return null;

  let user;
  try {
    user = JSON.parse(userJson);
  } catch (err) {
    return null;
  }

  return { user, startParam: params.get('start_param') || null };
}

function telegramAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const initData = header.startsWith('tma ') ? header.slice(4) : '';
  const result = validateInitData(initData);
  if (!result) return res.status(401).json({ error: 'unauthorized' });
  req.tgUser = result.user;
  req.startParam = result.startParam;
  return next();
}

module.exports = { validateInitData, telegramAuthMiddleware };
