// EIRI Talleres 2026 - sitio publico

const ASSET_ICONS = {
  code:    'code-2',
  diagram: 'cpu',
  slides:  'file-text',
  video:   'play-circle',
  model3d: 'package',
  link:    'external-link',
};

const ASSET_LABELS = {
  code:    'Código',
  diagram: 'Diagrama',
  slides:  'Presentación',
  video:   'Video',
  model3d: 'Modelo 3D',
  link:    'Enlace',
};

// Carrusel de LEDs del hero
function initCarousel() {
  const carousel = document.getElementById('heroCarousel');
  if (!carousel) return;

  const slides = carousel.querySelectorAll('.carousel-slide');
  const dots   = carousel.querySelectorAll('.cdot');
  let current  = 0;
  let timer;

  function goTo(idx) {
    slides[current].classList.remove('active');
    dots[current].classList.remove('active');
    current = (idx + slides.length) % slides.length;
    slides[current].classList.add('active');
    dots[current].classList.add('active');
  }

  function start() { timer = setInterval(() => goTo(current + 1), 4000); }
  function stop()  { clearInterval(timer); }

  dots.forEach(dot => {
    dot.addEventListener('click', () => { stop(); goTo(+dot.dataset.idx); start(); });
  });

  carousel.addEventListener('mouseenter', stop);
  carousel.addEventListener('mouseleave', start);

  start();
}

// Header de dos niveles: colapsa la franja de logos al hacer scroll
function initNavbar() {
  const header = document.getElementById('siteHeader');
  const burger = document.getElementById('navBurger');
  const mobile = document.getElementById('navMobile');
  if (!header) return;

  window.addEventListener('scroll', () => {
    header.classList.toggle('scrolled', window.scrollY > 40);
  });
  burger?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    burger.classList.toggle('open', open);
  });
  mobile?.querySelectorAll('.nav-m-link').forEach(l => {
    l.addEventListener('click', () => {
      mobile.classList.remove('open');
      burger.classList.remove('open');
    });
  });
}

// Cinta de texto animada
function initMarquee() {
  const track = document.getElementById('marqueeContent');
  if (!track) return;
  const items = [
    'Battlebots 2026', 'EIRI UDD', 'Robótica e Innovación', 'Electrónica',
    'Programación', 'Diseño Mecánico', 'Impresión 3D', 'Arduino',
  ];
  const group = items.map(t => `<span>${t}</span><span class="mdot"></span>`).join('');
  track.innerHTML = group + group;
}

function initHeroAOS() {
  setTimeout(() => {
    document.querySelectorAll('[data-aos]').forEach(el => el.classList.add('visible'));
  }, 120);
}

function initReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
}

function initCounters() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (!e.isIntersecting) return;
      const el     = e.target;
      const target = parseInt(el.dataset.target, 10);
      const suffix = el.dataset.suffix || '';
      let   curr   = 0;
      const step   = target / 42;
      const timer  = setInterval(() => {
        curr = Math.min(curr + step, target);
        el.textContent = Math.round(curr) + (curr >= target ? suffix : '');
        if (curr >= target) clearInterval(timer);
      }, 35);
      obs.unobserve(el);
    });
  }, { threshold: 0.6 });
  document.querySelectorAll('.stat-num').forEach(el => obs.observe(el));
}

function copyCode(btn) {
  const pre  = btn.closest('.asset-code').querySelector('pre');
  const text = pre.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    const orig = btn.innerHTML;
    btn.innerHTML = '<svg data-lucide="check" width="12" height="12"></svg> Copiado';
    lucide.createIcons({ nodes: [btn] });
    setTimeout(() => {
      btn.innerHTML = orig;
      lucide.createIcons({ nodes: [btn] });
      btn.classList.remove('copied');
    }, 2200);
  });
}

