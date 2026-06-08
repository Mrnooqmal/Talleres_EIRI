// EIRI Admin Panel — admin.js

const ASSET_TYPE_OPTS = [
  { value: 'code',     label: 'Código' },
  { value: 'diagram',  label: 'Diagrama (imagen)' },
  { value: 'slides',   label: 'Presentación (PDF)' },
  { value: 'markdown', label: 'Texto / Markdown' },
  { value: 'video',    label: 'Video' },
  { value: 'model3d',  label: 'Modelo 3D' },
  { value: 'link',     label: 'Enlace genérico' },
];

const LANG_OPTS = [
  { value: 'cpp',       label: 'Arduino / C++' },
  { value: 'c',         label: 'C' },
  { value: 'python',    label: 'Python' },
  { value: 'bash',      label: 'Bash' },
  { value: 'plaintext', label: 'Texto plano' },
];

const STATUS_OPTS = [
  { value: 'upcoming',  label: 'Próximo' },
  { value: 'active',    label: 'En curso' },
  { value: 'completed', label: 'Completado' },
];

// API
async function api(method, url, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Error');
  return data;
}

// Modal
const modalBackdrop = document.getElementById('modalBackdrop');
const modalTitle    = document.getElementById('modalTitle');
const modalBody     = document.getElementById('modalBody');
const modalSave     = document.getElementById('modalSave');
const modalCancel   = document.getElementById('modalCancel');
const modalClose    = document.getElementById('modalClose');

let modalSaveHandler = null;

function openModal(title, bodyHTML, onSave) {
  modalTitle.textContent = title;
  modalBody.innerHTML    = bodyHTML;
  modalSaveHandler       = onSave;
  modalBackdrop.classList.add('open');
  lucide.createIcons({ nodes: [modalBody] });

  // Handle type change for asset form
  const typeSelect = modalBody.querySelector('#f-type');
  if (typeSelect) typeSelect.addEventListener('change', () => updateAssetForm(typeSelect.value));
}

function closeModal() {
  modalBackdrop.classList.remove('open');
  modalSaveHandler = null;
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', e => { if (e.target === modalBackdrop) closeModal(); });
modalSave.addEventListener('click', () => { if (modalSaveHandler) modalSaveHandler(); });

// Confirm dialog
const confirmBackdrop = document.getElementById('confirmBackdrop');
const confirmTitle    = document.getElementById('confirmTitle');
const confirmMsg      = document.getElementById('confirmMsg');
const confirmOk       = document.getElementById('confirmOk');
const confirmCancel   = document.getElementById('confirmCancel');

function confirm(title, msg, onOk) {
  confirmTitle.textContent = title;
  confirmMsg.textContent   = msg;
  confirmBackdrop.classList.add('open');
  const handler = () => { confirmBackdrop.classList.remove('open'); onOk(); confirmOk.removeEventListener('click', handler); };
  confirmOk.addEventListener('click', handler);
}
confirmCancel.addEventListener('click', () => confirmBackdrop.classList.remove('open'));
confirmBackdrop.addEventListener('click', e => { if (e.target === confirmBackdrop) confirmBackdrop.classList.remove('open'); });

// View routing
document.querySelectorAll('.adm-nav-item[data-view]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.adm-nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.adm-view').forEach(v => v.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`view-${btn.dataset.view}`).classList.add('active');
    if (btn.dataset.view === 'logs')     loadLogs();
    if (btn.dataset.view === 'config')   loadConfig();
    if (btn.dataset.view === 'tutores')  loadTutores();
    if (btn.dataset.view === 'gallery')  loadGalleryAdmin();
    if (btn.dataset.view === 'rankings') loadRankingsAdmin();
    if (btn.dataset.view === 'teams')    loadTeamsAdmin();
    if (btn.dataset.view === 'feedback') loadFeedback();
  });
});

// Logout
document.getElementById('logoutBtn').addEventListener('click', async () => {
  await api('POST', '/api/admin/logout');
  window.location.href = '/admin/login';
});

