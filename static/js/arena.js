/* EIRI Arena — pantalla de competencia en vivo */
'use strict';

// ─── Estado global ───────────────────────────────────
const S = {
  phase: 'select',      // select | intro | fight | victory
  bracket: null,        // payload de /api/bracket
  teams: {},            // id -> team
  sel: null,            // { kind: 'round'|'third', r, i }
  duration: 180,        // segundos configurados para el combate
  hearts: { a: 3, b: 3 },
  remain: 0,            // segundos restantes (en muerte súbita: transcurridos)
  running: false,
  sudden: false,
  winner: null,         // 'a' | 'b'
  muted: false,
};

const $ = (q) => document.querySelector(q);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

const team = (id) => (id != null ? S.teams[id] : null);
const matchOf = (sel) => sel.kind === 'third' ? S.bracket.third : S.bracket.rounds[sel.r]?.[sel.i];
const isFinal = (sel) => sel.kind === 'round' && sel.r === S.bracket.rounds.length - 1;

function roundLabel(sel) {
  if (sel.kind === 'third') return '3ER LUGAR';
  const left = S.bracket.rounds.length - sel.r;
  return left === 1 ? 'GRAN FINAL' : left === 2 ? 'SEMIFINAL'
       : left === 3 ? 'CUARTOS DE FINAL' : left === 4 ? 'OCTAVOS DE FINAL' : 'RONDA';
}

// ─── Audio: efectos built-in (Web Audio) + tema por equipo ───
const FX = {
  ctx: null,
  ensure() {
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  },
  tone(freq, dur = 0.15, type = 'square', gain = 0.12, when = 0) {
    if (S.muted) return;
    try {
      const ctx = this.ensure();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(gain, ctx.currentTime + when);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + dur);
      o.connect(g); g.connect(ctx.destination);
      o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.05);
    } catch {}
  },
  beep()    { this.tone(880, 0.12); },
  go()      { this.tone(440, 0.55, 'sawtooth', 0.22); this.tone(880, 0.55, 'square', 0.1); },
  hit()     { this.tone(120, 0.35, 'sawtooth', 0.3); this.tone(75, 0.5, 'triangle', 0.25, 0.04); },
  heal()    { this.tone(520, 0.12, 'triangle', 0.18); this.tone(784, 0.18, 'triangle', 0.16, 0.09); },
  tick()    { this.tone(1250, 0.05, 'square', 0.06); },
  alarm()   { for (let k = 0; k < 6; k++) this.tone(k % 2 ? 920 : 660, 0.16, 'square', 0.2, k * 0.18); },
  fanfare() { [523, 659, 784, 1047, 1319].forEach((f, k) => this.tone(f, 0.42, 'triangle', 0.2, k * 0.16)); },
};

const anthem = new Audio();
let fadeTimer = null;
function playAnthem(url, { fade = false } = {}) {
  stopAnthem();
  if (!url || S.muted) return;
  anthem.src = url;
  anthem.volume = fade ? 0.02 : 1;
  anthem.play().catch(() => {});   // MP3 roto o autoplay bloqueado: silencio, sin error
  if (fade) {
    fadeTimer = setInterval(() => {
      anthem.volume = Math.min(1, anthem.volume + 0.05);
      if (anthem.volume >= 1) clearInterval(fadeTimer);
    }, 120);
  }
}
function stopAnthem() { clearInterval(fadeTimer); anthem.pause(); anthem.currentTime = 0; }

// ─── Respaldo del combate en curso (a prueba de recargas) ───
const BK_KEY = 'arena-fight-backup';
function saveBackup() {
  if (S.phase !== 'fight') return;
  localStorage.setItem(BK_KEY, JSON.stringify({
    sel: S.sel, duration: S.duration, hearts: S.hearts,
    remain: S.remain, sudden: S.sudden, ts: Date.now(),
  }));
}
function loadBackup() {
  try { return JSON.parse(localStorage.getItem(BK_KEY)); } catch { return null; }
}
function clearBackup() { localStorage.removeItem(BK_KEY); }

