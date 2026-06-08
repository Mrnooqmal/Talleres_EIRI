// Página de detalle de sesión

// ─── Render de assets (mismo lógica que app.js) ───────

function escHtml(str) {
    return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function renderSesionAssets(assets, locked) {
    const diagrams = assets.filter(a => a.type === 'diagram');
    const code     = assets.filter(a => a.type === 'code');
    const slides   = assets.filter(a => a.type === 'slides');
    const others   = assets.filter(a => !['diagram','code','slides'].includes(a.type));

    let html = '';

    if (slides.length) {
        slides.forEach(a => { html += buildAssetHTML(a); });
    }
    if (code.length) {
        code.forEach(a => { html += buildAssetHTML(a); });
    }
    if (diagrams.length) {
        const cls = diagrams.length > 1 ? 'asset-diagram-grid multi' : 'asset-diagram-grid';
        html += `<div class="${cls}">`;
        diagrams.forEach(a => { html += buildDiagramHTML(a); });
        html += '</div>';
    }
    if (others.length) {
        html += `<div class="asset-links">`;
        others.forEach(a => { html += buildAssetHTML(a); });
        html += '</div>';
    }
    if (locked.length) {
        locked.forEach(a => {
            html += `<div class="asset-locked"><i data-lucide="lock"></i><span>${escHtml(a.label)}, disponible próximamente</span></div>`;
        });
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

const ASSET_ICONS = { code:'code-2', diagram:'cpu', slides:'file-text', video:'play-circle', model3d:'package', link:'external-link' };

function buildAssetHTML(a) {
    if (a.type === 'code') {
        const lang = a.language || 'plaintext';
        return `
          <div class="asset-code">
            <div class="asset-code-bar">
              <i data-lucide="code-2"></i>
              <span class="asset-code-name">${escHtml(a.label)}</span>
              <span class="lang-badge">${lang}</span>
              <button class="copy-btn" onclick="copyCode(this)">
                <i data-lucide="copy"></i> Copiar
              </button>
            </div>
            <pre><code class="language-${lang}">${escHtml(a.content)}</code></pre>
          </div>`;
    }
    if (a.type === 'diagram') return buildDiagramHTML(a);
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
    const icon = ASSET_ICONS[a.type] || 'external-link';
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

// ─── Sidebar índice y scroll activo ───────────────────
function initSesion() {
    // Toggle sidebar en móvil
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

    // Cerrar sidebar al hacer clic en un ítem del índice en móvil
    document.querySelectorAll('.ses-index-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth < 960) setSidebarOpen(false);
        });
    });

    // Resaltar ítem activo del índice al hacer scroll
    const projects  = document.querySelectorAll('.ses-project');
    const indexItems = document.querySelectorAll('.ses-index-item');
    if (!projects.length || !indexItems.length) return;

    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const pid = entry.target.id.replace('project-', '');
                indexItems.forEach(item => {
                    item.classList.toggle('active', item.dataset.pid === pid);
                });
                // Scroll del índice para mostrar el ítem activo
                const active = document.querySelector(`.ses-index-item[data-pid="${pid}"]`);
                active?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            }
        });
    }, { threshold: 0.25, rootMargin: '-60px 0px -40% 0px' });

    projects.forEach(p => observer.observe(p));
}

window.copyCode    = copyCode;
window.openLightbox = openLightbox;
window.renderSesionAssets = renderSesionAssets;
