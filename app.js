(() => {
  'use strict';

  const BASE_GUESSES = 6;
  const EXTRA_GUESSES = 6;
  const LENGTHS = [5, 6, 7];
  const STORE_KEY = 'guesswork.v1';
  const KB_ROWS = ['qwertyuiop', 'asdfghjkl', '>zxcvbnm<'];

  // ---------- coins ----------
  const START_COINS = 50;
  const PRICE = { hint: 20, extra: 50 };
  const HINT_LETTERS = 2;
  // Coins for solving in 1, 2, 3, 4, 5, 6 guesses, and in the extra tries (7 to 12).
  const REWARD = [60, 50, 40, 30, 20, 10];
  const REWARD_EXTRA = 5;
  const rewardFor = (n) => (n <= BASE_GUESSES ? REWARD[n - 1] : REWARD_EXTRA);
  const DIST_BUCKETS = BASE_GUESSES + 1; // 1..6, then "7+"

  // ---------- storage ----------
  const blankStats = () => ({ played: 0, wins: 0, cur: 0, max: 0, dist: Array(DIST_BUCKETS).fill(0) });
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    s = s && typeof s === 'object' ? s : {};
    s.len = LENGTHS.includes(s.len) ? s.len : 5;
    s.stats = s.stats || {};
    s.queue = s.queue || {};
    s.games = s.games || {};
    if (typeof s.coins !== 'number') s.coins = START_COINS;
    for (const L of LENGTHS) {
      const st = Object.assign(blankStats(), s.stats[L] || {});
      while (st.dist.length < DIST_BUCKETS) st.dist.push(0);
      s.stats[L] = st;
    }
    return s;
  }
  const state = load();
  function save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  // ---------- data ----------
  const cache = {};
  async function loadData(L) {
    if (cache[L]) return cache[L];
    const [a, g] = await Promise.all([
      fetch(`data/answers-${L}.json`).then(r => r.json()),
      fetch(`data/guesses-${L}.txt`).then(r => r.text()),
    ]);
    const valid = new Set(g.split('\n'));
    a.answers.forEach(w => valid.add(w));
    cache[L] = { answers: a.answers, meanings: a.meanings, valid };
    return cache[L];
  }

  function nextAnswer(L, answers) {
    // A shuffled queue per length, so words don't repeat until all are used.
    let q = state.queue[L];
    if (!Array.isArray(q) || !q.length) {
      q = answers.map((_, i) => i);
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [q[i], q[j]] = [q[j], q[i]];
      }
    }
    const idx = q.pop();
    state.queue[L] = q;
    return answers[idx];
  }

  // ---------- scoring ----------
  function score(guess, answer) {
    const res = Array(guess.length).fill('absent');
    const left = {};
    for (let i = 0; i < answer.length; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < guess.length; i++) {
      if (res[i] !== 'correct' && left[guess[i]]) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  }

  // ---------- dom helpers ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  }
  let toastTimer;
  function toast(msg, ms = 1400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }
  function renderCoins(bump) {
    $('#coin-count').textContent = state.coins;
    if (bump) {
      const c = $('#coins');
      c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
    }
  }

  // ---------- game ----------
  // game: {len, answer, guesses:[], max, hinted:[], done, won, reward}
  let game = null;
  let data = null;
  let current = '';
  let busy = false;

  const lenSelect = $('#len-select');
  lenSelect.addEventListener('change', () => {
    state.len = +lenSelect.value;
    save();
    lenSelect.blur();
    startGame(state.len);
  });

  async function startGame(L, forceNew = false) {
    try {
      data = await loadData(L);
    } catch (e) {
      toast('Could not load words. Open once with internet.', 2500);
      return;
    }
    let g = state.games[L];
    if (forceNew || !g || g.done || !data.meanings[g.answer]) {
      g = { len: L, answer: nextAnswer(L, data.answers), guesses: [], max: BASE_GUESSES, hinted: [], done: false, won: false };
      state.games[L] = g;
      save();
    }
    g.max = g.max || BASE_GUESSES;
    g.hinted = g.hinted || [];
    game = g;
    current = '';
    busy = false;
    lenSelect.value = String(L);
    buildBoard();
    buildKeyboard();
    paintAll();
    show('screen-game');
    sizeBoard();
    // Reopened after running out of the first 6 tries without deciding.
    if (!game.done && game.guesses.length >= game.max) offerExtra();
  }

  function buildBoard() {
    const b = $('#board');
    b.innerHTML = '';
    for (let r = 0; r < game.max; r++) {
      const row = el('div', 'row');
      row.style.gridTemplateColumns = `repeat(${game.len}, auto)`;
      for (let c = 0; c < game.len; c++) row.appendChild(el('div', 't'));
      b.appendChild(row);
    }
  }

  function sizeBoard() {
    if (!game) return;
    const wrap = $('#board-wrap');
    const w = wrap.clientWidth - 24, h = wrap.clientHeight - 20;
    const gap = game.max > BASE_GUESSES ? 4 : 6;
    const byW = (w - gap * (game.len - 1)) / game.len;
    const byH = (h - gap * (game.max - 1)) / game.max;
    const size = Math.max(22, Math.min(62, Math.floor(Math.min(byW, byH))));
    const b = $('#board');
    b.style.setProperty('--tile', size + 'px');
    b.style.gap = gap + 'px';
    [...b.children].forEach(r => { r.style.gap = gap + 'px'; });
  }
  window.addEventListener('resize', () => { if ($('#screen-game').classList.contains('active')) sizeBoard(); });

  function buildKeyboard() {
    const kb = $('#keyboard');
    kb.innerHTML = '';
    KB_ROWS.forEach((row, i) => {
      const r = el('div', 'kb-row');
      if (i === 1) r.appendChild(el('div', 'key spacer'));
      for (const ch of row) {
        let k;
        if (ch === '>') { k = el('button', 'key wide', 'Enter'); k.dataset.key = 'Enter'; }
        else if (ch === '<') {
          k = el('button', 'key wide');
          k.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 5H9l-6 7 6 7h12z"/><path d="M17 9l-5 6M12 9l5 6"/></svg>';
          k.setAttribute('aria-label', 'Delete');
          k.dataset.key = 'Backspace';
        } else { k = el('button', 'key', ch); k.dataset.key = ch; }
        k.type = 'button';
        r.appendChild(k);
      }
      if (i === 1) r.appendChild(el('div', 'key spacer'));
      kb.appendChild(r);
    });
  }
  $('#keyboard').addEventListener('click', (e) => {
    const k = e.target.closest('[data-key]');
    if (k) handleKey(k.dataset.key);
  });
  document.addEventListener('keydown', (e) => {
    if (!$('#screen-game').classList.contains('active') || document.querySelector('dialog[open]')) return;
    if (e.target === lenSelect) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === 'Backspace' || /^[a-z]$/i.test(e.key)) {
      e.preventDefault();
      handleKey(e.key.length === 1 ? e.key.toLowerCase() : e.key);
    }
  });

  function rowEl(i) { return $('#board').children[i]; }

  function paintAll() {
    game.guesses.forEach((gw, i) => {
      const res = score(gw, game.answer);
      [...rowEl(i).children].forEach((t, j) => { t.textContent = gw[j]; t.className = 't ' + res[j]; });
    });
    paintCurrent();
    paintKeys();
    renderCoins();
    renderPowerups();
  }

  function paintCurrent() {
    const i = game.guesses.length;
    if (i >= game.max) return;
    [...rowEl(i).children].forEach((t, j) => {
      const ch = current[j] || '';
      if (t.textContent !== ch) {
        t.textContent = ch;
        t.className = 't' + (ch ? ' filled' : '');
      }
    });
  }

  function keyStates() {
    const rank = { absent: 1, present: 2, correct: 3 };
    const best = {};
    game.guesses.forEach(gw => {
      score(gw, game.answer).forEach((r, j) => {
        const ch = gw[j];
        if (!best[ch] || rank[r] > rank[best[ch]]) best[ch] = r;
      });
    });
    return best;
  }

  function paintKeys() {
    const best = keyStates();
    const hinted = new Set(game.hinted);
    document.querySelectorAll('#keyboard .key[data-key]').forEach(k => {
      const ch = k.dataset.key;
      k.classList.remove('correct', 'present', 'absent', 'hinted');
      if (best[ch]) k.classList.add(best[ch]);
      else if (hinted.has(ch)) k.classList.add('hinted');
    });
  }

  function handleKey(key) {
    if (!game || game.done || busy) return;
    if (game.guesses.length >= game.max) return offerExtra();
    if (key === 'Enter') return submit();
    if (key === 'Backspace') { current = current.slice(0, -1); return paintCurrent(); }
    if (/^[a-z]$/.test(key) && current.length < game.len) { current += key; paintCurrent(); }
  }

  function shake(msg) {
    const r = rowEl(game.guesses.length);
    r.classList.remove('shake'); void r.offsetWidth; r.classList.add('shake');
    toast(msg);
  }

  function submit() {
    if (current.length < game.len) return shake('Not enough letters');
    if (!data.valid.has(current)) return shake('Not in word list');
    const guess = current;
    const rowIdx = game.guesses.length;
    game.guesses.push(guess);
    current = '';
    const won = guess === game.answer;
    const outOfTries = !won && game.guesses.length >= game.max;
    const canExtend = outOfTries && game.max === BASE_GUESSES;
    if (won) finish(true);
    else if (outOfTries && !canExtend) finish(false);
    save();

    // reveal animation
    busy = true;
    const res = score(guess, game.answer);
    const tiles = [...rowEl(rowIdx).children];
    const step = 260;
    tiles.forEach((t, j) => {
      setTimeout(() => {
        t.classList.add('flip');
        setTimeout(() => { t.className = 't flip ' + res[j]; }, 250);
      }, j * step);
    });
    const total = (tiles.length - 1) * step + 520;
    setTimeout(() => {
      tiles.forEach(t => t.classList.remove('flip'));
      paintKeys();
      renderPowerups();
      busy = false;
      if (won) {
        rowEl(rowIdx).classList.add('win');
        toast(['Genius!', 'Brilliant!', 'Superb!', 'Great!', 'Nice!', 'Phew!'][rowIdx] || 'Just made it!');
        renderCoins(true);
        setTimeout(() => showResult(), 1300);
      } else if (canExtend) {
        setTimeout(offerExtra, 300);
      } else if (outOfTries) {
        toast(game.answer.toUpperCase(), 1800);
        setTimeout(() => showResult(), 1800);
      }
    }, total);
  }

  function finish(won) {
    game.done = true;
    game.won = won;
    const s = state.stats[game.len];
    s.played++;
    if (won) {
      const n = game.guesses.length;
      s.wins++; s.cur++; s.max = Math.max(s.max, s.cur);
      s.dist[Math.min(n, DIST_BUCKETS) - 1]++;
      game.reward = rewardFor(n);
      state.coins += game.reward;
    } else {
      s.cur = 0;
      game.reward = 0;
    }
  }

  // ---------- power-ups ----------
  function hintCandidates() {
    if (!game || game.done) return [];
    const best = keyStates();
    const hinted = new Set(game.hinted);
    return 'abcdefghijklmnopqrstuvwxyz'.split('')
      .filter(ch => !game.answer.includes(ch) && !best[ch] && !hinted.has(ch));
  }
  const canExtra = () => game && !game.done && game.max === BASE_GUESSES;

  function renderPowerups() {
    document.querySelectorAll('[data-price]').forEach(e => { e.textContent = PRICE[e.dataset.price]; });
    const hb = $('#btn-hint'), eb = $('#btn-extra');
    hb.disabled = busy || !hintCandidates().length || state.coins < PRICE.hint;
    eb.disabled = busy || !canExtra() || state.coins < PRICE.extra;
    if (hb.disabled) resetConfirm(hb);
    if (eb.disabled) resetConfirm(eb);
  }

  // Two taps to spend coins, so an accidental tap costs nothing.
  const confirmTimers = new WeakMap();
  function resetConfirm(btn) {
    btn.classList.remove('confirm');
    btn.querySelector('.label').textContent = btn.dataset.label || btn.querySelector('.label').textContent;
    clearTimeout(confirmTimers.get(btn));
  }
  function askConfirm(btn, onYes) {
    if (btn.classList.contains('confirm')) { resetConfirm(btn); onYes(); return; }
    document.querySelectorAll('.power.confirm').forEach(resetConfirm);
    const label = btn.querySelector('.label');
    btn.dataset.label = btn.dataset.label || label.textContent;
    label.textContent = 'Tap to buy';
    btn.classList.add('confirm');
    confirmTimers.set(btn, setTimeout(() => resetConfirm(btn), 3000));
  }

  function buyHint() {
    const pool = hintCandidates();
    if (!pool.length || state.coins < PRICE.hint) return;
    const picks = [];
    while (picks.length < HINT_LETTERS && pool.length) {
      picks.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
    }
    state.coins -= PRICE.hint;
    game.hinted.push(...picks);
    save();
    paintKeys();
    renderCoins(true);
    renderPowerups();
    toast(`${picks.map(c => c.toUpperCase()).join(' and ')} ${picks.length > 1 ? 'are' : 'is'} not in the word`, 2000);
  }

  function buyExtra() {
    if (!canExtra() || state.coins < PRICE.extra) return false;
    state.coins -= PRICE.extra;
    game.max = BASE_GUESSES + EXTRA_GUESSES;
    save();
    buildBoard();
    paintAll();
    sizeBoard();
    renderCoins(true);
    toast('6 more tries added', 1600);
    return true;
  }

  $('#btn-hint').addEventListener('click', (e) => askConfirm(e.currentTarget, buyHint));
  $('#btn-extra').addEventListener('click', (e) => askConfirm(e.currentTarget, buyExtra));

  function offerExtra() {
    const d = $('#dlg-out');
    const btn = $('#btn-out-buy');
    const afford = state.coins >= PRICE.extra;
    btn.innerHTML = '';
    btn.append(`6 more tries for ${PRICE.extra}`, el('span', 'coin'));
    btn.disabled = !afford;
    $('#out-text').textContent = afford
      ? `You have ${state.coins} coins. Buy 6 more tries to keep going, or see the answer.`
      : `You need ${PRICE.extra} coins for 6 more tries, and you have ${state.coins}. Solve more words to earn coins.`;
    if (!d.open) d.showModal();
  }
  $('#btn-out-buy').addEventListener('click', () => { if (buyExtra()) $('#dlg-out').close(); });
  $('#btn-out-give').addEventListener('click', () => {
    $('#dlg-out').close();
    finish(false);
    save();
    renderPowerups();
    toast(game.answer.toUpperCase(), 1500);
    setTimeout(showResult, 1500);
  });

  // ---------- result / meaning ----------
  function showResult() {
    const g = game;
    $('#result-heading').textContent = g.won ? 'Got it!' : 'Out of guesses';
    const w = $('#result-word');
    w.innerHTML = '';
    for (const ch of g.answer) w.appendChild(el('span', 't ' + (g.won ? 'correct' : 'absent'), ch));
    $('#result-sub').textContent = g.won
      ? `Solved in ${g.guesses.length} ${g.guesses.length === 1 ? 'guess' : 'guesses'}.`
      : `The word was ${g.answer.toUpperCase()}.`;
    const rc = $('#result-coins');
    rc.innerHTML = '';
    if (g.won && g.reward) {
      rc.append(el('span', 'coin'), `+${g.reward} coins`);
      rc.hidden = false;
    } else rc.hidden = true;

    const m = $('#result-meaning');
    m.innerHTML = '';
    const defs = data.meanings[g.answer] || [];
    if (!defs.length) m.appendChild(el('div', 'none', 'No meaning found for this word.'));
    defs.forEach(group => {
      m.appendChild(el('div', 'pos', group.p));
      const ol = el('ol');
      group.senses.forEach(s => {
        const li = el('li', null, cap(s.d) + '.');
        if (s.e) li.appendChild(el('span', 'ex', `“${s.e}”`));
        ol.appendChild(li);
      });
      m.appendChild(ol);
    });

    const s = state.stats[g.len];
    const strip = $('#result-streak');
    strip.innerHTML = '';
    [[s.cur, 'Current streak'], [s.max, 'Best streak'], [state.coins, 'Coins']].forEach(([v, label]) => {
      const d = el('div'); d.appendChild(el('b', null, String(v))); d.appendChild(el('span', null, label)); strip.appendChild(d);
    });
    show('screen-result');
    $('.result-body').scrollTop = 0;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (s) => s.played ? Math.round((s.wins / s.played) * 100) : 0;

  $('#btn-next').addEventListener('click', () => startGame(state.len, true));
  $('#btn-result-stats').addEventListener('click', () => openStats(game ? game.len : state.len));
  $('#btn-help').addEventListener('click', () => $('#dlg-help').showModal());
  $('#btn-stats').addEventListener('click', () => openStats(game ? game.len : state.len));

  // ---------- stats ----------
  let statsLen = 5;
  function openStats(L) {
    statsLen = L;
    renderStats();
    const d = $('#dlg-stats');
    if (!d.open) d.showModal();
  }
  function renderStats() {
    const s = state.stats[statsLen];
    document.querySelectorAll('[data-stats-len]').forEach(b => b.setAttribute('aria-selected', String(+b.dataset.statsLen === statsLen)));
    $('#st-played').textContent = s.played;
    $('#st-win').textContent = pct(s);
    $('#st-cur').textContent = s.cur;
    $('#st-max').textContent = s.max;
    const dist = $('#st-dist');
    dist.innerHTML = '';
    const top = Math.max(1, ...s.dist);
    const lastWin = game && game.done && game.won && game.len === statsLen
      ? Math.min(game.guesses.length, DIST_BUCKETS) - 1 : -1;
    s.dist.forEach((n, i) => {
      const row = el('div', 'dist-row');
      row.appendChild(el('span', null, i === DIST_BUCKETS - 1 ? '7+' : String(i + 1)));
      const bar = el('div', 'dist-bar' + (i === lastWin ? ' hl' : ''), String(n));
      bar.style.width = `${Math.max(8, (n / top) * 100)}%`;
      row.appendChild(bar);
      dist.appendChild(row);
    });
  }
  document.querySelectorAll('[data-stats-len]').forEach(b => b.addEventListener('click', () => { statsLen = +b.dataset.statsLen; renderStats(); }));

  // dialogs: close button + tap outside (the out-of-guesses dialog needs a choice)
  document.querySelectorAll('dialog').forEach(d => {
    if (d.id === 'dlg-out') { d.addEventListener('cancel', (e) => e.preventDefault()); return; }
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return d.close();
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });

  // ---------- help: reward table + install hint ----------
  const rt = $('#reward-table');
  for (let n = 1; n <= DIST_BUCKETS; n++) {
    const d = el('div');
    d.appendChild(el('b', null, String(n <= BASE_GUESSES ? rewardFor(n) : REWARD_EXTRA)));
    d.appendChild(el('span', null, n <= BASE_GUESSES ? String(n) : '7+'));
    rt.appendChild(d);
  }
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone) {
    const ua = navigator.userAgent;
    const hint = $('#install-hint');
    if (/iPhone|iPad|iPod/.test(ua)) {
      hint.textContent = 'To play offline, tap the Share button, then “Add to Home Screen”.';
      hint.hidden = false;
    } else if (/Android/.test(ua)) {
      hint.textContent = 'To play offline, open the ⋮ menu and tap “Add to Home screen” or “Install app”.';
      hint.hidden = false;
    }
  }

  // ---------- offline ----------
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }

  // Open straight into the last word length. Show the rules on the very first visit.
  startGame(state.len);
  if (!state.seenHelp) {
    state.seenHelp = true;
    save();
    $('#dlg-help').showModal();
  }
})();