// ─── Fases ───────────────────────────────────────────
function setPhase(p) {
  S.phase = p;
  ['select', 'intro', 'fight', 'victory'].forEach(x => { $(`#ph-${x}`).hidden = x !== p; });
  document.body.classList.toggle('is-sudden', p === 'fight' && S.sudden);
  document.body.classList.toggle('is-final', S.sel ? isFinal(S.sel) : false);
  if (p === 'select') renderSelect();
}

async function loadBracket() {
  const data = await fetch('/api/bracket').then(r => r.json());
  S.bracket = data;
  S.teams = {};
  (data.teams || []).forEach(t => { S.teams[t.id] = t; });
}

// ─── Fase ①: selección de partido ────────────────────
const playable = (m) => m && m.a != null && m.b != null && !m.winner;

// Tarjeta de partido: logo grande arriba y nombre debajo por equipo,
// con el marcador (o "VS") al centro — legible proyectado y de lejos.
function selCard(m, sel) {
  const cell = (id, won, lost) => {
    const t = team(id);
    const logo = t?.logo ? `<img src="${esc(t.logo)}" class="ar-sc-logo" alt="">`
      : `<span class="ar-sc-logo ar-sc-logo--ph">${t ? esc(t.name[0]) : '·'}</span>`;
    return `<div class="ar-sc-team ${won ? 'is-won' : ''} ${lost ? 'is-lost' : ''}">
      ${logo}<span class="ar-sc-name">${t ? esc(t.name) : 'Por definir'}</span>
    </div>`;
  };
  const decided = m.winner === 'a' || m.winner === 'b';
  const center = decided
    ? `<span class="ar-sc-score">${esc(m.scoreA)}<i>–</i>${esc(m.scoreB)}</span>`
    : `<span class="ar-sc-vs">vs</span>`;
  const canPlay = playable(m);
  const attr = canPlay ? `data-sel='${JSON.stringify(sel)}'` : '';
  return `<div class="ar-sel-card ${canPlay ? 'is-playable' : ''} ${decided ? 'is-done' : ''}" ${attr}>
    ${cell(m.a, m.winner === 'a', decided && m.winner !== 'a')}
    ${center}
    ${cell(m.b, m.winner === 'b', decided && m.winner !== 'b')}
  </div>`;
}

function resultsSidebar() {
  const done = [];
  S.bracket.rounds.forEach((round, r) => round.forEach((m, i) => {
    if (m.winner) done.push({ m, label: roundLabel({ kind: 'round', r, i }) });
  }));
  if (S.bracket.third?.winner) done.push({ m: S.bracket.third, label: '3ER LUGAR' });
  if (!done.length) return '<p class="ar-side-empty">Aún no hay combates jugados.</p>';
  return done.map(({ m, label }) => {
    const w = team(m.winner === 'a' ? m.a : m.b), l = team(m.winner === 'a' ? m.b : m.a);
    const sw = m.winner === 'a' ? m.scoreA : m.scoreB, sl = m.winner === 'a' ? m.scoreB : m.scoreA;
    return `<div class="ar-side-item"><span class="ar-side-label">${label}</span>
      <strong>${esc(w?.name || '?')}</strong> eliminó a ${esc(l?.name || '?')} ${esc(sw)}–${esc(sl)}</div>`;
  }).reverse().join('');
}

