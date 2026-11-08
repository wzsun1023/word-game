(() => {
  'use strict';

  const MAX_GUESSES = 6;
  const LENGTHS = [5, 6, 7];
  const STORE_KEY = 'guesswork.v1';
  const KB_ROWS = ['qwertyuiop', 'asdfghjkl', '>zxcvbnm<'];

  // ---------- storage ----------
  const blankStats = () => ({ played: 0, wins: 0, cur: 0, max: 0, dist: Array(MAX_GUESSES).fill(0) });
  function load() {
    let s = null;
    try { s = JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { /* ignore */ }
    s = s && typeof s === 'object' ? s : {};
    s.len = LENGTHS.includes(s.len) ? s.len : 5;
    s.stats = s.stats || {};
    s.queue = s.queue || {};
    s.games = s.games || {};
    for (const L of LENGTHS) {
      s.stats[L] = Object.assign(blankStats(), s.stats[L] || {});
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

  // ---------- home ----------
  function renderHome() {
    document.querySelectorAll('.len').forEach(b => {
      b.setAttribute('aria-checked', String(+b.dataset.len === state.len));
    });
    const g = state.games[state.len];
    const note = $('#resume-note');
    if (g && !g.done && g.guesses.length) {
      note.hidden = false;
      note.textContent = `You have a ${state.len}-letter game in progress.`;
      $('#btn-play').textContent = 'Continue';
    } else {
      note.hidden = true;
      $('#btn-play').textContent = 'Play';
    }
    show('screen-home');
  }
  document.querySelectorAll('.len').forEach(b => b.addEventListener('click', () => {
    state.len = +b.dataset.len; save(); renderHome();
  }));
  $('#btn-play').addEventListener('click', () => startGame(state.len));
  $('#btn-home-stats').addEventListener('click', () => openStats(state.len));
  $('#btn-home-help').addEventListener('click', () => $('#dlg-help').showModal());

  // ---------- game ----------
  let game = null;   // {len, answer, guesses:[], done, won}
  let data = null;
  let current = '';
  let busy = false;

  async function startGame(L, forceNew = false) {
    try {
      data = await loadData(L);
    } catch (e) {
      toast('Could not load words. Open once with internet.', 2500);
      return;
    }
    let g = state.games[L];
    if (forceNew || !g || g.done || !data.meanings[g.answer]) {
      g = { len: L, answer: nextAnswer(L, data.answers), guesses: [], done: false, won: false };
      state.games[L] = g;
      save();
    }
    game = g;
    current = '';
    busy = false;
    $('#game-len').textContent = L;
    buildBoard();
    buildKeyboard();
    paintAll();
    show('screen-game');
    sizeBoard();
  }

  function buildBoard() {
    const b = $('#board');
    b.innerHTML = '';
    for (let r = 0; r < MAX_GUESSES; r++) {
      const row = el('div', 'row');
      row.style.gridTemplateColumns = `repeat(${game.len}, auto)`;
      for (let c = 0; c < game.len; c++) row.appendChild(el('div', 't'));
      b.appendChild(row);
    }
  }

  function sizeBoard() {
    const wrap = $('#board-wrap');
    const w = wrap.clientWidth - 24, h = wrap.clientHeight - 20;
    const gap = 6;
    const byW = (w - gap * (game.len - 1)) / game.len;
    const byH = (h - gap * (MAX_GUESSES - 1)) / MAX_GUESSES;
    const size = Math.max(28, Math.min(62, Math.floor(Math.min(byW, byH))));
    $('#board').style.setProperty('--tile', size + 'px');
  }
  window.addEventListener('resize', () => { if (game && $('#screen-game').classList.contains('active')) sizeBoard(); });

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
  }

  function paintCurrent() {
    const i = game.guesses.length;
    if (i >= MAX_GUESSES) return;
    [...rowEl(i).children].forEach((t, j) => {
      const ch = current[j] || '';
      if (t.textContent !== ch) {
        t.textContent = ch;
        t.className = 't' + (ch ? ' filled' : '');
      }
    });
  }

  function paintKeys() {
    const rank = { absent: 1, present: 2, correct: 3 };
    const best = {};
    game.guesses.forEach(gw => {
      score(gw, game.answer).forEach((r, j) => {
        const ch = gw[j];
        if (!best[ch] || rank[r] > rank[best[ch]]) best[ch] = r;
      });
    });
    document.querySelectorAll('#keyboard .key[data-key]').forEach(k => {
      const ch = k.dataset.key;
      k.classList.remove('correct', 'present', 'absent');
      if (best[ch]) k.classList.add(best[ch]);
    });
  }

  function handleKey(key) {
    if (!game || game.done || busy) return;
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
    const lost = !won && game.guesses.length >= MAX_GUESSES;
    if (won || lost) finish(won);
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
      busy = false;
      if (won) {
        rowEl(rowIdx).classList.add('win');
        toast(['Genius!', 'Brilliant!', 'Superb!', 'Great!', 'Nice!', 'Phew!'][rowIdx] || 'Nice!');
        setTimeout(() => showResult(), 1300);
      } else if (lost) {
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
      s.wins++; s.cur++; s.max = Math.max(s.max, s.cur);
      s.dist[game.guesses.length - 1]++;
    } else {
      s.cur = 0;
    }
  }

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
    [[s.cur, 'Current streak'], [s.max, 'Best streak'], [pct(s), 'Win %']].forEach(([v, label]) => {
      const d = el('div'); d.appendChild(el('b', null, String(v))); d.appendChild(el('span', null, label)); strip.appendChild(d);
    });
    show('screen-result');
    $('.result-body').scrollTop = 0;
  }
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const pct = (s) => s.played ? Math.round((s.wins / s.played) * 100) : 0;

  $('#btn-next').addEventListener('click', () => startGame(state.len, true));
  $('#btn-result-home').addEventListener('click', renderHome);
  $('#btn-result-stats').addEventListener('click', () => openStats(game ? game.len : state.len));
  $('#btn-back').addEventListener('click', renderHome);
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
    const lastWin = game && game.done && game.won && game.len === statsLen ? game.guesses.length - 1 : -1;
    s.dist.forEach((n, i) => {
      const row = el('div', 'dist-row');
      row.appendChild(el('span', null, String(i + 1)));
      const bar = el('div', 'dist-bar' + (i === lastWin ? ' hl' : ''), String(n));
      bar.style.width = `${Math.max(8, (n / top) * 100)}%`;
      row.appendChild(bar);
      dist.appendChild(row);
    });
  }
  document.querySelectorAll('[data-stats-len]').forEach(b => b.addEventListener('click', () => { statsLen = +b.dataset.statsLen; renderStats(); }));

  // dialogs: close button + tap outside
  document.querySelectorAll('dialog').forEach(d => {
    d.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) return d.close();
      const r = d.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) d.close();
    });
  });

  // ---------- install hint ----------
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

  renderHome();
})();
