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

function selCard(m, sel) {
  const rowHTML = (id, score, won) => {
    const t = team(id);
    return `<div class="ar-sel-row ${won ? 'is-won' : ''}">
      ${t?.logo ? `<img src="${esc(t.logo)}" class="ar-sel-logo" alt="">`
                : `<span class="ar-sel-logo ar-sel-logo--ph">${t ? esc(t.name[0]) : '·'}</span>`}
      <span class="ar-sel-name">${t ? esc(t.name) : 'Por definir'}</span>
      <span class="ar-sel-score">${esc(score)}</span>
    </div>`;
  };
  const canPlay = playable(m);
  const attr = canPlay ? `data-sel='${JSON.stringify(sel)}'` : '';
  return `<div class="ar-sel-card ${canPlay ? 'is-playable' : ''} ${m.winner ? 'is-done' : ''}" ${attr}>
    ${rowHTML(m.a, m.scoreA, m.winner === 'a')}
    ${rowHTML(m.b, m.scoreB, m.winner === 'b')}
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

  const roundsHTML = b.rounds.map((round, r) => `
    <div class="ar-sel-round">
      <div class="ar-sel-round-title">${roundLabel({ kind: 'round', r, i: 0 })}</div>
      ${round.map((m, i) => selCard(m, { kind: 'round', r, i })).join('')}
    </div>`).join('');

  const thirdHTML = (b.third && (b.third.a != null || b.third.b != null)) ? `
    <div class="ar-sel-round ar-sel-round--third">
      <div class="ar-sel-round-title">3er lugar</div>
      ${selCard(b.third, { kind: 'third' })}
    </div>` : '';

  el.innerHTML = `
    ${resumable ? `<div class="ar-resume">
        Hay un combate en curso sin terminar.
        <button class="ar-btn ar-btn--gold" id="ar-resume-btn">Reanudar combate</button>
        <button class="ar-btn ar-btn--ghost" id="ar-resume-discard">Descartar</button>
      </div>` : ''}
    <div class="ar-sel-layout">
      <div class="ar-sel-main">
        <h1 class="ar-title">${esc(b.title)}</h1>
        <p class="ar-sub">Elige el próximo combate — los partidos listos brillan en dorado</p>
        <div class="ar-sel-rounds">${roundsHTML}${thirdHTML}</div>
        <div class="ar-timer-cfg">
          <span>Duración del combate</span>
          <button class="ar-btn ar-btn--ghost" id="ar-dur-minus">−30s</button>
          <strong id="ar-dur">${fmtClock(S.duration)}</strong>
          <button class="ar-btn ar-btn--ghost" id="ar-dur-plus">+30s</button>
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

// ─── Fase ②: presentación VS ─────────────────────────
function startIntro() {
  const m = matchOf(S.sel);
  const A = team(m.a), B = team(m.b);
  setPhase('intro');
  const side = (t, dir) => `
    <div class="ar-vs-side ar-vs-side--${dir}">
      ${t.logo ? `<img src="${esc(t.logo)}" class="ar-vs-logo" alt="">`
               : `<span class="ar-vs-logo ar-vs-logo--ph">${esc(t.name[0])}</span>`}
      <h2 class="ar-vs-name">${esc(t.name)}</h2>
      ${t.anthem ? `<button class="ar-btn ar-btn--ghost ar-anthem-btn" data-url="${esc(t.anthem)}">
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
        <button class="ar-btn ar-btn--ghost" id="ar-vs-stop"><i data-lucide="square"></i> Detener música</button>
        <button class="ar-btn ar-btn--gold ar-btn--big" id="ar-vs-go">¡A LA ARENA!</button>
      </div>
    </div>`;
  $('#ph-intro').querySelectorAll('.ar-anthem-btn').forEach(b =>
    b.addEventListener('click', () => playAnthem(b.dataset.url)));
  $('#ar-vs-stop').addEventListener('click', stopAnthem);
  $('#ar-vs-back').addEventListener('click', () => { stopAnthem(); setPhase('select'); });
  $('#ar-vs-go').addEventListener('click', () => { stopAnthem(); startFight(); });
  lucide.createIcons({ nodes: [$('#ph-intro')] });
}

function startFight() { console.log('fight pendiente'); }   // Task 8 lo reemplaza

// Placeholders que la Task 8 reemplaza:
function resumeFight(backup) { console.log('resume pendiente', backup); }

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