function renderSelect() {
  const b = S.bracket;
  const el = $('#ph-select');
  const backup = loadBackup();
  const resumable = backup && playable(matchOf(backup.sel) || {});

  // Bracket espejado como el de la home: ambos lados convergen a la final al centro.
  const n = b.rounds.length;
  const sideRounds = n - 1;
  const buildSide = (side) => {
    const order = side === 'left' ? [...Array(sideRounds).keys()] : [...Array(sideRounds).keys()].reverse();
    let h = `<div class="ar-bk-side" style="flex:${sideRounds}">`;
    order.forEach(r => {
      const matches = b.rounds[r];
      const half = matches.length / 2;
      const slice = side === 'left' ? matches.slice(0, half) : matches.slice(half);
      const baseIdx = side === 'left' ? 0 : half;
      h += `<div class="ar-bk-round">
        <div class="ar-sel-round-title">${roundLabel({ kind: 'round', r, i: 0 })}</div>
        <div class="ar-bk-matches">${slice.map((m, j) => selCard(m, { kind: 'round', r, i: baseIdx + j })).join('')}</div>
      </div>`;
    });
    return h + '</div>';
  };

  const thirdHTML = (b.third && (b.third.a != null || b.third.b != null)) ? `
    <div class="ar-bk-third">
      <div class="ar-sel-round-title ar-sel-round-title--third">3er lugar</div>
      ${selCard(b.third, { kind: 'third' })}
    </div>` : '';

  const centerHTML = `<div class="ar-bk-round ar-bk-center" style="flex:1">
    <div class="ar-sel-round-title ar-sel-round-title--final">${roundLabel({ kind: 'round', r: n - 1, i: 0 })}</div>
    <div class="ar-bk-matches">${selCard(b.rounds[n - 1][0], { kind: 'round', r: n - 1, i: 0 })}</div>
    ${thirdHTML}
  </div>`;

  const bracketHTML = `<div class="ar-bk-scroll"><div class="ar-bk">${buildSide('left')}${centerHTML}${buildSide('right')}</div></div>`;

  el.innerHTML = `
    ${resumable ? `<div class="ar-resume">
        Hay un combate en curso sin terminar.
        <button class="ar-btn ar-btn--gold" id="ar-resume-btn">Reanudar combate</button>
        <button class="ar-btn ar-btn--ghost" id="ar-resume-discard">Descartar</button>
      </div>` : ''}
    <div class="ar-sel-layout">
      <div class="ar-sel-main">
        <h1 class="ar-title">${esc(b.title)}</h1>
        <p class="ar-sub">Elige el próximo combate. Los partidos listos brillan en dorado</p>
        ${bracketHTML}
        <div class="ar-timer-cfg">
          <i data-lucide="timer"></i>
          <span>Duración del combate</span>
          <button class="ar-icon-btn" id="ar-dur-minus" title="−30s"><i data-lucide="minus"></i></button>
          <strong id="ar-dur">${fmtClock(S.duration)}</strong>
          <button class="ar-icon-btn" id="ar-dur-plus" title="+30s"><i data-lucide="plus"></i></button>
        </div>
      </div>
      <aside class="ar-side">
        <h2 class="ar-side-title">Resultados de la jornada</h2>
        ${resultsSidebar()}
      </aside>
    </div>`;

  el.querySelectorAll('.ar-sel-card.is-playable').forEach(card => {
    card.addEventListener('click', () => {
      S.sel = JSON.parse(card.dataset.sel);
      startIntro();
    });
  });
  $('#ar-dur-minus')?.addEventListener('click', () => { S.duration = Math.max(30, S.duration - 30); $('#ar-dur').textContent = fmtClock(S.duration); });
  $('#ar-dur-plus')?.addEventListener('click', () => { S.duration = Math.min(1200, S.duration + 30); $('#ar-dur').textContent = fmtClock(S.duration); });
  $('#ar-resume-btn')?.addEventListener('click', () => resumeFight(backup));
  $('#ar-resume-discard')?.addEventListener('click', () => { clearBackup(); renderSelect(); });
  lucide.createIcons({ nodes: [el] });
}

function fmtClock(s) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// ─── Modal propio (reemplaza confirm/alert del navegador) ───
let modalOpen = false;
function arModal(msg, { cancel = true, okText = 'Confirmar', cancelText = 'Volver' } = {}) {
  return new Promise((resolve) => {
    modalOpen = true;
    const wrap = document.createElement('div');
    wrap.className = 'ar-modal';
    wrap.innerHTML = `<div class="ar-modal-box">
      <p>${esc(msg)}</p>
      <div class="ar-modal-actions">
        ${cancel ? `<button class="ar-btn ar-btn--ghost" data-r="0">${esc(cancelText)}</button>` : ''}
        <button class="ar-btn ar-btn--gold" data-r="1">${esc(okText)}</button>
      </div>
    </div>`;
    const close = (val) => {
      document.removeEventListener('keydown', onKey, true);
      wrap.remove();
      modalOpen = false;
      resolve(val);
    };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(false); } };
    document.addEventListener('keydown', onKey, true);
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (b) return close(b.dataset.r === '1');
      if (e.target === wrap) close(false);   // click fuera = cancelar
    });
    document.body.appendChild(wrap);
  });
}

