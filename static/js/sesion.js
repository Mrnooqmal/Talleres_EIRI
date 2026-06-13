// Página de detalle de sesión

// ─── Helpers ──────────────────────────────────────────
function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── Render de assets ─────────────────────────────────
// Agrupa assets por tipo preservando orden de aparición,
// envuelve cada grupo en un div con anchor para el índice.
function renderSesionAssets(assets, locked, pid) {
    const typeOrder = [], byType = {};
    for (const a of assets) {
        if (!byType[a.type]) { byType[a.type] = []; typeOrder.push(a.type); }
        byType[a.type].push(a);
    }

    let html = '';
    for (const type of typeOrder) {
        const items = byType[type];
        const id    = pid ? ` id="project-${pid}-${type}"` : '';
        html += `<div class="ses-type-group"${id}>`;
        if (type === 'diagram') {
            const cls = items.length > 1 ? 'asset-diagram-grid multi' : 'asset-diagram-grid';
            html += `<div class="${cls}">`;
            items.forEach(a => { html += buildDiagramHTML(a); });
            html += '</div>';
        } else if (type === 'link') {
            html += `<div class="asset-links">`;
            items.forEach(a => { html += buildAssetHTML(a); });
            html += '</div>';
        } else {
            items.forEach(a => { html += buildAssetHTML(a); });
        }
        html += '</div>';
    }

    if (locked.length) {
        const id = pid ? ` id="project-${pid}-locked"` : '';
        html += `<div class="ses-type-group"${id}>`;
        locked.forEach(a => {
            html += `<div class="asset-locked"><i data-lucide="lock"></i><span>${escHtml(a.label)}, disponible próximamente</span></div>`;
        });
        html += '</div>';
    }
    return html;
}