function buildAsset(asset) {
  if (asset.is_locked) {
    return `
      <div class="asset-locked">
        <i data-lucide="lock"></i>
        <span>${asset.label}, disponible próximamente</span>
      </div>`;
  }

  if (asset.type === 'code') {
    const lang = asset.language || 'plaintext';
    const safe = escapeHtml(asset.content);
    return `
      <div class="asset-code">
        <div class="asset-code-bar">
          <i data-lucide="code-2"></i>
          <span class="asset-code-name">${asset.label}</span>
          <span class="lang-badge">${lang}</span>
          <button class="copy-btn" onclick="copyCode(this)">
            <i data-lucide="copy"></i> Copiar
          </button>
        </div>
        <pre><code class="language-${lang}">${safe}</code></pre>
      </div>`;
  }

  if (asset.type === 'diagram') {
    const src = String(asset.content).replace(/'/g, "\\'");
    const lbl = String(asset.label).replace(/'/g, "\\'");
    return `
      <div class="asset-diagram">
        <div class="asset-diagram-bar">
          <i data-lucide="cpu"></i>
          <span>${asset.label}</span>
        </div>
        <img src="${asset.content}" alt="${asset.label}" loading="lazy"
          onclick="openLightbox('${src}','${lbl}',false)" title="Ampliar imagen">
      </div>`;
  }

  if (asset.type === 'slides') {
    const isPDF = /\.pdf$/i.test(asset.content) || asset.content.includes('/uploads/')
    if (isPDF) {
      return `
        <div class="asset-pdf">
          <div class="asset-pdf-bar">
            <i data-lucide="file-text"></i>
            <span>${asset.label}</span>
            <a href="${asset.content}" target="_blank" rel="noopener" class="pdf-open-link">
              <i data-lucide="external-link"></i> Abrir
            </a>
          </div>
          <iframe src="${asset.content}" class="pdf-embed" title="${asset.label}" loading="lazy"></iframe>
        </div>`;
    }
  }

  if (asset.type === 'markdown') {
    const md   = asset.content || ''
    const html = typeof DOMPurify !== 'undefined'
      ? DOMPurify.sanitize(marked.parse(md))
      : marked.parse(md)
    return `
      <div class="asset-markdown">
        <div class="asset-markdown-bar">
          <i data-lucide="align-left"></i>
          <span>${asset.label}</span>
        </div>
        <div class="markdown-body">${html}</div>
      </div>`;
  }

  // video, model3d, link, slides por URL
  const icon = ASSET_ICONS[asset.type] || 'external-link';
  return `
    <a href="${asset.content}" target="_blank" rel="noopener" class="asset-link-btn">
      <i data-lucide="${icon}"></i>
      <span>${asset.label}</span>
      <i data-lucide="arrow-up-right" class="asset-link-arrow"></i>
    </a>`;
}

// Agrupa los diagramas/imágenes en una grilla compacta en vez de apilarlos.
function buildDiagramGrid(diagramAssets) {
  if (!diagramAssets.length) return '';
  const cls = diagramAssets.length > 1 ? 'asset-diagram-grid multi' : 'asset-diagram-grid';
  return `<div class="${cls}">${diagramAssets.map(buildAsset).join('')}</div>`;
}

function buildProject(project) {
  const slideAssets   = project.assets.filter(a => a.type === 'slides'  && !a.is_locked);
  const codeAssets    = project.assets.filter(a => a.type === 'code'    && !a.is_locked);
  const diagramAssets = project.assets.filter(a => a.type === 'diagram' && !a.is_locked);
  const otherAssets   = project.assets.filter(a => !['slides', 'code', 'diagram'].includes(a.type) && !a.is_locked);
  const lockedAssets  = project.assets.filter(a => a.is_locked);

  // Si hay un PDF, se renderiza de forma especial
  if (slideAssets.length > 0) {
    const mainSlide = slideAssets[0];
    const otherSlides = slideAssets.slice(1);

    const allOtherAssets = [...otherSlides, ...codeAssets, ...diagramAssets, ...otherAssets];

    const mainContentHTML = buildAsset(mainSlide);
    const secondaryContentHTML = allOtherAssets.length > 0
      ? `<div class="project-card-assets secondary">
          <h4 class="other-assets-title">Otros recursos del proyecto</h4>
          ${otherAssets.map(buildAsset).join('')}
          ${codeAssets.map(buildAsset).join('')}
          ${buildDiagramGrid(diagramAssets)}
          ${otherSlides.map(buildAsset).join('')}
        </div>`
      : '';
    const lockedHTML = lockedAssets.map(buildAsset).join('');

    const tagsHTML = project.tags
      ? project.tags.split(',').map(t => t.trim()).filter(Boolean).map(t =>
          `<span class="project-tag" onclick="filterByTag('${t.replace(/'/g,"\\'")}')">#${t}</span>`).join('')
      : '';

    return `
      <div class="project-card project-card-split">
        <div class="project-card-head">
          <div class="project-card-head-main">
            <div class="project-card-title">${project.title}</div>
            ${project.description ? `<div class="project-card-desc">${project.description}</div>` : ''}
            ${tagsHTML ? `<div class="project-tags">${tagsHTML}</div>` : ''}
          </div>
          <span class="project-card-chevron"><i data-lucide="chevron-down"></i></span>
        </div>
        <div class="project-card-body">
          <div class="project-card-main-asset">
            ${mainContentHTML}
          </div>
          ${secondaryContentHTML}
          <div class="project-card-assets">${lockedHTML}</div>
        </div>
      </div>`;
  }

  // Renderizado normal si no hay PDF
  const linkAssets = [...otherAssets];
  const codeHTML    = codeAssets.map(buildAsset).join('');
  const diagramHTML = buildDiagramGrid(diagramAssets);
  const linkHTML    = linkAssets.length
    ? `<div class="asset-links">${linkAssets.map(buildAsset).join('')}</div>` : '';
  const lockedHTML  = lockedAssets.map(buildAsset).join('');

  const tagsHTML = project.tags
    ? project.tags.split(',').map(t => t.trim()).filter(Boolean).map(t =>
        `<span class="project-tag" onclick="filterByTag('${t.replace(/'/g,"\\'")}')">#${t}</span>`).join('')
    : ''

  return `
    <div class="project-card">
      <div class="project-card-head">
        <div class="project-card-head-main">
          <div class="project-card-title">${project.title}</div>
          ${project.description ? `<div class="project-card-desc">${project.description}</div>` : ''}
          ${tagsHTML ? `<div class="project-tags">${tagsHTML}</div>` : ''}
        </div>
        <span class="project-card-chevron"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="project-card-body">
        <div class="project-card-assets">
          ${codeHTML}
          ${diagramHTML}
          ${linkHTML}
          ${lockedHTML}
        </div>
      </div>
    </div>`;
}

const STATUS_BADGE = {
  upcoming:  { cls: 'badge-upcoming',  icon: 'circle',       text: 'Próximo' },
  active:    { cls: 'badge-active',    icon: 'zap',          text: 'En curso' },
  completed: { cls: 'badge-completed', icon: 'check-circle', text: 'Completado' },
};

function buildSession(session) {
  const b = STATUS_BADGE[session.status];

  const projectsHTML = session.projects.length
    ? `<div class="projects-list">${session.projects.map(buildProject).join('')}</div>`
    : `<div class="no-projects"><i data-lucide="inbox"></i> Sin proyectos aún</div>`;

  const descHTML = session.description
    ? `<p class="acc-session-desc">${session.description}</p>` : '';

  const dateText = (session.date_text && session.date_text.toLowerCase() !== 'por definir') ? session.date_text : '';

  const badgeHTML = b ? `
    <span class="acc-session-badge ${b.cls}">
      <i data-lucide="${b.icon}"></i>
      ${b.text}
    </span>` : '';

  return `
    <div class="acc-session" data-sid="${session.id}" data-status="${session.status || ''}">
      <div class="acc-session-head">
        <span class="acc-session-num">SESIÓN ${String(session.number).padStart(2,'0')}</span>
        <a href="/sesiones/${session.id}" class="acc-session-title" title="Ver sesión completa">${session.title}</a>
        <span class="acc-session-date">${dateText}</span>
        ${badgeHTML}
        <span class="acc-chevron"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="acc-session-body">
        ${descHTML}
        ${projectsHTML}
      </div>
    </div>`;
}

async function loadSessions() {
  const container = document.getElementById('sessionsAccordion');
  if (!container) return;

  try {
    const res      = await fetch('/api/sessions');
    const sessions = await res.json();

    if (!sessions.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:2rem 0;">No hay sesiones configuradas.</p>';
      return;
    }

    container.innerHTML = sessions.map(buildSession).join('');

    if (window.Prism) Prism.highlightAll();
    lucide.createIcons();

    container.querySelectorAll('.acc-session-head').forEach(head => {
      head.addEventListener('click', e => {
        // Clic en el título-enlace navega a la sesión; no togglea el acordeón.
        if (e.target.closest('.acc-session-title')) return;
        head.closest('.acc-session').classList.toggle('open');
      });
    });

    // Cada proyecto se abre individualmente; no todos a la vez al abrir la sesión.
    container.querySelectorAll('.project-card-head').forEach(head => {
      head.addEventListener('click', e => {
        if (e.target.closest('.project-tag')) return;
        head.closest('.project-card').classList.toggle('open');
      });
    });

    const active = container.querySelector('.acc-session [data-status="active"]');
    if (active) active.closest('.acc-session').classList.add('open');

    container.querySelectorAll('.reveal').forEach(el => el.classList.add('visible'));

  } catch (err) {
    container.innerHTML = `<p style="color:var(--text-dim);padding:2rem 0;">Error al cargar sesiones. <a href="javascript:location.reload()" style="color:var(--blue-300)">Reintentar</a></p>`;
    console.error(err);
  }
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Busqueda y filtro por etiquetas
let activeTagFilters = []

function filterByTag(tag) {
  if (activeTagFilters.includes(tag)) return
  activeTagFilters.push(tag)
  renderTagFilters()
  applySearch()
}

function removeTagFilter(tag) {
  activeTagFilters = activeTagFilters.filter(t => t !== tag)
  renderTagFilters()
  applySearch()
}

function renderTagFilters() {
  const container = document.getElementById('activeTagFilters')
  if (!container) return
  container.innerHTML = activeTagFilters.map(t => `
    <span class="tag-filter-chip" onclick="removeTagFilter('${t.replace(/'/g,"\\'")}')">
      #${t} <i data-lucide="x"></i>
    </span>`).join('')
  lucide.createIcons({ nodes: [container] })
}

function applySearch() {
  const q    = (document.getElementById('sessionSearch')?.value || '').toLowerCase().trim()
  const tags = activeTagFilters.map(t => t.toLowerCase())
  const sessions = document.querySelectorAll('.acc-session')

  sessions.forEach(sess => {
    const sessText = sess.querySelector('.acc-session-title')?.textContent.toLowerCase() || ''
    const cards    = sess.querySelectorAll('.project-card')
    let sessVisible = false

    cards.forEach(card => {
      const title  = card.querySelector('.project-card-title')?.textContent.toLowerCase() || ''
      const desc   = card.querySelector('.project-card-desc')?.textContent.toLowerCase() || ''
      const cardTags = [...card.querySelectorAll('.project-tag')].map(t => t.textContent.replace('#','').trim().toLowerCase())

      const textMatch = !q || title.includes(q) || desc.includes(q) || sessText.includes(q) || cardTags.some(t => t.includes(q))
      const tagMatch  = tags.length === 0 || tags.every(t => cardTags.includes(t))

      const match = textMatch && tagMatch
      card.style.display = match ? '' : 'none'
      // Al filtrar, abre los proyectos coincidentes para que se vean los resultados.
      card.classList.toggle('open', match && (!!q || tags.length > 0))
      if (match) sessVisible = true
    })

    if (!cards.length) sessVisible = !q || sessText.includes(q)
    sess.classList.toggle('search-hidden', !sessVisible)
    if (sessVisible && (q || tags.length)) sess.classList.add('open')
  })
}

function initSearch() {
  const input = document.getElementById('sessionSearch')
  const clear = document.getElementById('searchClear')
  if (!input) return

  input.addEventListener('input', () => {
    clear.style.display = input.value ? '' : 'none'
    applySearch()
  })
  clear.addEventListener('click', () => {
    input.value = ''
    clear.style.display = 'none'
    activeTagFilters = []
    renderTagFilters()
    applySearch()
  })
}

// Galeria y visor ampliado
function openLightbox(url, title, isVideo) {
  const lb = document.createElement('div')
  lb.className = 'lightbox-overlay'
  const media = isVideo
    ? `<iframe src="${url}" allowfullscreen></iframe>`
    : `<img src="${url}" alt="${escapeHtml(title)}">`
  lb.innerHTML = `
    <div class="lightbox-inner">
      <button class="lb-close" aria-label="Cerrar"><i data-lucide="x"></i></button>
      ${media}
      ${title ? `<p>${escapeHtml(title)}</p>` : ''}
    </div>`
  document.body.appendChild(lb)
  lb.addEventListener('click', e => { if (e.target === lb) lb.remove() })
  lb.querySelector('.lb-close').addEventListener('click', () => lb.remove())
  const onKey = (e) => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey) } }
  document.addEventListener('keydown', onKey)
  setTimeout(() => lucide.createIcons({ nodes: [lb] }), 10)
}