// ─── Fase ②: presentación VS ─────────────────────────
function startIntro() {
  const m = matchOf(S.sel);
  const A = team(m.a), B = team(m.b);
  if (!A || !B) { arModal('Falta un equipo de este partido (¿fue eliminado?). Revisa el bracket en el panel admin.', { cancel: false, okText: 'Entendido' }); return; }
  setPhase('intro');
  const side = (t, dir) => `
    <div class="ar-vs-side ar-vs-side--${dir}">
      ${t.logo ? `<img src="${esc(t.logo)}" class="ar-vs-logo" alt="">`
               : `<span class="ar-vs-logo ar-vs-logo--ph">${esc(t.name[0])}</span>`}
      <h2 class="ar-vs-name">${esc(t.name)}</h2>
      ${t.anthem ? `<button class="ar-btn ar-btn--ghost ar-anthem-btn" data-url="${esc(t.anthem)}" data-side="${dir}">
        <i data-lucide="music"></i> Tema</button>` : ''}
    </div>`;
  $('#ph-intro').innerHTML = `
    <div class="ar-vs">
      <div class="ar-vs-round">${roundLabel(S.sel)}</div>
      <div class="ar-vs-stage">
        ${side(A, 'left')}
        <div class="ar-vs-mark">VS</div>
        ${side(B, 'right')}
      </div>
      <div class="ar-vs-actions">
        <button class="ar-btn ar-btn--ghost" id="ar-vs-back"><i data-lucide="arrow-left"></i> Volver</button>
        <button class="ar-btn ar-btn--ghost" id="ar-vs-pres"><i data-lucide="sparkles"></i> Presentación automática</button>
        <button class="ar-btn ar-btn--ghost" id="ar-vs-stop"><i data-lucide="volume-x"></i> Detener música</button>
        <button class="ar-btn ar-btn--gold ar-btn--big" id="ar-vs-go">¡A LA ARENA!</button>
      </div>
    </div>`;
  // Spotlight de entrada: al sonar el tema de un equipo se realza su lado
  // (nombre y logo) y el rival se atenúa; al parar o terminar el tema, vuelve.
  const clearSpot = () => {
    $('#ph-intro .ar-vs-stage')?.classList.remove('is-spot-left', 'is-spot-right');
    $('#ph-intro')?.querySelectorAll('.ar-anthem-btn').forEach(b => {
      b.classList.remove('is-playing');
      b.innerHTML = '<i data-lucide="music"></i> Tema';
    });
    if ($('#ph-intro')) lucide.createIcons({ nodes: [$('#ph-intro')] });
  };
  const spotlight = (dir, t) => {
    clearSpot();
    $('#ph-intro .ar-vs-stage')?.classList.add(dir === 'left' ? 'is-spot-left' : 'is-spot-right');
    if (t.anthem) {
      playAnthem(t.anthem);
      const btn = $(`#ph-intro .ar-anthem-btn[data-side="${dir}"]`);
      if (btn) {
        btn.classList.add('is-playing');
        btn.innerHTML = '<i data-lucide="volume-2"></i> Sonando…';
        lucide.createIcons({ nodes: [btn] });
      }
    }
  };

  // Presentación automática estilo WWE: spotlight + tema del equipo 1,
  // luego el equipo 2, y se apaga. Cancelable con el mismo botón o cualquier acción.
  const PRES_MS = 12000;   // segundos de protagonismo por equipo
  let presToken = 0;
  const presWait = (ms) => new Promise(r => setTimeout(r, ms));
  const cancelPres = () => {
    presToken++;
    const b = $('#ar-vs-pres');
    if (b) {
      b.classList.remove('is-on');
      b.innerHTML = '<i data-lucide="sparkles"></i> Presentación automática';
      lucide.createIcons({ nodes: [b] });
    }
  };
  $('#ar-vs-pres').addEventListener('click', async () => {
    const btn = $('#ar-vs-pres');
    if (btn.classList.contains('is-on')) { cancelPres(); stopAnthem(); clearSpot(); return; }
    const my = ++presToken;
    anthem.onended = null;
    btn.classList.add('is-on');
    btn.innerHTML = '<i data-lucide="square"></i> Detener presentación';
    lucide.createIcons({ nodes: [btn] });
    spotlight('left', A);
    await presWait(PRES_MS);
    if (presToken !== my) return;
    spotlight('right', B);
    await presWait(PRES_MS);
    if (presToken !== my) return;
    stopAnthem();
    clearSpot();
    cancelPres();
  });

  $('#ph-intro').querySelectorAll('.ar-anthem-btn').forEach(b =>
    b.addEventListener('click', () => {
      cancelPres();   // un click manual corta la secuencia automática
      // Segundo click sobre el tema que ya suena: lo detiene (toggle)
      if (b.classList.contains('is-playing')) { stopAnthem(); clearSpot(); return; }
      spotlight(b.dataset.side, b.dataset.side === 'left' ? A : B);
      anthem.onended = clearSpot;   // al terminar la canción, el escenario vuelve solo
    }));
  const leaveIntro = () => { cancelPres(); stopAnthem(); anthem.onended = null; };
  $('#ar-vs-stop').addEventListener('click', () => { cancelPres(); stopAnthem(); clearSpot(); });
  $('#ar-vs-back').addEventListener('click', () => { leaveIntro(); setPhase('select'); });
  $('#ar-vs-go').addEventListener('click', () => { leaveIntro(); startFight(); });
  lucide.createIcons({ nodes: [$('#ph-intro')] });
}

