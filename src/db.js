const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

function defaultData() {
  return { users: {}, withdrawals: [], nextWithdrawalId: 1 };
}

function ensureFile() {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify(defaultData(), null, 2));
  }
}

ensureFile();
let data = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

function persist() {
  const tmp = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, DB_PATH);
}

function getUser(id) {
  return data.users[String(id)];
}

function ensureUser(id, tgUser, referrerId) {
  const key = String(id);
  if (!data.users[key]) {
    data.users[key] = {
      id: key,
      username: tgUser.username || null,
      firstName: tgUser.first_name || '',
      createdAt: new Date().toISOString(),
      verified: false,
      referrerId: referrerId ? String(referrerId) : null,
      referralCredited: false,
      balance: 0,
      totalEarned: 0,
      totalWithdrawn: 0,
      referralsCount: 0,
    };
    persist();
  }
  return data.users[key];
}

function setVerified(id) {
  data.users[String(id)].verified = true;
  persist();
}

function setReferrer(id, referrerId) {
  data.users[String(id)].referrerId = String(referrerId);
  persist();
}

function creditReferral(referrerId, bonus) {
  const ref = data.users[String(referrerId)];
  if (!ref) return;
  ref.balance += bonus;
  ref.totalEarned += bonus;
  ref.referralsCount += 1;
  persist();
}

function markReferralCredited(id) {
  data.users[String(id)].referralCredited = true;
  persist();
}

function updateBalance(id, delta) {
  data.users[String(id)].balance += delta;
  persist();
}

function addWithdrawn(id, amount) {
  data.users[String(id)].totalWithdrawn += amount;
  persist();
}

function allUsers() {
  return Object.values(data.users);
}

function createWithdrawal(userId, amount, requisites) {
  const id = data.nextWithdrawalId++;
  const w = {
    id,
    userId: String(userId),
    amount,
    requisites,
    status: 'pending',
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };
  data.withdrawals.push(w);
  persist();
  return w;
}

function getWithdrawal(id) {
  return data.withdrawals.find((w) => w.id === Number(id));
}

function resolveWithdrawal(id, status) {
  const w = getWithdrawal(id);
  if (w) {
    w.status = status;
    w.resolvedAt = new Date().toISOString();
    persist();
  }
  return w;
}

function pendingWithdrawals() {
  return data.withdrawals.filter((w) => w.status === 'pending');
}

function allWithdrawals() {
  return data.withdrawals;
}

module.exports = {
  getUser,
  ensureUser,
  setVerified,
  setReferrer,
  creditReferral,
  markReferralCredited,
  updateBalance,
  addWithdrawn,
  allUsers,
  createWithdrawal,
  getWithdrawal,
  resolveWithdrawal,
  pendingWithdrawals,
  allWithdrawals,
};