function buildGalleryItem(item) {
  const isVideo = item.type === 'video'
  const mediaHTML = isVideo
    ? `<div class="gallery-item-video"><i data-lucide="play-circle"></i></div>`
    : `<img src="${item.url}" alt="${escapeHtml(item.title)}" loading="lazy">`
  const embedUrl = isVideo ? toEmbedUrl(item.url) : item.url
  return `
    <div class="gallery-item" onclick="openLightbox('${embedUrl.replace(/'/g,"\\'")}','${item.title.replace(/'/g,"\\'")}',${isVideo})">
      ${mediaHTML}
      <div class="gallery-caption">${escapeHtml(item.caption || item.title)}</div>
    </div>`
}

function toEmbedUrl(url) {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?]+)/)
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?autoplay=1`
  return url
}

async function loadGallery() {
  const grid     = document.getElementById('galleryGrid')
  const moreWrap = document.getElementById('galleryMoreWrap')
  if (!grid) return
  try {
    const items = await fetch('/api/gallery').then(r => r.json())
    if (!items.length) {
      grid.innerHTML = `<div class="gallery-empty" style="grid-column:1/-1">
        <i data-lucide="image"></i>
        <p style="margin-top:0.6rem">Sin contenido aún. Los tutores irán subiendo fotos y videos.</p>
      </div>`
      lucide.createIcons({ nodes: [grid] })
      return
    }
    grid.innerHTML = items.slice(0, 3).map(buildGalleryItem).join('')
    lucide.createIcons({ nodes: [grid] })
    if (items.length > 3 && moreWrap) {
      moreWrap.hidden = false
      lucide.createIcons({ nodes: [moreWrap] })
    }
  } catch {}
}

// Ranking: equipos y resultados por sesion
const POS_CLASS = { 1: 'rank-pos-1', 2: 'rank-pos-2', 3: 'rank-pos-3' }

function buildSessionRanking(sessionId, entries) {
  const label = entries[0]?.activity_label || 'Actividad'
  const rows  = entries.sort((a,b) => a.position - b.position).map(e => {
    const cls = POS_CLASS[e.position] || 'rank-pos-n'
    return `<tr>
      <td><span class="rank-pos ${cls}">${e.position}</span></td>
      <td>${escapeHtml(e.team_name)}</td>
      <td>${e.score ? escapeHtml(e.score) : '-'}</td>
    </tr>`
  }).join('')
  return `
    <div class="ranking-session">
      <div class="ranking-session-head">
        <span class="ranking-session-label">Sesión ${sessionId}</span>
        <span class="ranking-session-activity">${escapeHtml(label)}</span>
        <i data-lucide="chevron-down"></i>
      </div>
      <div class="ranking-session-body" style="display:none">
        <table class="ranking-table">
          <thead><tr><th>Pos</th><th>Equipo</th><th>Resultado</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`
}

async function loadTeams() {
  const el = document.getElementById('teamsTable')
  if (!el) return
  try {
    const teams = await fetch('/api/teams').then(r => r.json())
    if (!teams.length) {
      el.innerHTML = '<p class="teams-empty">Sin equipos registrados aún.</p>'
      return
    }
    el.innerHTML = `<table class="teams-table">
      <thead><tr><th>#</th><th>Equipo</th></tr></thead>
      <tbody>${teams.map((t, i) => `<tr>
        <td class="teams-num">${String(i+1).padStart(2,'0')}</td>
        <td>${escapeHtml(t.name)}</td>
      </tr>`).join('')}</tbody>
    </table>`
  } catch {}
}

async function loadRankings() {
  const sessionsEl = document.getElementById('sessionRankings')
  if (!sessionsEl) return

  try {
    const all = await fetch('/api/rankings').then(r => r.json())
    const bySession = {}
    for (const r of all) {
      if (r.session_id == null) continue
      ;(bySession[r.session_id] = bySession[r.session_id] || []).push(r)
    }

    const entries = Object.entries(bySession).sort(([a],[b]) => +a - +b)

    if (!entries.length) {
      sessionsEl.innerHTML = '<p style="color:var(--text-dim);font-size:0.85rem">Sin resultados de competencias aún.</p>'
      return
    }

    sessionsEl.innerHTML = entries.map(([sid, ents]) => buildSessionRanking(sid, ents)).join('')

    sessionsEl.querySelectorAll('.ranking-session-head').forEach(head => {
      head.addEventListener('click', () => {
        const body = head.nextElementSibling
        body.style.display = body.style.display === 'none' ? '' : 'none'
      })
    })

    lucide.createIcons({ nodes: [sessionsEl] })
  } catch {}
}

// Feedback / sugerencias
function initFeedback() {
  const openBtn  = document.getElementById('openFeedbackBtn')
  const backdrop = document.getElementById('feedbackBackdrop')
  const closeBtn = document.getElementById('feedbackClose')
  const sendBtn  = document.getElementById('fb-send')
  if (!openBtn || !backdrop) return

  const msgEl    = document.getElementById('fb-message')
  const userEl   = document.getElementById('fb-name')
  const status   = document.getElementById('fb-status')

  const open  = () => { backdrop.classList.add('open'); status.textContent = ''; setTimeout(() => msgEl.focus(), 50) }
  const close = () => backdrop.classList.remove('open')

  openBtn.addEventListener('click', open)
  closeBtn.addEventListener('click', close)
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close() })
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close() })

  sendBtn.addEventListener('click', async () => {
    const message = msgEl.value.trim()
    if (!message) { status.textContent = 'Escribe un comentario'; status.className = 'feedback-feedback err'; return }
    sendBtn.disabled = true
    try {
      const res  = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: userEl.value.trim(), message }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Error')
      status.textContent = '¡Gracias por tu comentario!'
      status.className = 'feedback-feedback ok'
      msgEl.value = ''
      userEl.value = ''
      setTimeout(close, 1400)
    } catch (e) {
      status.textContent = e.message
      status.className = 'feedback-feedback err'
    } finally {
      sendBtn.disabled = false
    }
  })
}

// ─── Bracket de torneo ────────────────────────────────
// Nombres de ronda según cuántas rondas falten para la final.
function bracketRoundName(roundsLeft) {
  if (roundsLeft === 1) return 'Final';
  if (roundsLeft === 2) return 'Semifinales';
  if (roundsLeft === 3) return 'Cuartos de final';
  if (roundsLeft === 4) return 'Octavos de final';
  return 'Ronda';
}

async function loadBracket() {
  const board = document.getElementById('bracketBoard');
  if (!board) return;
  try {
    const data  = await fetch('/api/bracket').then(r => r.json());
    const titleEl = document.getElementById('bracketTitle');
    const subEl   = document.getElementById('bracketSubtitle');
    if (titleEl && data.title) titleEl.textContent = data.title;
    if (subEl)   subEl.textContent = data.subtitle || '';

    const teamsById = {};
    (data.teams || []).forEach(t => { teamsById[t.id] = t; });
    const rounds = data.rounds || [];

    // ¿Hay algún equipo colocado? Si no, mostramos un estado vacío elegante.
    const anyTeam = rounds[0]?.some(m => m.a != null || m.b != null);
    if (!anyTeam) {
      board.innerHTML = `<div class="bracket-empty">
        <i data-lucide="swords"></i>
        <p>La llave del torneo se revelará pronto.</p>
      </div>`;
      lucide.createIcons({ nodes: [board] });
      return;
    }

    const slot = (teamId, won, lost) => {
      const t = teamId != null ? teamsById[teamId] : null;
      const cls = ['bk-slot'];
      if (won)  cls.push('bk-slot--win');
      if (lost) cls.push('bk-slot--lose');
      if (!t)   cls.push('bk-slot--tbd');
      const logo = t?.logo
        ? `<img src="${escapeHtml(t.logo)}" alt="" class="bk-logo">`
        : `<span class="bk-logo bk-logo--ph">${t ? escapeHtml(t.name[0]) : '?'}</span>`;
      const name = t ? escapeHtml(t.name) : 'Por definir';
      return `<div class="${cls.join(' ')}">${logo}<span class="bk-name">${name}</span></div>`;
    };

    const champMatch = rounds[rounds.length - 1]?.[0];
    const champId = champMatch
      ? (champMatch.winner === 'a' ? champMatch.a : champMatch.winner === 'b' ? champMatch.b : null)
      : null;
    const champ = champId != null ? teamsById[champId] : null;

    let html = '<div class="bracket-rounds">';
    rounds.forEach((matches, r) => {
      const roundsLeft = rounds.length - r;
      html += `<div class="bk-round" style="--bk-r:${r}">
        <div class="bk-round-title">${bracketRoundName(roundsLeft)}</div>
        <div class="bk-matches">`;
      matches.forEach(m => {
        const aWon = m.winner === 'a', bWon = m.winner === 'b';
        html += `<div class="bk-match">
          ${slot(m.a, aWon, bWon)}
          <div class="bk-score">${m.scoreA !== '' || m.scoreB !== '' ? `${escapeHtml(m.scoreA||'0')}<span>:</span>${escapeHtml(m.scoreB||'0')}` : 'vs'}</div>
          ${slot(m.b, bWon, aWon)}
        </div>`;
      });
      html += `</div></div>`;
    });

    // Columna del campeón (la corona).
    html += `<div class="bk-round bk-champ-col" style="--bk-r:${rounds.length}">
      <div class="bk-round-title bk-round-title--gold">Campeón</div>
      <div class="bk-champ ${champ ? 'is-crowned' : ''}">
        <i data-lucide="crown" class="bk-crown"></i>
        ${champ
          ? `${champ.logo ? `<img src="${escapeHtml(champ.logo)}" alt="" class="bk-champ-logo">` : `<span class="bk-champ-logo bk-logo--ph">${escapeHtml(champ.name[0])}</span>`}
             <span class="bk-champ-name">${escapeHtml(champ.name)}</span>`
          : `<span class="bk-champ-name bk-champ-name--tbd">Por coronar</span>`}
      </div>
    </div>`;
    html += '</div>';

    board.innerHTML = html;
    lucide.createIcons({ nodes: [board] });
  } catch (e) {
    board.innerHTML = `<div class="bracket-empty"><p>No se pudo cargar la llave.</p></div>`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initCarousel();
  initNavbar();
  initMarquee();
  initHeroAOS();
  initReveal();
  initCounters();
  initSearch();
  loadSessions();
  loadGallery();
  loadTeams();
  loadRankings();
  loadBracket();
  initFeedback();
  lucide.createIcons();
});

window.loadBracket     = loadBracket
window.copyCode        = copyCode
window.filterByTag     = filterByTag
window.removeTagFilter = removeTagFilter
window.openLightbox    = openLightbox