// ─── Fase ③: combate ─────────────────────────────────
let tickHandle = null, endAt = 0;
let countdownTimer = null;   // id del setTimeout activo del countdown, cancelable
let inCountdown = false;     // true mientras corre 3-2-1-¡PELEA!: bloquea teclado y corazones

function startFight() {
  cancelCountdown();   // defensa ante combates sucesivos: no debe quedar un countdown previo vivo
  S.hearts = { a: 3, b: 3 };
  S.remain = S.duration;
  S.sudden = false;
  S.winner = null;
  renderFight();
  runCountdown(() => { FX.go(); resumeTimer(); saveBackup(); });
}

function resumeFight(backup) {
  S.sel = backup.sel;
  // guard: si el partido ya no tiene ambos equipos (borrados tras el backup), descarta y vuelve a selección
  const m = matchOf(S.sel);
  if (!m || !team(m.a) || !team(m.b)) { clearBackup(); setPhase('select'); return; }
  S.duration = backup.duration;
  S.hearts = backup.hearts;
  S.remain = backup.remain;
  S.sudden = backup.sudden;
  S.winner = null;
  renderFight();
  setPaused(true);   // se reanuda con Espacio o el botón
}

function renderFight() {
  const m = matchOf(S.sel);
  const A = team(m.a), B = team(m.b);
  setPhase('fight');
  const side = (t, key) => `
    <div class="ar-f-side" id="ar-f-${key}">
      ${t.logo ? `<img src="${esc(t.logo)}" class="ar-f-logo" alt="">`
               : `<span class="ar-f-logo ar-f-logo--ph">${esc(t.name[0])}</span>`}
      <h2 class="ar-f-name">${esc(t.name)}</h2>
      <div class="ar-f-hearts" data-side="${key}">${heartsHTML(key)}</div>
      <div class="ar-f-keys">${key === 'a' ? 'Q quita · A devuelve' : 'P quita · L devuelve'}</div>
    </div>`;
  $('#ph-fight').innerHTML = `
    <div class="ar-f">
      <div class="ar-led ar-f-brand">Battlebots · EIRI UDD</div>
      <div class="ar-f-round">${roundLabel(S.sel)}</div>
      <div class="ar-f-stage">
        ${side(A, 'a')}
        <div class="ar-f-center">
          <div class="ar-f-clock" id="ar-clock">${fmtClock(S.remain)}</div>
          <div class="ar-f-sudden-label" id="ar-sudden-label" hidden>MUERTE SÚBITA</div>
          <button class="ar-btn ar-btn--ghost ar-btn--ctl" id="ar-pause"></button>
          <button class="ar-btn ar-btn--ghost ar-btn--ctl" id="ar-abort"><i data-lucide="x"></i> Cancelar combate</button>
        </div>
        ${side(B, 'b')}
      </div>
      <div class="ar-f-countdown" id="ar-countdown" hidden></div>
    </div>`;
  setPauseBtn(!S.running);
  $('#ph-fight').querySelectorAll('.ar-f-hearts').forEach(el => {
    el.addEventListener('click', (e) => {
      const h = e.target.closest('.ar-heart');
      if (!h) return;
      const side = el.dataset.side;
      if (h.classList.contains('is-lost')) giveHeart(side); else loseHeart(side);
    });
  });
  if (isFinal(S.sel)) spawnSparks();
  $('#ar-pause').addEventListener('click', () => setPaused(S.running));
  $('#ar-abort').addEventListener('click', async () => {
    // Pausa mientras se pregunta; si el operador se arrepiente, reanuda como estaba.
    const wasRunning = S.running;
    if (wasRunning) setPaused(true);
    const ok = await arModal('¿Cancelar este combate? No se guardará nada.', { okText: 'Sí, cancelar', cancelText: 'Seguir peleando' });
    if (!ok) { if (wasRunning && !S.winner && !inCountdown) setPaused(false); return; }
    cancelCountdown(); pauseTimer(); clearBackup(); stopAnthem(); setPhase('select');
  });
  refreshSuddenUI();
  lucide.createIcons({ nodes: [$('#ph-fight')] });
}