function buildDiagramHTML(a) {
    const src = String(a.content).replace(/'/g, "\\'");
    const lbl = String(a.label).replace(/'/g, "\\'");
    return `
      <div class="asset-diagram">
        <div class="asset-diagram-bar"><i data-lucide="cpu"></i><span>${escHtml(a.label)}</span></div>
        <img src="${escHtml(a.content)}" alt="${escHtml(a.label)}" loading="lazy"
             onclick="openLightbox('${src}','${lbl}',false)" title="Ampliar imagen">
      </div>`;
}

function buildVideoHTML(a) {
    const url = a.content || '';
    const ytMatch    = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    const vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
    const isDirect   = /\.(mp4|webm|ogg)(\?.*)?$/i.test(url);

    const bar = `<div class="asset-video-bar"><i data-lucide="play-circle"></i><span>${escHtml(a.label)}</span></div>`;

    if (ytMatch) return `
      <div class="asset-video">
        ${bar}
        <div class="asset-video-wrap">
          <iframe src="https://www.youtube.com/embed/${ytMatch[1]}" frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen loading="lazy"></iframe>
        </div>
      </div>`;

    if (vimeoMatch) return `
      <div class="asset-video">
        ${bar}
        <div class="asset-video-wrap">
          <iframe src="https://player.vimeo.com/video/${vimeoMatch[1]}" frameborder="0"
            allow="autoplay; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe>
        </div>
      </div>`;

    if (isDirect) return `
      <div class="asset-video">
        ${bar}
        <video controls class="asset-video-player" preload="metadata">
          <source src="${escHtml(url)}">
          Tu navegador no soporta video HTML5.
        </video>
      </div>`;

    // URL no reconocida → enlace externo
    return `
      <a href="${escHtml(url)}" target="_blank" rel="noopener" class="asset-link-btn">
        <i data-lucide="play-circle"></i>
        <span>${escHtml(a.label)}</span>
        <i data-lucide="arrow-up-right" class="asset-link-arrow"></i>
      </a>`;
}

const SES_ASSET_ICONS = { code:'code-2', diagram:'cpu', slides:'file-text', video:'play-circle', model3d:'package', link:'external-link' };

function buildAssetHTML(a) {
    if (a.type === 'code') {
        // Solo permitir un identificador de lenguaje seguro; cualquier otra cosa
        // se trata como texto plano para que no rompa el atributo class ni el HTML.
        const rawLang = String(a.language || 'plaintext');
        const lang = /^[a-z0-9#+.-]{1,20}$/i.test(rawLang) ? rawLang : 'plaintext';
        return `
          <div class="asset-code">
            <div class="asset-code-bar">
              <i data-lucide="code-2"></i>
              <span class="asset-code-name">${escHtml(a.label)}</span>
              <span class="lang-badge">${escHtml(lang)}</span>
              <button class="copy-btn" onclick="copyCode(this)">
                <i data-lucide="copy"></i> Copiar
              </button>
            </div>
            <div class="asset-code-body">
              <pre><code class="language-${escHtml(lang)}">${escHtml(a.content)}</code></pre>
              <button class="code-expand-btn" onclick="toggleCode(this)" type="button">
                <i data-lucide="chevrons-down"></i> Ver código completo
              </button>
            </div>
          </div>`;
    }
    if (a.type === 'diagram') return buildDiagramHTML(a);
    if (a.type === 'video')   return buildVideoHTML(a);
    if (a.type === 'slides') {
        const isPDF = /\.pdf$/i.test(a.content) || a.content.includes('/uploads/');
        if (isPDF) return `
          <div class="asset-pdf">
            <div class="asset-pdf-bar">
              <i data-lucide="file-text"></i>
              <span>${escHtml(a.label)}</span>
              <a href="${escHtml(a.content)}" target="_blank" rel="noopener" class="pdf-open-link">
                <i data-lucide="external-link"></i> Abrir
              </a>
            </div>
            <iframe src="${escHtml(a.content)}" class="pdf-embed" title="${escHtml(a.label)}" loading="lazy"></iframe>
          </div>`;
        // URL de Google Slides / presentación externa
        return `
          <div class="asset-pdf">
            <div class="asset-pdf-bar">
              <i data-lucide="file-text"></i>
              <span>${escHtml(a.label)}</span>
              <a href="${escHtml(a.content)}" target="_blank" rel="noopener" class="pdf-open-link">
                <i data-lucide="external-link"></i> Abrir
              </a>
            </div>
            <iframe src="${escHtml(a.content)}" class="pdf-embed" title="${escHtml(a.label)}" loading="lazy"
              allow="autoplay"></iframe>
          </div>`;
    }
    if (a.type === 'markdown') {
        const html = typeof DOMPurify !== 'undefined'
            ? DOMPurify.sanitize(marked.parse(a.content || ''))
            : marked.parse(a.content || '');
        return `
          <div class="asset-markdown">
            <div class="asset-markdown-bar"><i data-lucide="align-left"></i><span>${escHtml(a.label)}</span></div>
            <div class="markdown-body">${html}</div>
          </div>`;
    }
    const icon = SES_ASSET_ICONS[a.type] || 'external-link';
    return `
      <a href="${escHtml(a.content)}" target="_blank" rel="noopener" class="asset-link-btn">
        <i data-lucide="${icon}"></i>
        <span>${escHtml(a.label)}</span>
        <i data-lucide="arrow-up-right" class="asset-link-arrow"></i>
      </a>`;
}

// ─── Copiar código ────────────────────────────────────
function copyCode(btn) {
    const pre  = btn.closest('.asset-code').querySelector('pre');
    navigator.clipboard.writeText(pre.textContent).then(() => {
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

// ─── Expandir / colapsar código largo ─────────────────
function toggleCode(btn) {
    const body = btn.closest('.asset-code-body');
    const expanded = body.classList.toggle('expanded');
    btn.innerHTML = expanded
        ? '<i data-lucide="chevrons-up"></i> Ver menos'
        : '<i data-lucide="chevrons-down"></i> Ver código completo';
    lucide.createIcons({ nodes: [btn] });
    if (!expanded) body.closest('.asset-code').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

// Oculta el botón "Ver más" cuando el código no se desborda.
function markOverflowingCode(root) {
    (root || document).querySelectorAll('.asset-code-body').forEach(body => {
        const pre = body.querySelector('pre');
        if (pre && pre.scrollHeight - pre.clientHeight < 8) {
            body.classList.add('no-overflow');
        }
    });
}
window.markOverflowingCode = markOverflowingCode;

// ─── Lightbox ─────────────────────────────────────────
function openLightbox(url, title, isVideo) {
    const lb = document.createElement('div');
    lb.className = 'lightbox-overlay';
    const media = isVideo
        ? `<iframe src="${url}" allowfullscreen></iframe>`
        : `<img src="${url}" alt="${escHtml(title)}">`;
    lb.innerHTML = `
      <div class="lightbox-inner">
        <button class="lb-close" aria-label="Cerrar"><i data-lucide="x"></i></button>
        ${media}
        ${title ? `<p>${escHtml(title)}</p>` : ''}
      </div>`;
    document.body.appendChild(lb);
    lb.addEventListener('click', e => { if (e.target === lb) lb.remove(); });
    lb.querySelector('.lb-close').addEventListener('click', () => lb.remove());
    const onKey = e => { if (e.key === 'Escape') { lb.remove(); document.removeEventListener('keydown', onKey); } };
    document.addEventListener('keydown', onKey);
    setTimeout(() => lucide.createIcons({ nodes: [lb] }), 10);
}

// ─── Copiar enlace a proyecto ─────────────────────────
function copyProjectLink(pid) {
    const url = `${location.origin}${location.pathname}#project-${pid}`;
    navigator.clipboard.writeText(url).then(() => {
        const btn = document.querySelector(`.ses-copy-link[onclick*="'${pid}'"]`);
        if (!btn) return;
        btn.classList.add('copied');
        const orig = btn.innerHTML;
        btn.innerHTML = '<svg data-lucide="check" width="13" height="13"></svg>';
        lucide.createIcons({ nodes: [btn] });
        setTimeout(() => {
            btn.innerHTML = orig;
            lucide.createIcons({ nodes: [btn] });
            btn.classList.remove('copied');
        }, 1800);
    });
}

// ─── Navbar del sitio (scroll collapse + mobile toggle) ─
function initNavbar() {
    const header = document.getElementById('siteHeader');
    const burger = document.getElementById('navBurger');
    const mobile = document.getElementById('navMobile');
    if (!header) return;

    window.addEventListener('scroll', () => {
        header.classList.toggle('scrolled', window.scrollY > 40);
        document.body.classList.toggle('scrolled', window.scrollY > 40);
    }, { passive: true });

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

// ─── Sidebar índice y scroll activo ───────────────────
function initSesion() {
    initNavbar();

    // Toggle sidebar en móvil (FAB)
    const toggleBtn = document.getElementById('indexToggle');
    const sidebar   = document.getElementById('sesSidebar');
    const backdrop  = document.getElementById('sesSidebarBackdrop');

    const setSidebarOpen = (open) => {
        sidebar?.classList.toggle('open', open);
        backdrop?.classList.toggle('open', open);
    };
    toggleBtn?.addEventListener('click', () => setSidebarOpen(!sidebar.classList.contains('open')));
    backdrop?.addEventListener('click', () => setSidebarOpen(false));
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setSidebarOpen(false); });

    // Cerrar sidebar al navegar en móvil
    document.querySelectorAll('.ses-index-item, .ses-index-sub').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 960) setSidebarOpen(false);
        });
    });

    // Barra de progreso de lectura
    const progressBar = document.getElementById('sesProgressBar');
    if (progressBar) {
        const updateProgress = () => {
            const scrolled = document.documentElement.scrollTop;
            const total    = document.documentElement.scrollHeight - window.innerHeight;
            progressBar.style.width = total > 0 ? `${(scrolled / total) * 100}%` : '0%';
        };
        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();
    }

    // Resaltar ítem activo del índice al hacer scroll
    const projects   = document.querySelectorAll('.ses-project');
    const indexItems = document.querySelectorAll('.ses-index-item');
    if (!projects.length || !indexItems.length) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pid = entry.target.id.replace('project-', '');
                indexItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.pid === pid);
                });
                // Scroll del SIDEBAR (no del body) — evita el scroll fight
                const sidebarEl  = document.getElementById('sesSidebar');
                const activeItem = document.querySelector(`.ses-index-item[data-pid="${pid}"]`);
                if (activeItem && sidebarEl) {
                    const itemTop   = activeItem.offsetTop;
                    const sidH      = sidebarEl.clientHeight;
                    const sidScroll = sidebarEl.scrollTop;
                    if (itemTop < sidScroll + 40 || itemTop > sidScroll + sidH - 80) {
                        sidebarEl.scrollTo({ top: Math.max(0, itemTop - sidH / 2), behavior: 'smooth' });
                    }
                }
            }
        });
    }, { threshold: 0.2, rootMargin: '-56px 0px -35% 0px' });

    projects.forEach(p => observer.observe(p));
}

window.copyCode           = copyCode;
window.openLightbox       = openLightbox;
window.renderSesionAssets = renderSesionAssets;
window.copyProjectLink    = copyProjectLink;
