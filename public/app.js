(function () {
  'use strict';

  var tg = window.Telegram && window.Telegram.WebApp;
  if (tg) {
    tg.ready();
    tg.expand();
    try {
      tg.setHeaderColor('#120e1f');
      tg.setBackgroundColor('#120e1f');
    } catch (err) { /* older clients may not support these calls */ }
  }

  var initData = tg ? tg.initData : '';
  var tgUserUnsafe = tg && tg.initDataUnsafe ? tg.initDataUnsafe.user : null;

  var currencyFormatter = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 });

  function formatMoney(n) {
    return currencyFormatter.format(n) + ' грн';
  }

  function formatDate(iso) {
    var d = new Date(iso);
    return d.toLocaleDateString('uk-UA', { day: 'numeric', month: 'short' });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // ---------- API ----------
  async function api(path, options) {
    options = options || {};
    var controller = new AbortController();
    var timeout = setTimeout(function () { controller.abort(); }, 55000);
    var res;
    try {
      res = await fetch(path, Object.assign({}, options, {
        signal: controller.signal,
        headers: Object.assign(
          { 'Content-Type': 'application/json', Authorization: 'tma ' + initData },
          options.headers || {}
        ),
      }));
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Сервер не відповідає, спробуй ще раз');
      throw err;
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) {
      var body = {};
      try { body = await res.json(); } catch (err) { /* ignore */ }
      throw new Error(body.error || ('HTTP ' + res.status));
    }
    return res.json();
  }

  // ---------- toast ----------
  var toastEl = document.getElementById('toast');
  var toastTimer = null;
  function showToast(message, isError) {
    toastEl.textContent = message;
    toastEl.classList.toggle('error', !!isError);
    toastEl.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.hidden = true; }, 2600);
  }

  // ---------- modal (confirm) ----------
  var modalOverlay = document.getElementById('modal-overlay');
  var modalMessage = document.getElementById('modal-message');
  var modalConfirm = document.getElementById('modal-confirm');
  var modalCancel = document.getElementById('modal-cancel');

  function confirmAction(message) {
    return new Promise(function (resolve) {
      modalMessage.textContent = message;
      modalOverlay.hidden = false;
      function cleanup(result) {
        modalOverlay.hidden = true;
        modalConfirm.removeEventListener('click', onConfirm);
        modalCancel.removeEventListener('click', onCancel);
        resolve(result);
      }
      function onConfirm() { cleanup(true); }
      function onCancel() { cleanup(false); }
      modalConfirm.addEventListener('click', onConfirm);
      modalCancel.addEventListener('click', onCancel);
    });
  }

  // ---------- how it works ----------
  var howtoOverlay = document.getElementById('howto-overlay');
  document.getElementById('how-it-works-btn').addEventListener('click', function () {
    howtoOverlay.hidden = false;
  });
  document.getElementById('howto-close').addEventListener('click', function () {
    howtoOverlay.hidden = true;
  });

  // ---------- state ----------
  var me = null;

  // ---------- views ----------
  var viewLoading = document.getElementById('view-loading');
  var viewGate = document.getElementById('view-gate');
  var appShell = document.getElementById('app-shell');

  function showLoading() {
    viewLoading.hidden = false;
    viewGate.hidden = true;
    appShell.hidden = true;
    var hint = document.getElementById('loading-hint');
    hint.hidden = true;
    setTimeout(function () {
      if (!viewLoading.hidden) hint.hidden = false;
    }, 3000);
  }

  function showGate() {
    viewLoading.hidden = true;
    viewGate.hidden = false;
    appShell.hidden = true;
    var channelBtn = document.getElementById('gate-channel-btn');
    if (me && me.channelInviteLink) {
      channelBtn.href = me.channelInviteLink;
    } else {
      channelBtn.hidden = true;
    }
  }

  function showApp() {
    viewLoading.hidden = true;
    viewGate.hidden = true;
    appShell.hidden = false;
    document.getElementById('nav-admin-btn').hidden = !me.isAdmin;
    renderHome();
    renderWithdraw();
  }

  // ---------- tabs ----------
  var tabButtons = Array.prototype.slice.call(document.querySelectorAll('.nav-btn'));
  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () { switchTab(btn.dataset.tab); });
  });

  function switchTab(tab) {
    ['home', 'referrals', 'withdraw', 'admin'].forEach(function (name) {
      document.getElementById('tab-' + name).hidden = name !== tab;
    });
    tabButtons.forEach(function (btn) {
      btn.setAttribute('aria-pressed', String(btn.dataset.tab === tab));
    });
    if (tg && tg.HapticFeedback) tg.HapticFeedback.selectionChanged();
    if (tab === 'referrals') loadReferrals();
    if (tab === 'admin' && me.isAdmin) loadAdmin();
  }

  // ---------- home ----------
  function renderHome() {
    var firstName = tgUserUnsafe && tgUserUnsafe.first_name ? tgUserUnsafe.first_name : '';
    document.getElementById('hello-text').textContent = firstName ? 'Привіт, ' + firstName + '!' : 'Привіт!';

    document.getElementById('home-balance').textContent = formatMoney(me.balance);
    document.getElementById('home-total-earned').textContent = formatMoney(me.totalEarned);
    document.getElementById('home-total-withdrawn').textContent = formatMoney(me.totalWithdrawn);
    document.getElementById('home-ref-count').textContent = String(me.referralsCount);
    document.getElementById('home-bonus-pill').textContent = '+' + me.referralBonus + ' грн / друга';
    document.getElementById('home-link-box').textContent = me.referralLink;

    var pct = Math.min(100, (me.balance / me.minWithdrawal) * 100);
    document.getElementById('home-progress-fill').style.width = pct + '%';
    document.getElementById('home-progress-label').textContent = me.balance >= me.minWithdrawal
      ? '🎉 Можна вивести кошти!'
      : 'До виводу: ' + formatMoney(me.balance) + ' з ' + formatMoney(me.minWithdrawal);
  }

  document.getElementById('copy-link-btn').addEventListener('click', async function () {
    try {
      await navigator.clipboard.writeText(me.referralLink);
    } catch (err) {
      var ta = document.createElement('textarea');
      ta.value = me.referralLink;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    showToast('Посилання скопійовано ✅');
    if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
  });

  document.getElementById('share-link-btn').addEventListener('click', function () {
    var shareText = 'Приєднуйся, тут можна заробляти по ' + me.referralBonus + ' грн за друга 💸';
    var url = 'https://t.me/share/url?url=' + encodeURIComponent(me.referralLink) + '&text=' + encodeURIComponent(shareText);
    if (tg) tg.openTelegramLink(url); else window.open(url, '_blank');
  });

  // ---------- referrals ----------
  async function loadReferrals() {
    var listEl = document.getElementById('referrals-list');
    listEl.innerHTML = '<div class="list-empty">Завантаження...</div>';
    try {
      var data = await api('/api/referrals');
      renderReferrals(data.referrals);
    } catch (err) {
      listEl.innerHTML = '<div class="list-empty">Не вдалося завантажити список</div>';
    }
  }

  function renderReferrals(list) {
    var listEl = document.getElementById('referrals-list');
    if (!list.length) {
      listEl.innerHTML = '<div class="list-empty">Поки що немає рефералів.<br>Поділись своїм посиланням, щоб почати заробляти 💸</div>';
      return;
    }
    listEl.innerHTML = list.map(function (r) {
      var letter = (r.name || '?').replace('@', '').charAt(0).toUpperCase();
      var statusClass = r.credited ? 'credited' : 'pending';
      var statusText = r.credited ? '✅ Зараховано' : '⏳ Очікує';
      return '<div class="ref-row">' +
        '<div class="ref-avatar">' + escapeHtml(letter) + '</div>' +
        '<div class="ref-info">' +
        '<div class="ref-name">' + escapeHtml(r.name) + '</div>' +
        '<div class="ref-date">' + formatDate(r.joinedAt) + '</div>' +
        '</div>' +
        '<div class="ref-status ' + statusClass + '">' + statusText + '</div>' +
        '</div>';
    }).join('');
  }

  // ---------- withdraw ----------
  function renderWithdraw() {
    var locked = document.getElementById('withdraw-locked');
    var form = document.getElementById('withdraw-form');
    var success = document.getElementById('withdraw-success');
    success.hidden = true;

    if (me.balance >= me.minWithdrawal) {
      locked.hidden = true;
      form.hidden = false;
      document.getElementById('withdraw-amount').textContent = formatMoney(me.balance);
    } else {
      form.hidden = true;
      locked.hidden = false;
      var left = Math.max(0, me.minWithdrawal - me.balance);
      document.getElementById('withdraw-locked-title').textContent = 'Потрібно ще ' + formatMoney(left);
      var pct = Math.min(100, (me.balance / me.minWithdrawal) * 100);
      document.getElementById('withdraw-progress-fill').style.width = pct + '%';
    }
  }

  document.getElementById('withdraw-form').addEventListener('submit', async function (e) {
    e.preventDefault();
    var input = document.getElementById('withdraw-requisites');
    var requisites = input.value.trim();
    if (!requisites) return;
    var btn = document.getElementById('withdraw-submit-btn');
    btn.disabled = true;
    btn.textContent = 'Надсилаю...';
    try {
      await api('/api/withdraw', { method: 'POST', body: JSON.stringify({ requisites: requisites }) });
      me = await api('/api/me');
      input.value = '';
      document.getElementById('withdraw-form').hidden = true;
      document.getElementById('withdraw-success').hidden = false;
      renderHome();
      if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
    } catch (err) {
      showToast('Помилка: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Подати заявку';
    }
  });

  // ---------- admin ----------
  async function loadAdmin() {
    try {
      var stats = await api('/api/admin/stats');
      renderAdminStats(stats);
    } catch (err) {
      showToast('Не вдалося завантажити статистику', true);
    }
    try {
      var reqs = await api('/api/admin/requests');
      renderAdminRequests(reqs.requests);
    } catch (err) { /* ignore */ }
  }

  function renderAdminStats(stats) {
    var grid = document.getElementById('admin-stats-grid');
    var boxes = [
      { label: 'Усього користувачів', value: stats.totalUsers },
      { label: 'Верифіковано', value: stats.verifiedUsers },
      { label: 'Рефералів зараховано', value: stats.totalReferrals, cls: 'accent' },
      { label: 'Нараховано бонусів', value: formatMoney(stats.totalEarned) },
      { label: 'Виплачено', value: formatMoney(stats.totalPaid) },
      { label: 'В очікуванні', value: stats.pendingCount + ' (' + formatMoney(stats.pendingSum) + ')', cls: 'warn' },
    ];
    grid.innerHTML = boxes.map(function (b) {
      return '<div class="stat-box ' + (b.cls || '') + '"><div class="stat-box-label">' + escapeHtml(b.label) + '</div><div class="stat-box-value">' + escapeHtml(String(b.value)) + '</div></div>';
    }).join('');

    var topEl = document.getElementById('admin-top-list');
    if (!stats.top.length) {
      topEl.innerHTML = '<div class="list-empty">Поки немає рефералів</div>';
    } else {
      topEl.innerHTML = stats.top.map(function (u, i) {
        return '<div class="top-row">' +
          '<div class="top-rank">' + (i + 1) + '</div>' +
          '<div class="top-info"><div class="top-name">' + escapeHtml(u.name) + '</div><div class="top-sub">' + u.referralsCount + ' реферал(ів)</div></div>' +
          '<div class="top-earned">' + formatMoney(u.totalEarned) + '</div>' +
          '</div>';
      }).join('');
    }
  }

  function renderAdminRequests(list) {
    var el = document.getElementById('admin-requests-list');
    if (!list.length) {
      el.innerHTML = '<div class="list-empty">Активних заявок немає 🎉</div>';
      return;
    }
    el.innerHTML = list.map(function (w) {
      return '<div class="request-card" data-id="' + w.id + '">' +
        '<div class="request-head"><span class="request-user">' + escapeHtml(w.user) + '</span><span class="request-amount">' + formatMoney(w.amount) + '</span></div>' +
        '<div class="request-requisites">💳 ' + escapeHtml(w.requisites) + '</div>' +
        '<div class="request-actions">' +
        '<button class="btn btn-approve" data-action="approve" data-id="' + w.id + '">✅ Виплачено</button>' +
        '<button class="btn btn-reject" data-action="reject" data-id="' + w.id + '">❌ Відхилити</button>' +
        '</div>' +
        '</div>';
    }).join('');
  }

  document.getElementById('admin-requests-list').addEventListener('click', async function (e) {
    var btn = e.target.closest('button[data-action]');
    if (!btn) return;
    var id = btn.dataset.id;
    var action = btn.dataset.action;
    var label = action === 'approve' ? 'Позначити заявку як виплачену?' : 'Відхилити заявку та повернути кошти на баланс?';
    var ok = await confirmAction(label);
    if (!ok) return;
    try {
      await api('/api/admin/withdrawals/' + id + '/' + action, { method: 'POST' });
      showToast(action === 'approve' ? 'Виплачено ✅' : 'Відхилено, кошти повернено');
      loadAdmin();
    } catch (err) {
      showToast('Помилка: ' + err.message, true);
    }
  });

  document.getElementById('broadcast-btn').addEventListener('click', async function () {
    var textarea = document.getElementById('broadcast-text');
    var text = textarea.value.trim();
    if (!text) return;
    var ok = await confirmAction('Надіслати це повідомлення всім користувачам бота?');
    if (!ok) return;
    var btn = document.getElementById('broadcast-btn');
    btn.disabled = true;
    btn.textContent = 'Надсилаю...';
    try {
      var result = await api('/api/admin/broadcast', { method: 'POST', body: JSON.stringify({ text: text }) });
      showToast('Розсилку запущено для ' + result.total + ' користувачів');
      textarea.value = '';
    } catch (err) {
      showToast('Помилка: ' + err.message, true);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Надіслати всім';
    }
  });

  // ---------- gate ----------
  var verifyBtn = document.getElementById('gate-verify-btn');
  verifyBtn.addEventListener('click', async function () {
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Перевіряю...';
    var errorEl = document.getElementById('gate-error');
    errorEl.hidden = true;
    try {
      var result = await api('/api/verify', { method: 'POST' });
      if (result.subscribed) {
        me = result.user;
        showApp();
        if (tg && tg.HapticFeedback) tg.HapticFeedback.notificationOccurred('success');
      } else {
        errorEl.textContent = '❌ Підписку ще не знайдено. Підпишись на канал і спробуй ще раз.';
        errorEl.hidden = false;
      }
    } catch (err) {
      errorEl.textContent = 'Сталася помилка. Спробуй ще раз.';
      errorEl.hidden = false;
    } finally {
      verifyBtn.disabled = false;
      verifyBtn.textContent = '✅ Я підписався';
    }
  });

  // ---------- init ----------
  async function init() {
    if (!initData) {
      document.body.innerHTML = '<div class="view-gate"><div class="gate-card"><div class="gate-badge">⚠️</div><h1>Відкрий через Telegram</h1><p>Цей кабінет працює лише всередині Telegram Mini App.</p></div></div>';
      return;
    }
    showLoading();
    try {
      me = await api('/api/me');
    } catch (err) {
      document.body.innerHTML = '<div class="view-gate"><div class="gate-card"><div class="gate-badge">⚠️</div><h1>Помилка завантаження</h1><p>' + escapeHtml(err.message) + '</p></div></div>';
      return;
    }
    if (me.verified) {
      showApp();
    } else {
      showGate();
    }
  }

  init();
})();