// Botón de pausa con ícono y atajo visible; se redibuja al pausar/reanudar.
function setPauseBtn(paused) {
  const btn = $('#ar-pause');
  if (!btn) return;
  btn.innerHTML = `<i data-lucide="${paused ? 'play' : 'pause'}"></i> ${paused ? 'Reanudar' : 'Pausa'} <kbd>espacio</kbd>`;
  lucide.createIcons({ nodes: [btn] });
}

// Corazón pixel-art en grilla 9×8: L = brillo, X = base, D = sombra
const HEART_GRID = [
  '.LL...XX.',
  'LLXX.XXXX',
  'LXXXXXXXX',
  'XXXXXXXXX',
  '.XXXXXXD.',
  '..XXXXD..',
  '...XXD...',
  '....D....',
];
const HEART_COLORS = {
  full: { L: '#ff9db0', X: '#ff2e55', D: '#b3123a' },
  lost: { L: '#4a5c73', X: '#33435a', D: '#232f41' },
};
function pixelHeart(lost) {
  const pal = HEART_COLORS[lost ? 'lost' : 'full'];
  let rects = '';
  HEART_GRID.forEach((row, y) => [...row].forEach((c, x) => {
    if (c !== '.') rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${pal[c]}"/>`;
  }));
  return `<svg viewBox="0 0 9 8" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
}
function heartsHTML(side) {
  return [0, 1, 2].map(k => {
    const lost = k >= S.hearts[side];
    return `<span class="ar-heart ${lost ? 'is-lost' : ''}">${pixelHeart(lost)}</span>`;
  }).join('');
}
function renderHearts(side, shake = false) {
  const el = $(`#ph-fight .ar-f-hearts[data-side="${side}"]`);
  el.innerHTML = heartsHTML(side);
  if (shake) {
    const box = $(`#ar-f-${side}`);
    box.classList.remove('is-hit'); void box.offsetWidth;   // reinicia la animación
    box.classList.add('is-hit');
  }
}

function runCountdown(done) {
  inCountdown = true;   // bloquea corazones y teclado hasta que termine la secuencia
  const el = $('#ar-countdown');
  el.hidden = false;
  const seq = ['3', '2', '1', '¡PELEA!'];
  let k = 0;
  const step = () => {
    if (k < 3) FX.beep();
    el.textContent = seq[k];
    el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop');
    k++;
    if (k < seq.length) countdownTimer = setTimeout(step, 900);
    else countdownTimer = setTimeout(() => { el.hidden = true; inCountdown = false; done(); }, 700);
  };
  step();
}

// Cancela un countdown en curso (p. ej. al abortar el combate): evita que sus
// timeouts colgados llamen a done() sobre un estado ya descartado o nuevo.
function cancelCountdown() {
  clearTimeout(countdownTimer);
  countdownTimer = null;
  inCountdown = false;
}

