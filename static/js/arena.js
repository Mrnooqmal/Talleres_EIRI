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
  if (!A || !B) { window.alert('Falta un equipo de este partido (¿fue eliminado?). Revisa el bracket en el panel admin.'); return; }
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
      <div class="ar-f-round">${roundLabel(S.sel)}</div>
      <div class="ar-f-stage">
        ${side(A, 'a')}
        <div class="ar-f-center">
          <div class="ar-f-clock" id="ar-clock">${fmtClock(S.remain)}</div>
          <div class="ar-f-sudden-label" id="ar-sudden-label" hidden>MUERTE SÚBITA</div>
          <button class="ar-btn ar-btn--ghost" id="ar-pause">Pausa (Espacio)</button>
          <button class="ar-btn ar-btn--ghost" id="ar-abort">Cancelar combate</button>
        </div>
        ${side(B, 'b')}
      </div>
      <div class="ar-f-countdown" id="ar-countdown" hidden></div>
    </div>`;
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
  $('#ar-abort').addEventListener('click', () => {
    if (!window.confirm('¿Cancelar este combate? No se guardará nada.')) return;
    cancelCountdown(); pauseTimer(); clearBackup(); stopAnthem(); setPhase('select');
  });
  refreshSuddenUI();
}

function heartsHTML(side) {
  return [0, 1, 2].map(k =>
    `<span class="ar-heart ${k >= S.hearts[side] ? 'is-lost' : ''}">${k >= S.hearts[side] ? '🖤' : '❤️'}</span>`
  ).join('');
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
  $('#ar-pause').textContent = 'Pausa (Espacio)';
}
function pauseTimer() {
  S.running = false;
  clearInterval(tickHandle);
}
function setPaused(paused) {
  if (paused) { pauseTimer(); $('#ar-pause').textContent = 'Reanudar (Espacio)'; }
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
    </div>`;
  spawnConfetti();
  if (W.anthem) playAnthem(W.anthem, { fade: true }); else FX.fanfare();
  $('#ar-v-confirm').addEventListener('click', confirmResult);
  $('#ar-v-discard').addEventListener('click', () => {
    if (!window.confirm('¿Descartar el resultado? No se guardará nada.')) return;
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
  if (S.phase !== 'fight' || S.winner) return;
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