// Sessions
async function loadSessions() {
  const list = document.getElementById('sessionsList');
  list.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem">Cargando...</p>';
  try {
    const sessions = await api('GET', '/api/admin/sessions');
    renderSessions(sessions);
  } catch (e) {
    list.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

const STATUS_CYCLE = { upcoming: 'active', active: 'completed', completed: 'upcoming' };
const STATUS_CLASS = { upcoming: 'status-upcoming', active: 'status-active', completed: 'status-completed' };
const STATUS_LABEL = { upcoming: 'Próximo', active: 'En curso', completed: 'Completado' };

function statusBadge(status, sid) {
  const cls = STATUS_CLASS[status] || 'status-upcoming';
  const lbl = STATUS_LABEL[status] || status;
  return `<button class="si-status-btn ${cls}" title="Clic para cambiar estado"
    onclick="cycleStatus(event,${sid},'${status}')">${lbl}</button>`;
}

async function cycleStatus(e, sid, current) {
  e.stopPropagation();
  const next = STATUS_CYCLE[current] || 'upcoming';
  const btn  = e.currentTarget;
  btn.textContent = '…';
  btn.disabled = true;
  try {
    await api('PATCH', `/api/admin/sessions/${sid}/status`, { status: next });
    btn.className = `si-status-btn ${STATUS_CLASS[next]}`;
    btn.textContent = STATUS_LABEL[next];
    btn.onclick = (ev) => cycleStatus(ev, sid, next);
  } catch {
    btn.textContent = STATUS_LABEL[current];
  }
  btn.disabled = false;
}

function renderSessions(sessions) {
  const list = document.getElementById('sessionsList');
  if (!sessions.length) {
    list.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem;padding:1rem 0">Sin sesiones. Crea la primera.</p>';
    return;
  }
  list.innerHTML = sessions.map(s => `
    <div class="session-item" data-sid="${s.id}" data-drag-id="${s.id}" draggable="true">
      <div class="session-item-head">
        <span class="drag-handle" title="Arrastar para reordenar"><i data-lucide="grip-vertical"></i></span>
        <span class="si-num">SESIÓN ${String(s.number).padStart(2,'0')}</span>
        <span class="si-title">${s.title}</span>
        <span class="si-date">${s.date_text}</span>
        ${statusBadge(s.status, s.id)}
        <div class="si-actions">
          <button class="btn-icon" title="Vista previa" onclick="previewSession(event,${s.id})"><i data-lucide="eye"></i></button>
          <button class="btn-icon" title="Editar sesión" onclick="editSession(${s.id})"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" title="Eliminar" onclick="deleteSession(${s.id},'${escHtml(s.title)}')"><i data-lucide="trash-2"></i></button>
        </div>
        <span class="si-chevron"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="session-item-body" id="session-body-${s.id}">
        <div class="projects-list" id="projects-${s.id}">
          <p style="color:var(--text-dim);font-size:.8rem;padding:.5rem 0">Cargando proyectos...</p>
        </div>
        <div class="add-row">
          <button class="btn-ghost" onclick="addProject(${s.id})">
            <i data-lucide="plus"></i> Nuevo proyecto
          </button>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons({ nodes: [list] });

  // Accordion toggle + lazy load projects
  list.querySelectorAll('.session-item-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.si-actions') || e.target.closest('.drag-handle') || e.target.closest('.si-status-btn')) return;
      const item = head.closest('.session-item');
      const wasOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!wasOpen) {
        const sid = item.dataset.sid;
        loadProjects(sid);
      }
    });
  });

  initDragDrop(list, '/api/admin/sessions/reorder');
}

// Session CRUD
function sessionFormHTML(s = {}) {
  return `
    <div class="field-group">
      <label>Número</label>
      <input type="number" id="f-number" min="1" value="${s.number ?? ''}" style="max-width:100px">
    </div>
    <div class="field-group">
      <label>Título</label>
      <input type="text" id="f-title" value="${escHtml(s.title ?? '')}">
    </div>
    <div class="field-group">
      <label>Fecha</label>
      <input type="text" id="f-date" value="${escHtml(s.date_text ?? 'Por definir')}" placeholder="Por definir">
    </div>
    <div class="field-group">
      <label>Estado</label>
      <select id="f-status">
        ${STATUS_OPTS.map(o => `<option value="${o.value}" ${s.status===o.value?'selected':''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="field-group">
      <label>Descripción (opcional)</label>
      <textarea id="f-description" rows="3">${escHtml(s.description ?? '')}</textarea>
    </div>`;
}

document.getElementById('addSessionBtn').addEventListener('click', () => {
  openModal('Nueva sesión', sessionFormHTML(), async () => {
    const data = {
      number:      parseInt(document.getElementById('f-number').value, 10),
      title:       document.getElementById('f-title').value.trim(),
      date_text:   document.getElementById('f-date').value.trim(),
      status:      document.getElementById('f-status').value,
      description: document.getElementById('f-description').value.trim(),
    };
    if (!data.title || !data.number) return alert('Número y título requeridos');
    data.display_order = data.number;
    await api('POST', '/api/admin/sessions', data);
    closeModal();
    loadSessions();
  });
});

async function editSession(sid) {
  const sessions = await api('GET', '/api/admin/sessions');
  const s = sessions.find(x => x.id === sid);
  if (!s) return;
  openModal('Editar sesión', sessionFormHTML(s), async () => {
    const data = {
      number:      parseInt(document.getElementById('f-number').value, 10),
      title:       document.getElementById('f-title').value.trim(),
      date_text:   document.getElementById('f-date').value.trim(),
      status:      document.getElementById('f-status').value,
      description: document.getElementById('f-description').value.trim(),
      display_order: parseInt(document.getElementById('f-number').value, 10),
    };
    if (!data.title || !data.number) return alert('Número y título requeridos');
    await api('PUT', `/api/admin/sessions/${sid}`, data);
    closeModal();
    loadSessions();
  });
}

function deleteSession(sid, title) {
  confirm('Eliminar sesión', `¿Eliminar "${title}" y todos sus proyectos?`, async () => {
    await api('DELETE', `/api/admin/sessions/${sid}`);
    loadSessions();
  });
}

// Projects
async function loadProjects(sessionId) {
  const container = document.getElementById(`projects-${sessionId}`);
  try {
    const projects = await api('GET', `/api/admin/projects?session_id=${sessionId}`);
    renderProjects(projects, sessionId, container);
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;font-size:.8rem">${e.message}</p>`;
  }
}

function renderProjects(projects, sessionId, container) {
  if (!projects.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:.8rem;padding:.4rem 0">Sin proyectos.</p>';
    return;
  }
  container.innerHTML = projects.map(p => `
    <div class="project-item" data-pid="${p.id}" data-drag-id="${p.id}" draggable="true">
      <div class="project-item-head">
        <span class="drag-handle" title="Arrastar para reordenar"><i data-lucide="grip-vertical"></i></span>
        <span class="pi-title">${escHtml(p.title)}</span>
        ${p.description ? `<span class="pi-desc">${escHtml(p.description)}</span>` : ''}
        <div class="si-actions">
          <button class="btn-icon" title="Editar" onclick="editProject(${p.id},${sessionId})"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" title="Eliminar" onclick="deleteProject(${p.id},'${escHtml(p.title)}',${sessionId})"><i data-lucide="trash-2"></i></button>
        </div>
        <span class="pi-chevron si-chevron"><i data-lucide="chevron-down"></i></span>
      </div>
      <div class="project-item-body" id="assets-wrap-${p.id}">
        <div class="assets-list" id="assets-${p.id}">
          <p style="color:var(--text-dim);font-size:.75rem">Cargando...</p>
        </div>
        <div class="add-row">
          <button class="btn-ghost" onclick="addAsset(${p.id},${sessionId})">
            <i data-lucide="plus"></i> Nuevo recurso
          </button>
        </div>
      </div>
    </div>
  `).join('');

  lucide.createIcons({ nodes: [container] });

  container.querySelectorAll('.project-item-head').forEach(head => {
    head.addEventListener('click', e => {
      if (e.target.closest('.si-actions') || e.target.closest('.drag-handle')) return;
      const item   = head.closest('.project-item');
      const wasOpen = item.classList.contains('open');
      item.classList.toggle('open');
      if (!wasOpen) loadAssets(item.dataset.pid);
    });
  });

  initDragDrop(container, '/api/admin/projects/reorder');
}

// Project CRUD
function projectFormHTML(p = {}) {
  return `
    <div class="field-group">
      <label>Título del proyecto</label>
      <input type="text" id="f-title" value="${escHtml(p.title ?? '')}" placeholder="Ej: Control de Motor DC con L298N">
    </div>
    <div class="field-group">
      <label>Descripción (opcional)</label>
      <textarea id="f-description" rows="2">${escHtml(p.description ?? '')}</textarea>
    </div>
    <div class="field-group">
      <label>Etiquetas (separadas por coma)</label>
      <input type="text" id="f-tags" value="${escHtml(p.tags ?? '')}" placeholder="arduino, motor, pwm, l298n">
    </div>`;
}

function addProject(sessionId) {
  openModal('Nuevo proyecto', projectFormHTML(), async () => {
    const data = {
      session_id:  sessionId,
      title:       document.getElementById('f-title').value.trim(),
      description: document.getElementById('f-description').value.trim(),
      tags:        document.getElementById('f-tags').value.trim(),
    };
    if (!data.title) return alert('Título requerido');
    await api('POST', '/api/admin/projects', data);
    closeModal();
    loadProjects(sessionId);
  });
}

async function editProject(pid, sessionId) {
  const projects = await api('GET', `/api/admin/projects?session_id=${sessionId}`);
  const p = projects.find(x => x.id === pid);
  if (!p) return;
  openModal('Editar proyecto', projectFormHTML(p), async () => {
    const data = {
      title:       document.getElementById('f-title').value.trim(),
      description: document.getElementById('f-description').value.trim(),
      tags:        document.getElementById('f-tags').value.trim(),
    };
    if (!data.title) return alert('Título requerido');
    await api('PUT', `/api/admin/projects/${pid}`, data);
    closeModal();
    loadProjects(sessionId);
  });
}

function deleteProject(pid, title, sessionId) {
  confirm('Eliminar proyecto', `¿Eliminar "${title}" y todos sus recursos?`, async () => {
    await api('DELETE', `/api/admin/projects/${pid}`);
    loadProjects(sessionId);
  });
}

// Assets
async function loadAssets(projectId) {
  const container = document.getElementById(`assets-${projectId}`);
  try {
    const assets = await api('GET', `/api/admin/assets?project_id=${projectId}`);
    renderAssets(assets, projectId, container);
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444;font-size:.75rem">${e.message}</p>`;
  }
}

const TYPE_ICONS = {
  code: 'code-2', diagram: 'cpu', slides: 'file-text',
  video: 'play-circle', model3d: 'package', link: 'external-link',
};

function renderAssets(assets, projectId, container) {
  if (!assets.length) {
    container.innerHTML = '<p style="color:var(--text-dim);font-size:.75rem;padding:.3rem 0">Sin recursos.</p>';
    return;
  }

  const imageAssets = assets.filter(a => a.type === 'diagram');
  const otherAssets = assets.filter(a => a.type !== 'diagram');

  let html = '';

  if (imageAssets.length > 0) {
    html += '<h4>Imágenes</h4>';
    html += '<div class="assets-grid">';
    html += imageAssets.map(a => `
      <div class="asset-image-card" data-aid="${a.id}">
        <img src="${escHtml(a.content)}" alt="${escHtml(a.label)}">
        <div class="asset-image-overlay">
          <span class="asset-item-label">${escHtml(a.label)}</span>
          <div class="si-actions">
            <button class="btn-icon" title="Editar" onclick="editAsset(${a.id},${projectId})"><i data-lucide="edit-2"></i></button>
            <button class="btn-icon btn-del" title="Eliminar" onclick="deleteAsset(${a.id},'${escHtml(a.label)}',${projectId})"><i data-lucide="trash-2"></i></button>
          </div>
        </div>
      </div>
    `).join('');
    html += '</div>';
  }

  if (otherAssets.length > 0) {
    if (imageAssets.length > 0) {
      html += '<h4 style="margin-top: 1.5rem;">Otros Recursos</h4>';
    }
    html += otherAssets.map(a => `
      <div class="asset-item" data-aid="${a.id}">
        <div class="asset-item-type"><i data-lucide="${TYPE_ICONS[a.type] || 'file'}"></i></div>
        <span class="asset-item-label">${escHtml(a.label)}</span>
        ${a.language ? `<span class="asset-item-lang">${a.language}</span>` : ''}
        ${a.is_locked ? `<span class="asset-item-lock"><i data-lucide="lock"></i></span>` : ''}
        <div class="si-actions">
          <button class="btn-icon" title="Editar" onclick="editAsset(${a.id},${projectId})"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" title="Eliminar" onclick="deleteAsset(${a.id},'${escHtml(a.label)}',${projectId})"><i data-lucide="trash-2"></i></button>
        </div>
      </div>
    `).join('');
  }

  container.innerHTML = html;
  lucide.createIcons({ nodes: [container] });
}

// Asset form
function assetFormHTML(a = {}) {
  const t      = a.type || 'code'
  const isCode = t === 'code'
  const isMd   = t === 'markdown'
  const isFile = t === 'diagram' || t === 'slides'
  const isText = isCode || isMd
  const lbl    = isCode ? 'Código' : isMd ? 'Contenido (Markdown)' : 'URL'
  return `
    <div class="field-group">
      <label>Tipo de recurso</label>
      <select id="f-type" onchange="updateAssetForm(this.value)">
        ${ASSET_TYPE_OPTS.map(o => `<option value="${o.value}" ${a.type===o.value?'selected':''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="field-group">
      <label>Etiqueta / nombre</label>
      <input type="text" id="f-label" value="${escHtml(a.label ?? '')}" placeholder="Ej: motor_dc.ino">
    </div>
    <div class="field-group" id="fg-lang" style="${isCode?'':'display:none'}">
      <label>Lenguaje</label>
      <select id="f-language">
        ${LANG_OPTS.map(o => `<option value="${o.value}" ${a.language===o.value?'selected':''}>${o.label}</option>`).join('')}
      </select>
    </div>
    <div class="field-group">
      <div style="display:flex;align-items:center;gap:.5rem;margin-bottom:.35rem">
        <label id="content-lbl" style="margin:0">${lbl}</label>
        <span id="fg-upload" style="${isCode?'':'display:none'}">
          <label class="btn-ghost" style="cursor:pointer;font-size:.72rem;padding:.25rem .6rem">
            <i data-lucide="upload" style="width:12px;height:12px"></i> Subir archivo
            <input type="file" id="f-file-code" style="display:none"
              accept=".ino,.cpp,.c,.py,.js,.ts,.h,.hpp,.txt,.md" multiple>
          </label>
        </span>
        <span id="fg-upload-img" style="${isFile?'':'display:none'}">
          <label class="btn-ghost" style="cursor:pointer;font-size:.72rem;padding:.25rem .6rem">
            <i data-lucide="upload" style="width:12px;height:12px"></i> Subir archivo
            <input type="file" id="f-file-img" style="display:none"
              accept="${t==='slides'?'.pdf':'image/*,.svg'}" multiple>
          </label>
        </span>
      </div>
      <textarea id="f-content" rows="${isText?13:2}" class="${isCode?'code-ta':''}"
        placeholder="${isFile?'https://... o sube un archivo arriba':''}"
      >${escHtml(a.content ?? '')}</textarea>
      <div id="f-upload-status" style="font-size:.72rem;color:var(--blue-300);margin-top:.25rem"></div>
    </div>
    <div class="field-group">
      <label class="checkbox-label">
        <input type="checkbox" id="f-locked" ${a.is_locked?'checked':''}>
        <span>Bloqueado (no visible para estudiantes)</span>
      </label>
    </div>`;
}

function updateAssetForm(type) {
  const isCode = type === 'code'
  const isMd   = type === 'markdown'
  const isFile = type === 'diagram' || type === 'slides'
  const isText = isCode || isMd
  const fgLang = document.getElementById('fg-lang')
  const fgUp   = document.getElementById('fg-upload')
  const fgUpI  = document.getElementById('fg-upload-img')
  const lbl    = document.getElementById('content-lbl')
  const ta     = document.getElementById('f-content')
  const fi     = document.getElementById('f-file-img')

  if (fgLang) fgLang.style.display = isCode ? '' : 'none'
  if (fgUp)   fgUp.style.display   = isCode ? '' : 'none'
  if (fgUpI)  fgUpI.style.display  = isFile ? '' : 'none'
  if (lbl)    lbl.textContent = isCode ? 'Código' : isMd ? 'Contenido (Markdown)' : 'URL'
  if (ta) { ta.rows = isText ? 13 : 2; ta.classList.toggle('code-ta', isCode) }
  if (fi && type === 'slides') fi.setAttribute('accept', '.pdf')
  if (fi && type === 'diagram') fi.setAttribute('accept', 'image/*,.svg')
  lucide.createIcons({ nodes: [document.getElementById('fg-upload'), document.getElementById('fg-upload-img')].filter(Boolean) })
}

function bindAssetFileHandlers() {
  const codeInput = document.getElementById('f-file-code')
  const imgInput  = document.getElementById('f-file-img')
  const ta        = document.getElementById('f-content')
  const status    = document.getElementById('f-upload-status')
  const saveBtn   = document.getElementById('modalSave')

  if (codeInput) {
    codeInput.addEventListener('change', async () => {
      const files = codeInput.files;
      if (!files.length) return;
      
      const file = files[0];
      status.textContent = `Cargando: ${file.name}...`;
      saveBtn.disabled = true;
      const text = await file.text();
      ta.value = text;
      status.textContent = `Cargado: ${file.name}`;
      if (files.length > 1) {
        status.textContent += ` (se seleccionaron ${files.length} archivos, solo se usó el primero).`;
      }
      saveBtn.disabled = false;
    });
  }

  if (imgInput) {
    imgInput.addEventListener('change', async () => {
      const files = imgInput.files;
      if (!files.length) return;

      status.textContent = `Subiendo ${files.length} archivos...`;
      saveBtn.disabled = true;
      const urls = [];

      for (const f of files) {
        const fd = new FormData();
        fd.append('file', f);
        try {
          const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error);
          urls.push(data.url);
        } catch (e) {
          status.textContent = `Error: ${e.message}`;
          saveBtn.disabled = false;
          return;
        }
      }
      
      // Una URL por línea: si hay varias, addAsset crea un recurso por cada una.
      ta.value = urls.join('\n');
      status.textContent = files.length > 1
        ? `${files.length} archivos subidos. Se creará un recurso por cada imagen al guardar.`
        : `Subido: ${files[0].name}`;
      saveBtn.disabled = false;
    });
  }
}

function addAsset(projectId, sessionId) {
  openModal('Nuevo recurso', assetFormHTML(), async () => {
    const data = {
      project_id: projectId,
      type:       document.getElementById('f-type').value,
      label:      document.getElementById('f-label').value.trim(),
      content:    document.getElementById('f-content').value,
      language:   document.getElementById('f-language')?.value || '',
      is_locked:  document.getElementById('f-locked').checked,
    };
    if (!data.label) return alert('Etiqueta requerida');
    // Para diagramas con varias imágenes subidas (una URL por línea) creamos un recurso por cada una.
    const urls = data.type === 'diagram'
      ? data.content.split('\n').map(u => u.trim()).filter(Boolean)
      : [];
    if (urls.length > 1) {
      for (let i = 0; i < urls.length; i++) {
        await api('POST', '/api/admin/assets', { ...data, content: urls[i], label: `${data.label} ${i + 1}` });
      }
    } else {
      await api('POST', '/api/admin/assets', data);
    }
    closeModal();
    loadAssets(projectId);
  });
  setTimeout(() => { lucide.createIcons(); bindAssetFileHandlers(); }, 50);
}

async function editAsset(aid, projectId) {
  const assets = await api('GET', `/api/admin/assets?project_id=${projectId}`);
  const a = assets.find(x => x.id === aid);
  if (!a) return;
  openModal('Editar recurso', assetFormHTML(a), async () => {
    const data = {
      type:      document.getElementById('f-type').value,
      label:     document.getElementById('f-label').value.trim(),
      content:   document.getElementById('f-content').value,
      language:  document.getElementById('f-language')?.value || '',
      is_locked: document.getElementById('f-locked').checked,
    };
    if (!data.label) return alert('Etiqueta requerida');
    await api('PUT', `/api/admin/assets/${aid}`, data);
    closeModal();
    loadAssets(projectId);
  });
  setTimeout(() => { lucide.createIcons(); bindAssetFileHandlers(); }, 50);
}

function deleteAsset(aid, label, projectId) {
  confirm('Eliminar recurso', `¿Eliminar "${label}"?`, async () => {
    await api('DELETE', `/api/admin/assets/${aid}`);
    loadAssets(projectId);
  });
}

// Config
const CFG_KEYS = [
  'site_title','subtitle','hero_description','year','contact',
  'about_description','social_instagram','social_discord','social_github','social_email',
  'stat_sessions','stat_participants','stat_robots',
]

async function loadConfig() {
  try {
    const cfg = await api('GET', '/api/config');
    CFG_KEYS.forEach(k => {
      const el = document.getElementById(`cfg-${k}`);
      if (el) el.value = cfg[k] || '';
    });
  } catch {}
}

// ─── Save config helpers ───────────────────────────────
async function saveCfgFields(keys, fbId) {
  const fb = document.getElementById(fbId);
  if (!fb) return;
  const data = {};
  keys.forEach(k => {
    const el = document.getElementById(`cfg-${k}`);
    if (el) data[k] = el.value;
  });
  try {
    await api('PUT', '/api/admin/config', data);
    fb.textContent = 'Guardado ✓';
    fb.className   = 'cfg-feedback ok';
    setTimeout(() => fb.textContent = '', 2500);
  } catch (e) {
    fb.textContent = e.message;
    fb.className   = 'cfg-feedback err';
  }
}

document.getElementById('saveCfgBtn')?.addEventListener('click', () =>
  saveCfgFields(['site_title','subtitle','hero_description','about_description','year','contact'], 'cfgFeedback')
);
document.getElementById('saveStatsBtn')?.addEventListener('click', () =>
  saveCfgFields(['stat_sessions','stat_participants','stat_robots'], 'statsFeedback')
);
document.getElementById('saveSocialBtn')?.addEventListener('click', () =>
  saveCfgFields(['social_instagram','social_discord','social_github','social_email'], 'socialFeedback')
);

document.getElementById('savePwBtn')?.addEventListener('click', async () => {
  const fb   = document.getElementById('pwFeedback');
  const curr = document.getElementById('pw-current').value;
  const nw   = document.getElementById('pw-new').value;
  const conf = document.getElementById('pw-confirm').value;
  if (nw !== conf) { fb.textContent = 'Las contraseñas no coinciden'; fb.className = 'cfg-feedback err'; return; }
  if (nw.length < 6) { fb.textContent = 'Mínimo 6 caracteres'; fb.className = 'cfg-feedback err'; return; }
  try {
    await api('PUT', '/api/admin/password', { current: curr, new: nw });
    fb.textContent = 'Contraseña actualizada';
    fb.className   = 'cfg-feedback ok';
    document.getElementById('pw-current').value = '';
    document.getElementById('pw-new').value      = '';
    document.getElementById('pw-confirm').value  = '';
    setTimeout(() => fb.textContent = '', 2500);
  } catch (e) {
    fb.textContent = e.message;
    fb.className   = 'cfg-feedback err';
  }
});

// Convierte una fecha UTC de SQLite ("YYYY-MM-DD HH:MM:SS") a hora de Chile
function fmtFechaCL(s) {
  if (!s) return '';
  const d = new Date(s.replace(' ', 'T').replace('Z', '') + 'Z'); // interpreta como UTC
  if (isNaN(d)) return s;
  return d.toLocaleString('es-CL', {
    timeZone: 'America/Santiago',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  });
}

// Logs
async function loadLogs() {
  const tbody = document.getElementById('logsBody');
  tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Cargando...</td></tr>';
  try {
    const logs = await api('GET', '/api/admin/logs?limit=200');
    if (!logs.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:var(--text-dim)">Sin registros</td></tr>'; return; }
    tbody.innerHTML = logs.map(l => `
      <tr>
        <td>${fmtFechaCL(l.created_at)}</td>
        <td>${escHtml(l.event)}</td>
        <td>${escHtml(l.detail)}</td>
        <td>${l.user === 'anon' ? '<span class="log-anon">Visitante</span>' : escHtml(l.user)}</td>
        <td>${escHtml(l.ip)}</td>
      </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="5" style="color:#ef4444">${e.message}</td></tr>`;
  }
}

document.getElementById('refreshLogsBtn')?.addEventListener('click', loadLogs)

// Feedback / comentarios
async function loadFeedback() {
  const container = document.getElementById('feedbackList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem">Cargando...</p>';
  try {
    const items = await api('GET', '/api/admin/feedback');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Aún no hay comentarios.</p>';
      return;
    }
    container.innerHTML = items.map(f => `
      <div class="feedback-card">
        <div class="feedback-card-head">
          <span class="feedback-card-name">${escHtml(f.name) || 'Anónimo'}</span>
          <span class="feedback-card-date">${fmtFechaCL(f.created_at)}</span>
          <button class="btn-icon btn-del" onclick="deleteFeedback(${f.id})" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
        <p class="feedback-card-msg">${escHtml(f.message)}</p>
      </div>`).join('');
    lucide.createIcons({ nodes: [container] });
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function deleteFeedback(id) {
  confirm('Eliminar comentario', '¿Eliminar este comentario? Esta acción no se puede deshacer.', async () => {
    await api('DELETE', `/api/admin/feedback/${id}`);
    loadFeedback();
  });
}

document.getElementById('refreshFeedbackBtn')?.addEventListener('click', loadFeedback)

// Tutores
async function loadTutores() {
  const container = document.getElementById('tutoresList');
  try {
    const tutores = await api('GET', '/api/admin/tutores');
    if (!tutores.length) {
      container.innerHTML = '<p style="color:var(--text-dim)">Sin tutores registrados.</p>';
      return;
    }
    container.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>ID</th><th>Usuario</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          ${tutores.map(t => `
            <tr>
              <td>#${t.id}</td>
              <td>
                <strong>${escHtml(t.username)}</strong>
                ${t.is_super ? '<span class="tutor-badge">Admin principal</span>' : ''}
              </td>
              <td>${(t.created_at || '').slice(0,10)}</td>
              <td style="display:flex;gap:.4rem">
                <button class="btn-icon" onclick="renameTutor(${t.id},'${escHtml(t.username)}')" title="Cambiar nombre de usuario">
                  <i data-lucide="pencil"></i>
                </button>
                <button class="btn-icon" onclick="resetTutorPw(${t.id},'${escHtml(t.username)}')" title="Cambiar contraseña">
                  <i data-lucide="key"></i>
                </button>
                ${!t.is_super ? `
                <button class="btn-icon" onclick="makeSuperAdmin(${t.id},'${escHtml(t.username)}')" title="Hacer Admin Principal">
                  <i data-lucide="crown"></i>
                </button>
                ` : ''}
                <button class="btn-icon btn-del" onclick="deleteTutor(${t.id},'${escHtml(t.username)}')" title="Eliminar">
                  <i data-lucide="trash-2"></i>
                </button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>`;
    lucide.createIcons({ nodes: [container] });
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

document.getElementById('addTutorBtn')?.addEventListener('click', () => {
  openModal('Nuevo tutor', `
    <div class="field-group">
      <label>Nombre de usuario</label>
      <input type="text" id="f-tutor-user" placeholder="tutor01" autocomplete="off">
    </div>
    <div class="field-group">
      <label>Contraseña (mín. 6 caracteres)</label>
      <input type="password" id="f-tutor-pw" autocomplete="new-password">
    </div>
    <div class="field-group">
      <label>Confirmar contraseña</label>
      <input type="password" id="f-tutor-pw2" autocomplete="new-password">
    </div>
  `, async () => {
    const username = document.getElementById('f-tutor-user').value.trim();
    const pw       = document.getElementById('f-tutor-pw').value;
    const pw2      = document.getElementById('f-tutor-pw2').value;
    if (!username) return alert('Usuario requerido');
    if (pw.length < 6) return alert('Contraseña mínimo 6 caracteres');
    if (pw !== pw2) return alert('Las contraseñas no coinciden');
    await api('POST', '/api/admin/tutores', { username, password: pw });
    closeModal();
    loadTutores();
  });
});

function renameTutor(id, username) {
  openModal(`Cambiar nombre de usuario: ${username}`, `
    <div class="field-group">
      <label>Nuevo nombre de usuario</label>
      <input type="text" id="f-rename-user" value="${escHtml(username)}" autocomplete="off">
    </div>
  `, async () => {
    const nuevo = document.getElementById('f-rename-user').value.trim()
    if (!nuevo) return alert('Nombre de usuario requerido')
    await api('PUT', `/api/admin/tutores/${id}/username`, { username: nuevo })
    closeModal()
    loadTutores()
  })
}

function resetTutorPw(id, username) {
  openModal(`Cambiar contraseña: ${username}`, `
    <div class="field-group">
      <label>Nueva contraseña (mín. 6 caracteres)</label>
      <input type="password" id="f-reset-pw" autocomplete="new-password">
    </div>
    <div class="field-group">
      <label>Confirmar</label>
      <input type="password" id="f-reset-pw2" autocomplete="new-password">
    </div>
  `, async () => {
    const pw  = document.getElementById('f-reset-pw').value
    const pw2 = document.getElementById('f-reset-pw2').value
    if (pw.length < 6) return alert('Mínimo 6 caracteres')
    if (pw !== pw2)    return alert('Las contraseñas no coinciden')
    await api('PUT', `/api/admin/tutores/${id}/password`, { password: pw })
    closeModal()
  })
}

function makeSuperAdmin(id, username) {
  confirm('Hacer Admin Principal', `¿Otorgar privilegios de administrador principal a "${username}"? Podrá gestionar tutores y configuración.`, async () => {
    await api('PUT', `/api/admin/tutores/${id}/super`)
    loadTutores()
  })
}

function deleteTutor(id, username) {
  confirm('Eliminar tutor', `¿Eliminar la cuenta de "${username}"? Esta acción no se puede deshacer.`, async () => {
    await api('DELETE', `/api/admin/tutores/${id}`);
    loadTutores();
  });
};

// Helpers
function escHtml(str) {
  return String(str ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Gallery
async function loadGalleryAdmin() {
  const container = document.getElementById('galleryList');
  if (!container) return;
  try {
    const items = await api('GET', '/api/admin/gallery');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin elementos en la galería.</p>';
      return;
    }
    container.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>Vista previa</th><th>Tipo</th><th>Título</th><th>Caption</th><th>Orden</th><th></th></tr></thead>
        <tbody>
          ${items.map(it => {
            const preview = it.type === 'image'
              ? `<img src="${escHtml(it.url)}" style="height:40px;width:60px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="window.open('${escHtml(it.url)}','_blank')" title="Ver imagen">`
              : `<a href="${escHtml(it.url)}" target="_blank" style="color:var(--blue-300);font-size:0.72rem">Ver video</a>`
            return `<tr>
              <td>${preview}</td>
              <td>${it.type === 'video' ? 'Video' : 'Imagen'}</td>
              <td><strong>${escHtml(it.title)}</strong></td>
              <td>${escHtml(it.caption || '-')}</td>
              <td>${it.order_index}</td>
              <td style="display:flex;gap:.4rem">
                <button class="btn-icon" onclick="editGalleryItem(${it.id})" title="Editar"><i data-lucide="edit-2"></i></button>
                <button class="btn-icon btn-del" onclick="deleteGalleryItem(${it.id},'${escHtml(it.title)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
              </td>
            </tr>`}).join('')}
        </tbody>
      </table>`;
    lucide.createIcons({ nodes: [container] });
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function galleryFormHTML(item = {}) {
  return `
    <div class="field-group">
      <label>Tipo</label>
      <select id="f-gal-type">
        <option value="image" ${item.type !== 'video' ? 'selected' : ''}>Imagen</option>
        <option value="video" ${item.type === 'video' ? 'selected' : ''}>Video (YouTube u otro)</option>
      </select>
    </div>
    <div class="field-group">
      <label>Título</label>
      <input type="text" id="f-gal-title" value="${escHtml(item.title || '')}">
    </div>
    <div class="field-group" id="f-gal-url-wrap">
      <label>URL o subir imagen</label>
      <input type="text" id="f-gal-url" value="${escHtml(item.url || '')}" placeholder="https://... o deja vacío y sube archivo">
      <div style="margin-top:0.4rem;display:flex;gap:0.5rem;align-items:center">
        <button type="button" class="btn-ghost btn--sm" id="f-gal-upload-btn"><i data-lucide="upload"></i> Subir imagen</button>
        <input type="file" id="f-gal-file" accept=".png,.jpg,.jpeg,.gif,.webp" style="display:none" multiple>
        <span id="f-gal-upload-status" style="font-size:0.72rem;color:var(--text-dim)"></span>
      </div>
    </div>
    <div class="field-group">
      <label>Caption / descripción</label>
      <input type="text" id="f-gal-caption" value="${escHtml(item.caption || '')}">
    </div>
    <div class="field-group">
      <label>Orden</label>
      <input type="number" id="f-gal-order" value="${item.order_index ?? 0}" style="max-width:80px">
    </div>`;
}

function bindGalleryUpload() {
  const btn    = document.getElementById('f-gal-upload-btn');
  const file   = document.getElementById('f-gal-file');
  const urlEl  = document.getElementById('f-gal-url');
  const status = document.getElementById('f-gal-upload-status');
  if (!btn) return;
  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    if (!file.files.length) return;
    
    const files = Array.from(file.files);
    status.textContent = `Subiendo ${files.length} archivos...`;
    const urls = [];

    for (const f of files) {
      try {
        const fd = new FormData();
        fd.append('file', f);
        const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);
        urls.push(data.url);
      } catch (e) {
        status.textContent = 'Error: ' + e.message;
        return; // Stop on first error
      }
    }
    
    // Una URL por línea: si hay varias, se crea una entrada de galería por cada una al guardar.
    urlEl.value = urls.join('\n');
    status.textContent = files.length > 1
      ? `${files.length} archivos subidos. Se creará una entrada por cada imagen al guardar.`
      : `Subido: ${files[0].name}`;
  });
}

document.getElementById('addGalleryItemBtn')?.addEventListener('click', () => {
  openModal('Nueva entrada de galería', galleryFormHTML(), async () => {
    const payload = {
      title:       document.getElementById('f-gal-title').value.trim(),
      url:         document.getElementById('f-gal-url').value.trim(),
      type:        document.getElementById('f-gal-type').value,
      caption:     document.getElementById('f-gal-caption').value.trim(),
      order_index: parseInt(document.getElementById('f-gal-order').value) || 0,
    };
    if (!payload.title || !payload.url) return alert('Título y URL requeridos');
    // Una URL por línea: si se subieron varias imágenes creamos una entrada por cada una.
    const urls = payload.url.split('\n').map(u => u.trim()).filter(Boolean);
    if (urls.length > 1) {
      for (let i = 0; i < urls.length; i++) {
        await api('POST', '/api/admin/gallery', {
          ...payload, url: urls[i],
          title: `${payload.title} ${i + 1}`,
          order_index: payload.order_index + i,
        });
      }
    } else {
      await api('POST', '/api/admin/gallery', payload);
    }
    closeModal();
    loadGalleryAdmin();
  });
  setTimeout(() => { lucide.createIcons(); bindGalleryUpload(); }, 50);
});

async function editGalleryItem(id) {
  const items = await api('GET', '/api/admin/gallery');
  const item  = items.find(i => i.id === id);
  if (!item) return;
  openModal('Editar galería', galleryFormHTML(item), async () => {
    const payload = {
      title:       document.getElementById('f-gal-title').value.trim(),
      url:         document.getElementById('f-gal-url').value.trim(),
      type:        document.getElementById('f-gal-type').value,
      caption:     document.getElementById('f-gal-caption').value.trim(),
      order_index: parseInt(document.getElementById('f-gal-order').value) || 0,
    };
    if (!payload.title || !payload.url) return alert('Título y URL requeridos');
    await api('PUT', `/api/admin/gallery/${id}`, payload);
    closeModal();
    loadGalleryAdmin();
  });
  setTimeout(() => { lucide.createIcons(); bindGalleryUpload(); }, 50);
}

function deleteGalleryItem(id, title) {
  confirm('Eliminar elemento', `¿Eliminar "${title}" de la galería?`, async () => {
    await api('DELETE', `/api/admin/gallery/${id}`);
    loadGalleryAdmin();
  });
}

// Rankings
async function loadRankingsAdmin() {
  const container = document.getElementById('rankingsList');
  if (!container) return;
  try {
    const items = await api('GET', '/api/admin/rankings');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin entradas de ranking.</p>';
      return;
    }
    container.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>Sesión</th><th>Actividad</th><th>Pos.</th><th>Equipo</th><th>Resultado</th><th></th></tr></thead>
        <tbody>
          ${items.map(it => `<tr>
            <td>${it.session_id ? 'Sesión ' + it.session_id : 'Global'}</td>
            <td>${escHtml(it.activity_label)}</td>
            <td>#${it.position}</td>
            <td><strong>${escHtml(it.team_name)}</strong></td>
            <td>${escHtml(it.score || '-')}</td>
            <td style="display:flex;gap:.4rem">
              <button class="btn-icon" onclick="editRanking(${it.id})" title="Editar"><i data-lucide="edit-2"></i></button>
              <button class="btn-icon btn-del" onclick="deleteRanking(${it.id},'${escHtml(it.team_name)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    lucide.createIcons({ nodes: [container] });
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function rankingFormHTML(item = {}) {
  return `
    <div class="field-group">
      <label>Sesión (vacío = Ranking Global)</label>
      <input type="number" id="f-rk-session" value="${item.session_id || ''}" placeholder="Ej: 3 (vacío = global)" style="max-width:160px">
    </div>
    <div class="field-group">
      <label>Nombre de actividad</label>
      <input type="text" id="f-rk-label" value="${escHtml(item.activity_label || 'Actividad')}" placeholder="Ej: Carrera de velocidad">
    </div>
    <div class="field-group">
      <label>Equipo</label>
      <input type="text" id="f-rk-team" value="${escHtml(item.team_name || '')}">
    </div>
    <div class="field-group">
      <label>Posición</label>
      <input type="number" id="f-rk-pos" value="${item.position || 1}" min="1" style="max-width:80px">
    </div>
    <div class="field-group">
      <label>Resultado / Puntaje (opcional)</label>
      <input type="text" id="f-rk-score" value="${escHtml(item.score || '')}" placeholder="Ej: 4.5s, 320 pts">
    </div>`;
}

document.getElementById('addRankingBtn')?.addEventListener('click', () => {
  openModal('Nueva entrada de ranking', rankingFormHTML(), async () => {
    const sid = document.getElementById('f-rk-session').value.trim();
    await api('POST', '/api/admin/rankings', {
      session_id:     sid || null,
      activity_label: document.getElementById('f-rk-label').value.trim() || 'Actividad',
      team_name:      document.getElementById('f-rk-team').value.trim(),
      score:          document.getElementById('f-rk-score').value.trim(),
      position:       parseInt(document.getElementById('f-rk-pos').value) || 1,
    });
    closeModal();
    loadRankingsAdmin();
  });
});

async function editRanking(id) {
  const items = await api('GET', '/api/admin/rankings');
  const item  = items.find(i => i.id === id);
  if (!item) return;
  openModal('Editar ranking', rankingFormHTML(item), async () => {
    const sid = document.getElementById('f-rk-session').value.trim();
    await api('PUT', `/api/admin/rankings/${id}`, {
      session_id:     sid || null,
      activity_label: document.getElementById('f-rk-label').value.trim() || 'Actividad',
      team_name:      document.getElementById('f-rk-team').value.trim(),
      score:          document.getElementById('f-rk-score').value.trim(),
      position:       parseInt(document.getElementById('f-rk-pos').value) || 1,
    });
    closeModal();
    loadRankingsAdmin();
  });
}

function deleteRanking(id, team) {
  confirm('Eliminar entrada', `¿Eliminar la entrada de "${team}"?`, async () => {
    await api('DELETE', `/api/admin/rankings/${id}`);
    loadRankingsAdmin();
  });
}

// Teams
async function loadTeamsAdmin() {
  const container = document.getElementById('teamsList');
  if (!container) return;
  try {
    const teams = await api('GET', '/api/admin/teams');
    if (!teams.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin equipos registrados.</p>';
      return;
    }
    container.innerHTML = `
      <table class="logs-table">
        <thead><tr><th>#</th><th>Equipo</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          ${teams.map((t, i) => `<tr>
            <td>${String(i+1).padStart(2,'0')}</td>
            <td><strong>${escHtml(t.name)}</strong></td>
            <td>${(t.created_at || '').slice(0,10)}</td>
            <td style="display:flex;gap:.4rem">
              <button class="btn-icon" onclick="editTeam(${t.id},'${escHtml(t.name)}')" title="Editar"><i data-lucide="edit-2"></i></button>
              <button class="btn-icon btn-del" onclick="deleteTeam(${t.id},'${escHtml(t.name)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
            </td>
          </tr>`).join('')}
        </tbody>
      </table>`;
    lucide.createIcons({ nodes: [container] });
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

document.getElementById('addTeamBtn')?.addEventListener('click', () => {
  openModal('Nuevo equipo', `
    <div class="field-group">
      <label>Nombre del equipo</label>
      <input type="text" id="f-team-name" placeholder="Ej: Team Destroyer">
    </div>
  `, async () => {
    const name = document.getElementById('f-team-name').value.trim();
    if (!name) return alert('Nombre requerido');
    await api('POST', '/api/admin/teams', { name });
    closeModal();
    loadTeamsAdmin();
  });
});

function editTeam(id, currentName) {
  openModal('Editar equipo', `
    <div class="field-group">
      <label>Nombre del equipo</label>
      <input type="text" id="f-team-name" value="${escHtml(currentName)}">
    </div>
  `, async () => {
    const name = document.getElementById('f-team-name').value.trim();
    if (!name) return alert('Nombre requerido');
    await api('PUT', `/api/admin/teams/${id}`, { name });
    closeModal();
    loadTeamsAdmin();
  });
}

function deleteTeam(id, name) {
  confirm('Eliminar equipo', `¿Eliminar el equipo "${name}"?`, async () => {
    await api('DELETE', `/api/admin/teams/${id}`);
    loadTeamsAdmin();
  });
}

// Global expose for inline onclick
Object.assign(window, {
  editSession, deleteSession, addProject, editProject, deleteProject,
  addAsset, editAsset, deleteAsset, deleteTutor, resetTutorPw, renameTutor, makeSuperAdmin,
  editGalleryItem, deleteGalleryItem, editRanking, deleteRanking,
  editTeam, deleteTeam, deleteFeedback,
});

// ─── Drag & drop reordering ───────────────────────────
function initDragDrop(container, endpoint) {
  if (!container) return;
  let dragging = null;

  container.addEventListener('dragstart', e => {
    const item = e.target.closest('[data-drag-id]');
    if (!item) return;
    dragging = item;
    e.dataTransfer.effectAllowed = 'move';
    setTimeout(() => item.classList.add('dragging'), 0);
  });

  container.addEventListener('dragend', () => {
    if (dragging) dragging.classList.remove('dragging');
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    // Persist new order
    const items = [...container.querySelectorAll(':scope > [data-drag-id]')].map((el, i) => ({
      id: parseInt(el.dataset.dragId), display_order: i + 1
    }));
    api('PATCH', endpoint, items).catch(() => {});
    dragging = null;
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    if (!dragging) return;
    const target = e.target.closest('[data-drag-id]');
    if (!target || target === dragging) return;
    container.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    target.classList.add('drag-over');
    const rect = target.getBoundingClientRect();
    if (e.clientY < rect.top + rect.height / 2) {
      container.insertBefore(dragging, target);
    } else {
      container.insertBefore(dragging, target.nextSibling);
    }
  });

  container.addEventListener('drop', e => { e.preventDefault(); });
}

// ─── Preview overlay (sitio o sesión) ────────────────
function openPreview(url) {
  const overlay = document.getElementById('previewOverlay');
  const frame   = document.getElementById('previewFrame');
  const tabLink = document.getElementById('previewOpenTab');
  if (!overlay) return;
  frame.src    = url;
  tabLink.href = url;
  overlay.classList.add('open');
}

function previewSession(e, sid) {
  e.stopPropagation();
  openPreview(`/sesiones/${sid}`);
}

document.getElementById('previewClose')?.addEventListener('click', () => {
  const overlay = document.getElementById('previewOverlay');
  const frame   = document.getElementById('previewFrame');
  overlay?.classList.remove('open');
  if (frame) frame.src = '';
  // reset drag position so it re-centers on next open
  if (overlay) { overlay.style.left = ''; overlay.style.top = ''; overlay.style.transform = ''; }
});

// Draggable preview panel
;(function () {
  const panel = document.getElementById('previewOverlay');
  const bar   = panel?.querySelector('.preview-bar');
  if (!panel || !bar) return;
  let dragging = false, ox = 0, oy = 0;
  bar.addEventListener('mousedown', e => {
    if (e.target.closest('button, a')) return;
    const r = panel.getBoundingClientRect();
    panel.style.transform = 'none';
    panel.style.left = r.left + 'px';
    panel.style.top  = r.top  + 'px';
    ox = e.clientX - r.left;
    oy = e.clientY - r.top;
    dragging = true;
    e.preventDefault();
  });
  document.addEventListener('mousemove', e => {
    if (!dragging) return;
    panel.style.left = (e.clientX - ox) + 'px';
    panel.style.top  = (e.clientY - oy) + 'px';
  });
  document.addEventListener('mouseup', () => { dragging = false; });
})();

// Init
document.addEventListener('DOMContentLoaded', async () => {
  lucide.createIcons();
  loadSessions();
  try {
    const me = await api('GET', '/api/admin/me');
    if (!me.is_super) {
      document.querySelector('.adm-nav-item[data-view="tutores"]')?.remove();
    }
  } catch {}
});

document.addEventListener('DOMContentLoaded', () => {
    const menuToggle = document.querySelector('.menu-toggle');
    const sidebar    = document.querySelector('.adm-sidebar');
    const backdrop   = document.querySelector('.adm-sidebar-backdrop');
    if (!menuToggle || !sidebar) return;

    const setOpen = (open) => {
        sidebar.classList.toggle('open', open);
        backdrop?.classList.toggle('open', open);
    };

    menuToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        setOpen(!sidebar.classList.contains('open'));
    });

    backdrop?.addEventListener('click', () => setOpen(false));

    // Cerrar el cajón al elegir una sección (mejor UX en móvil)
    sidebar.querySelectorAll('.adm-nav-item[data-view]').forEach(btn => {
        btn.addEventListener('click', () => setOpen(false));
    });

    // Cerrar con Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') setOpen(false);
    });
});