// Timer sin deriva: recalcula contra Date.now() en cada tick.
function resumeTimer() {
  S.running = true;
  endAt = S.sudden ? Date.now() - S.remain * 1000 : Date.now() + S.remain * 1000;
  clearInterval(tickHandle);
  tickHandle = setInterval(onTick, 200);
  setPauseBtn(false);
}
function pauseTimer() {
  S.running = false;
  clearInterval(tickHandle);
}
function setPaused(paused) {
  if (paused) { pauseTimer(); setPauseBtn(true); }
  else resumeTimer();
}

function onTick() {
  if (S.sudden) {
    const t = Math.floor((Date.now() - endAt) / 1000);
    if (t !== S.remain) { S.remain = t; updateClock(); saveBackup(); }
    return;
  }
  const left = Math.ceil((endAt - Date.now()) / 1000);
  if (left !== S.remain) {
    S.remain = Math.max(0, left);
    if (S.remain <= 10 && S.remain > 0) FX.tick();
    updateClock();
    saveBackup();
    if (S.remain === 0) onTimeUp();
  }
}
function updateClock() {
  const el = $('#ar-clock');
  el.textContent = fmtClock(S.remain);
  el.classList.toggle('is-low', !S.sudden && S.remain <= 10);
}

function loseHeart(side) {
  if (S.phase !== 'fight' || S.winner || S.hearts[side] === 0 || inCountdown) return;
  S.hearts[side]--;
  FX.hit();
  renderHearts(side, true);
  saveBackup();
  const other = side === 'a' ? 'b' : 'a';
  if (S.hearts[side] === 0 || S.sudden) endFight(other);
}
function giveHeart(side) {
  if (S.phase !== 'fight' || S.winner || S.hearts[side] === 3 || inCountdown) return;
  S.hearts[side]++;
  FX.heal();
  renderHearts(side);
  saveBackup();
}

function onTimeUp() {
  pauseTimer();
  if (S.hearts.a !== S.hearts.b) return endFight(S.hearts.a > S.hearts.b ? 'a' : 'b');
  // Empate → muerte súbita: el próximo corazón decide, el reloj sube desde 0.
  S.sudden = true;
  S.remain = 0;
  FX.alarm();
  refreshSuddenUI();
  resumeTimer();
  saveBackup();
}
function refreshSuddenUI() {
  document.body.classList.toggle('is-sudden', S.sudden);
  const lbl = $('#ar-sudden-label');
  if (lbl) lbl.hidden = !S.sudden;
}

function endFight(winner) {
  pauseTimer();
  S.winner = winner;
  document.body.classList.remove('is-sudden');
  showVictory();
}
// ─── Fase ④: victoria ────────────────────────────────
function showVictory() {
  const m = matchOf(S.sel);
  const W = team(S.winner === 'a' ? m.a : m.b);
  setPhase('victory');
  $('#ph-victory').innerHTML = `
    <div class="ar-v">
      <div class="ar-v-confetti" id="ar-confetti"></div>
      <div class="ar-v-crown"><i data-lucide="crown"></i></div>
      ${W.logo ? `<img src="${esc(W.logo)}" class="ar-v-logo" alt="">`
               : `<span class="ar-v-logo ar-v-logo--ph">${esc(W.name[0])}</span>`}
      <h1 class="ar-v-name">${esc(W.name)}</h1>
      <div class="ar-v-label">${S.sel.kind === 'third' ? '¡TERCER LUGAR!' : isFinal(S.sel) ? '¡CAMPEÓN DEL TORNEO!' : '¡VICTORIA!'}</div>
      <div class="ar-v-score">${S.hearts.a} — ${S.hearts.b}</div>
      <p class="ar-v-err" id="confirmErr"></p>
      <div class="ar-v-actions">
        <button class="ar-btn ar-btn--ghost" id="ar-v-discard">Descartar</button>
        <button class="ar-btn ar-btn--gold ar-btn--big" id="ar-v-confirm">Confirmar resultado</button>
      </div>
      <div class="ar-led ar-v-led">EIRI</div>
    </div>`;
  spawnConfetti();
  if (W.anthem) playAnthem(W.anthem, { fade: true }); else FX.fanfare();
  $('#ar-v-confirm').addEventListener('click', confirmResult);
  $('#ar-v-discard').addEventListener('click', async () => {
    if (!(await arModal('¿Descartar el resultado? No se guardará nada.', { okText: 'Sí, descartar', cancelText: 'Volver' }))) return;
    stopAnthem(); clearBackup(); setPhase('select');
  });
  lucide.createIcons({ nodes: [$('#ph-victory')] });
}

function spawnConfetti() {
  const box = $('#ar-confetti');
  const colors = ['#e3bd3f', '#f4d774', '#42a5f5', '#ef4444', '#4ade80', '#ffffff'];
  for (let k = 0; k < 120; k++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;background:${colors[k % colors.length]};` +
      `animation-delay:${Math.random() * 2.5}s;animation-duration:${2.4 + Math.random() * 2.4}s;` +
      `width:${5 + Math.random() * 7}px;height:${8 + Math.random() * 8}px;`;
    box.appendChild(p);
  }
}

let saving = false;
async function confirmResult() {
  if (saving) return;
  saving = true;
  $('#ar-v-confirm').textContent = 'Guardando...';
  const body = {
    scoreA: String(S.hearts.a),
    scoreB: String(S.hearts.b),
    winner: S.winner,
    ...(S.sel.kind === 'third' ? { third: true } : { round: S.sel.r, index: S.sel.i }),
  };
  try {
    const res = await fetch('/api/admin/bracket/match', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    clearBackup();
    stopAnthem();
    await loadBracket();
    setPhase('select');
  } catch (e) {
    $('#confirmErr').textContent = `No se pudo guardar: ${e.message} — puedes reintentar.`;
    $('#ar-v-confirm').textContent = 'Confirmar resultado';
  } finally {
    saving = false;
  }
}

// Partículas doradas flotando durante la GRAN FINAL
function spawnSparks() {
  const box = document.createElement('div');
  box.className = 'ar-f-sparks';
  for (let k = 0; k < 26; k++) {
    const p = document.createElement('i');
    p.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 100}%;` +
      `animation-delay:${Math.random() * 6}s;animation-duration:${5 + Math.random() * 6}s;`;
    box.appendChild(p);
  }
  $('.ar-f').appendChild(box);
}

// Teclado del combate
document.addEventListener('keydown', (e) => {
  if (modalOpen || S.phase !== 'fight' || S.winner) return;
  if (inCountdown) return;   // durante 3-2-1-¡PELEA! no se admiten corazones ni pausa
  const k = e.key.toLowerCase();
  if (k === 'q') loseHeart('a');
  if (k === 'a') giveHeart('a');
  if (k === 'p') loseHeart('b');
  if (k === 'l') giveHeart('b');
  if (e.code === 'Space') { e.preventDefault(); setPaused(S.running); }
});

// ─── Controles globales ──────────────────────────────
$('#ar-mute').addEventListener('click', () => {
  S.muted = !S.muted;
  if (S.muted) stopAnthem();
  $('#ar-mute').innerHTML = `<i data-lucide="${S.muted ? 'volume-x' : 'volume-2'}"></i>`;
  lucide.createIcons({ nodes: [$('#ar-mute')] });
});
$('#ar-fs').addEventListener('click', toggleFullscreen);
function toggleFullscreen() {
  if (document.fullscreenElement) document.exitFullscreen();
  else document.documentElement.requestFullscreen().catch(() => {});
}
document.addEventListener('keydown', (e) => {
  if (modalOpen || e.ctrlKey || e.metaKey || e.altKey) return;   // no interceptar Ctrl+F, etc.
  if (e.key === 'f' || e.key === 'F') toggleFullscreen();
  if (e.key === 'm' || e.key === 'M') $('#ar-mute').click();
});

// ─── Init ────────────────────────────────────────────
(async function init() {
  try {
    await loadBracket();
    setPhase('select');
  } catch {
    $('#ph-select').innerHTML = `<div class="ar-error">
      No se pudo cargar el bracket. <button class="ar-btn" onclick="location.reload()">Reintentar</button>
    </div>`;
  }
  lucide.createIcons();
})();
