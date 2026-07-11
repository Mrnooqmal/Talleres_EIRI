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

// ─── Background upload con progreso ───────────────────
// Sube archivos en background usando XHR para mostrar progreso.
// Devuelve una promesa que resuelve con la URL del archivo subido.
// `statusEl` se actualiza con el progreso en tiempo real.
function uploadFileWithProgress(file, statusEl) {
  return new Promise((resolve, reject) => {
    const fd  = new FormData();
    fd.append('file', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/admin/upload');

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && statusEl) {
        const pct = Math.round((e.loaded / e.total) * 100);
        statusEl.textContent = `📤 ${file.name}... ${pct}%`;
      }
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          const sizeKB = data.size ? `${Math.round(data.size / 1024)}KB` : '';
          if (statusEl) statusEl.textContent = `✓ ${file.name}${sizeKB ? ` (${sizeKB})` : ''}`;
          resolve(data);
        } else {
          const msg = data.error || 'Error al subir';
          if (statusEl) statusEl.textContent = `✗ ${msg}`;
          reject(new Error(msg));
        }
      } catch {
        reject(new Error('Respuesta inválida del servidor'));
      }
    };
    xhr.onerror = () => {
      if (statusEl) statusEl.textContent = `✗ Error de red`;
      reject(new Error('Error de red'));
    };
    xhr.send(fd);
  });
}

// Cola de uploads pendientes: permite que el save espere si hay subidas en curso.
// Almacena la promesa completa de backgroundUpload (que incluye asignar el valor al campo).
let _pendingBgUploads = [];

// Sube uno o más archivos en background sin bloquear la UI.
// Retorna inmediatamente. La URL se coloca en `targetEl` al completar.
function backgroundUpload(files, targetEl, statusEl, multiLine = false) {
  const job = (async () => {
    const uploads = Array.from(files).map(f =>
      uploadFileWithProgress(f, statusEl).then(data => data.url)
    );

    if (files.length > 1 && statusEl) {
      statusEl.textContent = `📤 Subiendo ${files.length} archivos...`;
    }

    const urls = await Promise.all(uploads);
    // Asignar las URLs al campo de destino ANTES de que el save handler lea el valor
    if (multiLine) {
      targetEl.value = urls.join('\n');
    } else {
      targetEl.value = urls[0] || '';
    }
    if (statusEl && files.length > 1) {
      statusEl.textContent = `✓ ${files.length} archivos subidos`;
    }
  })().catch(e => {
    if (statusEl) statusEl.textContent = `✗ ${e.message}`;
  });

  _pendingBgUploads.push(job);
  job.finally(() => { _pendingBgUploads = _pendingBgUploads.filter(x => x !== job); });
}

// Espera a que terminen todas las subidas pendientes (llamar antes de guardar).
// Cuando resuelve, los campos de URL ya tienen el valor asignado.
function waitForPendingUploads() {
  return _pendingBgUploads.length ? Promise.all(_pendingBgUploads) : Promise.resolve();
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
modalSave.addEventListener('click', async () => {
  if (!modalSaveHandler) return;
  if (_pendingBgUploads.length) {
    modalSave.textContent = 'Esperando subida...';
    modalSave.disabled = true;
    try { await waitForPendingUploads(); } catch {}
    modalSave.textContent = 'Guardar';
    modalSave.disabled = false;
  }
  modalSaveHandler();
});

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
    if (btn.dataset.view === 'bracket')  loadBracketAdmin();
    if (btn.dataset.view === 'feedback') loadFeedback();
    if (btn.dataset.view === 'club')         loadClubAdmin();
    if (btn.dataset.view === 'applications') loadApplications();
    if (btn.dataset.view === 'form')         loadFormQuestions();
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
        <img src="${escHtml(a.content)}" alt="${escHtml(a.label)}" loading="lazy">
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
    imgInput.addEventListener('change', () => {
      if (!imgInput.files.length) return;
      // Inicia subida en background sin bloquear
      backgroundUpload(imgInput.files, ta, status, imgInput.files.length > 1);
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
    container.innerHTML = items.map(it => {
      const preview = it.type === 'image'
        ? `<img src="${escHtml(it.url)}" class="gal-drag-thumb" loading="lazy" onclick="window.open('${escHtml(it.url)}','_blank')" title="Ver imagen">`
        : `<span class="gal-drag-thumb gal-drag-thumb--video"><i data-lucide="play-circle"></i></span>`;
      return `<div class="gal-drag-item" data-drag-id="${it.id}" draggable="true">
        <span class="drag-handle" title="Arrastar para reordenar"><i data-lucide="grip-vertical"></i></span>
        ${preview}
        <div class="gal-drag-info">
          <strong>${escHtml(it.title)}</strong>
          ${it.caption ? `<span class="gal-drag-caption">${escHtml(it.caption)}</span>` : ''}
        </div>
        <div class="gal-drag-actions">
          <button class="btn-icon" onclick="editGalleryItem(${it.id})" title="Editar"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" onclick="deleteGalleryItem(${it.id},'${escHtml(it.title)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
    }).join('');
    lucide.createIcons({ nodes: [container] });
    initDragDrop(container, '/api/admin/gallery/reorder');
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
      <label>URL o subir imagen <span style="color:var(--text-dim);font-weight:400">(una por línea para carga masiva)</span></label>
      <textarea id="f-gal-url" rows="2" placeholder="https://... o deja vacío y sube archivos">${escHtml(item.url || '')}</textarea>
      <div style="margin-top:0.4rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn-ghost btn--sm" id="f-gal-upload-btn"><i data-lucide="upload"></i> Subir imágenes</button>
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
  file.addEventListener('change', () => {
    if (!file.files.length) return;
    backgroundUpload(file.files, urlEl, status, file.files.length > 1);
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

// Club EIRI — textos + proyectos
const CLUB_TEXT_KEYS = ['club_tagline','club_acronym','club_intro','club_history'];

async function loadClubAdmin() {
  try {
    const cfg = await api('GET', '/api/config');
    CLUB_TEXT_KEYS.forEach(k => {
      const el = document.getElementById(`cfg-${k}`);
      if (el) el.value = cfg[k] || '';
    });
    // Cargar estado del toggle QR
    const qrChk = document.getElementById('qrToggleChk');
    if (qrChk) qrChk.checked = cfg.show_qr === '1';
  } catch {}
  loadClubBanner();
  loadClubProjects();
}

document.getElementById('saveClubTextBtn')?.addEventListener('click', () =>
  saveCfgFields(CLUB_TEXT_KEYS, 'clubTextFeedback')
);

document.getElementById('saveQrBtn')?.addEventListener('click', async () => {
  const fb  = document.getElementById('qrFeedback');
  const chk = document.getElementById('qrToggleChk');
  if (!fb || !chk) return;
  try {
    await api('PUT', '/api/admin/config', { show_qr: chk.checked ? '1' : '0' });
    fb.textContent = chk.checked ? 'QR activado ✓' : 'QR desactivado ✓';
    fb.className   = 'cfg-feedback ok';
    setTimeout(() => fb.textContent = '', 2500);
  } catch (e) {
    fb.textContent = e.message;
    fb.className   = 'cfg-feedback err';
  }
});

async function loadClubProjects() {
  const container = document.getElementById('clubProjectsList');
  if (!container) return;
  try {
    const items = await api('GET', '/api/admin/club/projects');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Aún no hay proyectos.</p>';
      return;
    }
    container.innerHTML = items.map(it => {
      const preview = it.image_url
        ? `<img src="${escHtml(it.image_url)}" class="gal-drag-thumb" loading="lazy" onclick="window.open('${escHtml(it.image_url)}','_blank')" title="Ver imagen">`
        : `<span class="gal-drag-thumb gal-drag-thumb--video"><i data-lucide="cpu"></i></span>`;
      return `<div class="gal-drag-item" data-drag-id="${it.id}" draggable="true">
        <span class="drag-handle" title="Arrastrar para reordenar"><i data-lucide="grip-vertical"></i></span>
        ${preview}
        <div class="gal-drag-info">
          <strong>${escHtml(it.title)}</strong>
          ${it.description ? `<span class="gal-drag-caption">${escHtml(it.description)}</span>` : ''}
        </div>
        <div class="gal-drag-actions">
          <button class="btn-icon" onclick="editClubProject(${it.id})" title="Editar"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" onclick="deleteClubProject(${it.id},'${escHtml(it.title)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`;
    }).join('');
    lucide.createIcons({ nodes: [container] });
    initDragDrop(container, '/api/admin/club/projects/reorder');
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function clubProjectFormHTML(item = {}) {
  return `
    <div class="field-group">
      <label>Título</label>
      <input type="text" id="f-cp-title" value="${escHtml(item.title || '')}">
    </div>
    <div class="field-group">
      <label>Descripción</label>
      <textarea id="f-cp-desc" rows="3">${escHtml(item.description || '')}</textarea>
    </div>
    <div class="field-group">
      <label>Imagen <span style="color:var(--text-dim);font-weight:400">(URL o subir archivo)</span></label>
      <input type="text" id="f-cp-image" value="${escHtml(item.image_url || '')}" placeholder="https://... o sube una imagen">
      <div style="margin-top:0.4rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn-ghost btn--sm" id="f-cp-upload-btn"><i data-lucide="upload"></i> Subir imagen</button>
        <input type="file" id="f-cp-file" accept=".png,.jpg,.jpeg,.gif,.webp" style="display:none">
        <span id="f-cp-upload-status" style="font-size:0.72rem;color:var(--text-dim)"></span>
      </div>
    </div>
    <div class="field-group">
      <label>Orden</label>
      <input type="number" id="f-cp-order" value="${item.order_index ?? 0}" style="max-width:80px">
    </div>`;
}

function bindClubUpload() {
  const btn    = document.getElementById('f-cp-upload-btn');
  const file   = document.getElementById('f-cp-file');
  const urlEl  = document.getElementById('f-cp-image');
  const status = document.getElementById('f-cp-upload-status');
  if (!btn) return;
  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (!file.files.length) return;
    backgroundUpload(file.files, urlEl, status);
  });
}

function clubProjectPayload() {
  return {
    title:       document.getElementById('f-cp-title').value.trim(),
    description: document.getElementById('f-cp-desc').value.trim(),
    image_url:   document.getElementById('f-cp-image').value.trim(),
    order_index: parseInt(document.getElementById('f-cp-order').value) || 0,
  };
}

document.getElementById('addClubProjectBtn')?.addEventListener('click', () => {
  openModal('Nuevo proyecto', clubProjectFormHTML(), async () => {
    const payload = clubProjectPayload();
    if (!payload.title) return alert('El título es requerido');
    await api('POST', '/api/admin/club/projects', payload);
    closeModal();
    loadClubProjects();
  });
  setTimeout(() => { lucide.createIcons(); bindClubUpload(); }, 50);
});

async function editClubProject(id) {
  const items = await api('GET', '/api/admin/club/projects');
  const item  = items.find(i => i.id === id);
  if (!item) return;
  openModal('Editar proyecto', clubProjectFormHTML(item), async () => {
    const payload = clubProjectPayload();
    if (!payload.title) return alert('El título es requerido');
    await api('PUT', `/api/admin/club/projects/${id}`, payload);
    closeModal();
    loadClubProjects();
  });
  setTimeout(() => { lucide.createIcons(); bindClubUpload(); }, 50);
}

function deleteClubProject(id, title) {
  confirm('Eliminar proyecto', `¿Eliminar "${title}"?`, async () => {
    await api('DELETE', `/api/admin/club/projects/${id}`);
    loadClubProjects();
  });
}

// Club EIRI — banner (carrusel del hero)
async function loadClubBanner() {
  const container = document.getElementById('clubBannerList');
  if (!container) return;
  try {
    const items = await api('GET', '/api/admin/club/banner');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin fotos. Si el banner está vacío, el hero muestra el LED de bienvenida.</p>';
      return;
    }
    container.innerHTML = items.map(it => `
      <div class="gal-drag-item" data-drag-id="${it.id}" draggable="true">
        <span class="drag-handle" title="Arrastrar para reordenar"><i data-lucide="grip-vertical"></i></span>
        <img src="${escHtml(it.image_url)}" class="gal-drag-thumb" loading="lazy" onclick="window.open('${escHtml(it.image_url)}','_blank')" title="Ver imagen">
        <div class="gal-drag-info"><strong>${escHtml(it.caption) || 'Sin descripción'}</strong></div>
        <div class="gal-drag-actions">
          <button class="btn-icon" onclick="editClubBanner(${it.id})" title="Editar"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" onclick="deleteClubBanner(${it.id})" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('');
    lucide.createIcons({ nodes: [container] });
    initDragDrop(container, '/api/admin/club/banner/reorder');
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function clubBannerFormHTML(item = {}) {
  return `
    <div class="field-group">
      <label>Imagen <span style="color:var(--text-dim);font-weight:400">(URL o subir archivo)</span></label>
      <input type="text" id="f-cb-image" value="${escHtml(item.image_url || '')}" placeholder="https://... o sube una imagen">
      <div style="margin-top:0.4rem;display:flex;gap:0.5rem;align-items:center;flex-wrap:wrap">
        <button type="button" class="btn-ghost btn--sm" id="f-cb-upload-btn"><i data-lucide="upload"></i> Subir imagen</button>
        <input type="file" id="f-cb-file" accept=".png,.jpg,.jpeg,.gif,.webp" style="display:none">
        <span id="f-cb-upload-status" style="font-size:0.72rem;color:var(--text-dim)"></span>
      </div>
    </div>
    <div class="field-group">
      <label>Descripción / alt <span style="color:var(--text-dim);font-weight:400">(opcional)</span></label>
      <input type="text" id="f-cb-caption" value="${escHtml(item.caption || '')}">
    </div>
    <div class="field-group">
      <label>Orden</label>
      <input type="number" id="f-cb-order" value="${item.order_index ?? 0}" style="max-width:80px">
    </div>`;
}

function bindClubBannerUpload() {
  const btn    = document.getElementById('f-cb-upload-btn');
  const file   = document.getElementById('f-cb-file');
  const urlEl  = document.getElementById('f-cb-image');
  const status = document.getElementById('f-cb-upload-status');
  if (!btn) return;
  btn.addEventListener('click', () => file.click());
  file.addEventListener('change', () => {
    if (!file.files.length) return;
    backgroundUpload(file.files, urlEl, status);
  });
}

function clubBannerPayload() {
  return {
    image_url:   document.getElementById('f-cb-image').value.trim(),
    caption:     document.getElementById('f-cb-caption').value.trim(),
    order_index: parseInt(document.getElementById('f-cb-order').value) || 0,
  };
}

document.getElementById('addClubBannerBtn')?.addEventListener('click', () => {
  openModal('Nueva foto del banner', clubBannerFormHTML(), async () => {
    const payload = clubBannerPayload();
    if (!payload.image_url) return alert('La imagen es requerida');
    await api('POST', '/api/admin/club/banner', payload);
    closeModal();
    loadClubBanner();
  });
  setTimeout(() => { lucide.createIcons(); bindClubBannerUpload(); }, 50);
});

async function editClubBanner(id) {
  const items = await api('GET', '/api/admin/club/banner');
  const item  = items.find(i => i.id === id);
  if (!item) return;
  openModal('Editar foto del banner', clubBannerFormHTML(item), async () => {
    const payload = clubBannerPayload();
    if (!payload.image_url) return alert('La imagen es requerida');
    await api('PUT', `/api/admin/club/banner/${id}`, payload);
    closeModal();
    loadClubBanner();
  });
  setTimeout(() => { lucide.createIcons(); bindClubBannerUpload(); }, 50);
}

function deleteClubBanner(id) {
  confirm('Eliminar foto', '¿Eliminar esta foto del banner?', async () => {
    await api('DELETE', `/api/admin/club/banner/${id}`);
    loadClubBanner();
  });
}

// Postulaciones al club — vista tabla/lista + exportar
let APPLICATIONS = [];
let appsViewMode = 'table';

async function loadApplications() {
  const container = document.getElementById('applicationsList');
  if (!container) return;
  container.innerHTML = '<p style="color:var(--text-dim);font-size:.85rem">Cargando...</p>';
  try {
    APPLICATIONS = await api('GET', '/api/admin/club/applications');
    renderApplications();
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function renderApplications() {
  const container = document.getElementById('applicationsList');
  if (!container) return;
  if (!APPLICATIONS.length) {
    container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Aún no hay postulaciones.</p>';
    return;
  }
  container.innerHTML = appsViewMode === 'list' ? appsListHTML(APPLICATIONS) : appsTableHTML(APPLICATIONS);
  lucide.createIcons({ nodes: [container] });
}

// Normaliza cada postulación a {id, created_at, ans:[{label,value,type}]}.
// Usa el snapshot `answers`; si no existe (datos viejos), reconstruye desde las columnas legacy.
function appsRows(items) {
  return items.map(a => {
    let ans = null;
    try { ans = a.answers ? JSON.parse(a.answers) : null; } catch { ans = null; }
    if (!ans || !ans.length) {
      ans = [
        { label: 'Nombre', value: a.name, type: 'short_text' },
        { label: 'Correo', value: a.email, type: 'email' },
        { label: 'Carrera', value: a.career, type: 'dropdown' },
        { label: 'Generación de ingreso', value: a.generation, type: 'dropdown' },
        { label: '¿Por qué quieres unirte?', value: a.message, type: 'paragraph' },
      ].filter(x => x.value);
    }
    return { id: a.id, created_at: a.created_at, ans };
  });
}

function appsLabels(rows) {
  const seen = [];
  rows.forEach(r => r.ans.forEach(x => { if (!seen.includes(x.label)) seen.push(x.label); }));
  return seen;
}

function appsCell(x) {
  if (!x || !x.value) return '<span class="apps-empty">—</span>';
  const v = escHtml(x.value);
  if (x.type === 'email' || /^[^@\s]+@[^@\s]+$/.test(x.value)) return `<a href="mailto:${v}">${v}</a>`;
  return v;
}

function appsTableHTML(items) {
  const rows = appsRows(items);
  const labels = appsLabels(rows);
  return `<div class="apps-table-wrap"><table class="apps-table">
    <thead><tr><th>Fecha</th>${labels.map(l => `<th>${escHtml(l)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${rows.map(r => {
      const map = {}; r.ans.forEach(x => { map[x.label] = x; });
      return `<tr>
        <td class="apps-date">${fmtFechaCL(r.created_at)}</td>
        ${labels.map(l => `<td class="apps-msg" title="${escHtml((map[l] || {}).value || '')}">${appsCell(map[l])}</td>`).join('')}
        <td><button class="btn-icon btn-del" onclick="deleteApplication(${r.id})" title="Eliminar"><i data-lucide="trash-2"></i></button></td>
      </tr>`;
    }).join('')}</tbody>
  </table></div>`;
}

function appsListHTML(items) {
  return appsRows(items).map(r => `
    <div class="feedback-card">
      <div class="feedback-card-head">
        <span class="feedback-card-name">${escHtml((r.ans[0] || {}).value || 'Postulación')}</span>
        <span class="feedback-card-date">${fmtFechaCL(r.created_at)}</span>
        <button class="btn-icon btn-del" onclick="deleteApplication(${r.id})" title="Eliminar"><i data-lucide="trash-2"></i></button>
      </div>
      ${r.ans.map(x => `<p class="feedback-card-msg"><span class="apps-k">${escHtml(x.label)}:</span> ${appsCell(x)}</p>`).join('')}
    </div>`).join('');
}

document.getElementById('appsViewToggle')?.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-mode]');
  if (!btn) return;
  appsViewMode = btn.dataset.mode;
  document.querySelectorAll('#appsViewToggle button').forEach(b => b.classList.toggle('active', b === btn));
  renderApplications();
});

function exportApplications() {
  if (!APPLICATIONS.length) return alert('No hay postulaciones para exportar.');
  const rows = appsRows(APPLICATIONS);
  const labels = appsLabels(rows);
  const header = ['Fecha', ...labels];
  const data = rows.map(r => {
    const map = {}; r.ans.forEach(x => { map[x.label] = x.value; });
    return [fmtFechaCL(r.created_at), ...labels.map(l => map[l] || '')];
  });

  const filename = `postulaciones-eiri-${new Date().toISOString().slice(0, 10)}`;

  // Exportar como Excel (.xlsx) si SheetJS está disponible
  if (typeof XLSX !== 'undefined') {
    const ws = XLSX.utils.aoa_to_sheet([header, ...data]);
    // Auto-ajustar ancho de columnas
    ws['!cols'] = header.map((h, i) => {
      const maxLen = Math.max(h.length, ...data.map(r => String(r[i] || '').length));
      return { wch: Math.min(Math.max(maxLen + 2, 12), 50) };
    });
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Postulaciones');
    XLSX.writeFile(wb, `${filename}.xlsx`);
  } else {
    // Fallback a CSV si SheetJS no cargó
    const esc  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const csv  = '\uFEFF' + [header, ...data].map(r => r.map(esc).join(';')).join('\r\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

document.getElementById('exportApplicationsBtn')?.addEventListener('click', exportApplications);

function deleteApplication(id) {
  confirm('Eliminar postulación', '¿Eliminar esta postulación? Esta acción no se puede deshacer.', async () => {
    await api('DELETE', `/api/admin/club/applications/${id}`);
    loadApplications();
  });
}

document.getElementById('refreshApplicationsBtn')?.addEventListener('click', loadApplications)

// ─── Constructor del formulario ───
const Q_TYPES = { short_text: 'Texto corto', paragraph: 'Párrafo', email: 'Correo', dropdown: 'Desplegable', checkboxes: 'Casillas' };

async function loadFormQuestions() {
  const container = document.getElementById('questionsList');
  if (!container) return;
  try {
    const items = await api('GET', '/api/admin/form/questions');
    if (!items.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin preguntas todavía. Agrega la primera.</p>';
      return;
    }
    container.innerHTML = items.map(q => `
      <div class="gal-drag-item ${q.enabled ? '' : 'q-disabled'}" data-drag-id="${q.id}" draggable="true">
        <span class="drag-handle" title="Reordenar"><i data-lucide="grip-vertical"></i></span>
        <div class="gal-drag-info">
          <strong>${escHtml(q.label)}${q.required ? ' <span class="q-req">*</span>' : ''}</strong>
          <span class="gal-drag-caption">${Q_TYPES[q.type] || q.type}${q.type === 'dropdown' && q.allow_other ? ' · con "Otro"' : ''}${q.enabled ? '' : ' · oculta'}</span>
        </div>
        <div class="gal-drag-actions">
          <button class="btn-icon" onclick="editQuestion(${q.id})" title="Editar"><i data-lucide="edit-2"></i></button>
          <button class="btn-icon btn-del" onclick="deleteQuestion(${q.id},'${escHtml(q.label)}')" title="Eliminar"><i data-lucide="trash-2"></i></button>
        </div>
      </div>`).join('');
    lucide.createIcons({ nodes: [container] });
    initDragDrop(container, '/api/admin/form/questions/reorder');
  } catch (e) {
    container.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function questionFormHTML(q = {}) {
  const t = q.type || 'short_text';
  return `
    <div class="field-group">
      <label>Pregunta</label>
      <input type="text" id="f-q-label" value="${escHtml(q.label || '')}" placeholder="Ej. ¿Qué te gustaría aprender?">
    </div>
    <div class="field-group">
      <label>Tipo de respuesta</label>
      <select id="f-q-type">${Object.entries(Q_TYPES).map(([v, l]) => `<option value="${v}" ${t === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    </div>
    <div class="field-group" id="f-q-options-wrap" ${(t === 'dropdown' || t === 'checkboxes') ? '' : 'hidden'}>
      <label>Opciones <span style="color:var(--text-dim);font-weight:400">(una por línea)</span></label>
      <textarea id="f-q-options" rows="5" placeholder="Opción 1&#10;Opción 2">${escHtml(q.options || '')}</textarea>
    </div>
    <div style="display:flex;gap:1.4rem;flex-wrap:wrap;margin-top:0.3rem">
      <label class="q-check"><input type="checkbox" id="f-q-required" ${q.required ? 'checked' : ''}><span>Obligatoria</span></label>
      <label class="q-check" id="f-q-other-wrap" style="${t === 'dropdown' ? '' : 'display:none'}"><input type="checkbox" id="f-q-other" ${q.allow_other ? 'checked' : ''}><span>Permitir "Otro"</span></label>
      <label class="q-check"><input type="checkbox" id="f-q-enabled" ${q.enabled === 0 ? '' : 'checked'}><span>Visible</span></label>
    </div>`;
}

function bindQuestionForm() {
  const typeSel = document.getElementById('f-q-type');
  if (!typeSel) return;
  typeSel.addEventListener('change', () => {
    const t = typeSel.value;
    document.getElementById('f-q-options-wrap').hidden = !(t === 'dropdown' || t === 'checkboxes');
    document.getElementById('f-q-other-wrap').style.display = t === 'dropdown' ? '' : 'none';
  });
}

function questionPayload() {
  return {
    label:       document.getElementById('f-q-label').value.trim(),
    type:        document.getElementById('f-q-type').value,
    options:     document.getElementById('f-q-options').value.trim(),
    required:    document.getElementById('f-q-required').checked ? 1 : 0,
    allow_other: document.getElementById('f-q-other').checked ? 1 : 0,
    enabled:     document.getElementById('f-q-enabled').checked ? 1 : 0,
  };
}

document.getElementById('addQuestionBtn')?.addEventListener('click', () => {
  openModal('Nueva pregunta', questionFormHTML(), async () => {
    const payload = questionPayload();
    if (!payload.label) return alert('Escribe la pregunta');
    await api('POST', '/api/admin/form/questions', payload);
    closeModal();
    loadFormQuestions();
  });
  setTimeout(() => { lucide.createIcons(); bindQuestionForm(); }, 50);
});

async function editQuestion(id) {
  const items = await api('GET', '/api/admin/form/questions');
  const q = items.find(i => i.id === id);
  if (!q) return;
  openModal('Editar pregunta', questionFormHTML(q), async () => {
    const payload = questionPayload();
    if (!payload.label) return alert('Escribe la pregunta');
    await api('PUT', `/api/admin/form/questions/${id}`, payload);
    closeModal();
    loadFormQuestions();
  });
  setTimeout(() => { lucide.createIcons(); bindQuestionForm(); }, 50);
}

function deleteQuestion(id, label) {
  confirm('Eliminar pregunta', `¿Eliminar "${label}"? Las postulaciones ya recibidas se conservan.`, async () => {
    await api('DELETE', `/api/admin/form/questions/${id}`);
    loadFormQuestions();
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
let teamsCache = [];

async function loadTeamsAdmin() {
  const container = document.getElementById('teamsList');
  if (!container) return;
  try {
    const teams = await api('GET', '/api/admin/teams');
    teamsCache = teams;
    if (!teams.length) {
      container.innerHTML = '<p style="color:var(--text-dim);padding:1rem 0">Sin equipos registrados.</p>';
      return;
    }
    container.innerHTML = `
      <table class="logs-table">
        <thead><tr><th></th><th>Equipo</th><th>Creado</th><th></th></tr></thead>
        <tbody>
          ${teams.map((t) => `<tr>
            <td>${t.logo
              ? `<img src="${escHtml(t.logo)}" alt="" class="team-logo-thumb">`
              : `<span class="team-logo-thumb team-logo-thumb--ph">${escHtml((t.name[0]||'?').toUpperCase())}</span>`}</td>
            <td><strong>${escHtml(t.name)}</strong></td>
            <td>${(t.created_at || '').slice(0,10)}</td>
            <td style="display:flex;gap:.4rem">
              <button class="btn-icon" onclick="editTeam(${t.id})" title="Editar"><i data-lucide="edit-2"></i></button>
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

// Campos compartidos del formulario de equipo (nombre + logo con upload/preview)
function teamFormHTML(team = {}) {
  return `
    <div class="field-group">
      <label>Nombre del equipo</label>
      <input type="text" id="f-team-name" value="${escHtml(team.name || '')}" placeholder="Ej: Team Destroyer">
    </div>
    <div class="field-group">
      <label>Logo del equipo</label>
      <div class="team-logo-edit">
        <div class="team-logo-preview" id="f-team-logo-prev">
          ${team.logo
            ? `<img src="${escHtml(team.logo)}" alt="">`
            : `<span><i data-lucide="image"></i></span>`}
        </div>
        <div class="team-logo-actions">
          <input type="text" id="f-team-logo" value="${escHtml(team.logo || '')}" placeholder="URL del logo o sube un archivo">
          <button type="button" class="btn-ghost btn--sm" id="f-team-logo-btn"><i data-lucide="upload"></i> Subir logo</button>
          <input type="file" id="f-team-logo-file" accept=".png,.jpg,.jpeg,.gif,.webp,.svg" style="display:none">
          <span id="f-team-logo-status" style="font-size:.72rem;color:var(--text-dim)"></span>
        </div>
      </div>
    </div>
    <div class="field-group">
      <label>Canción / tema (suena en la arena)</label>
      <div class="team-logo-actions">
        <input type="text" id="f-team-anthem" value="${escHtml(team.anthem || '')}" placeholder="URL del MP3 o sube un archivo">
        <button type="button" class="btn-ghost btn--sm" id="f-team-anthem-btn"><i data-lucide="music"></i> Subir canción</button>
        <input type="file" id="f-team-anthem-file" accept=".mp3,.m4a,.ogg,.wav" style="display:none">
        <span id="f-team-anthem-status" style="font-size:.72rem;color:var(--text-dim)"></span>
      </div>
    </div>
  `;
}

function bindTeamLogoUpload() {
  const input  = document.getElementById('f-team-logo');
  const prev   = document.getElementById('f-team-logo-prev');
  const btn    = document.getElementById('f-team-logo-btn');
  const file   = document.getElementById('f-team-logo-file');
  const status = document.getElementById('f-team-logo-status');
  if (!input) return;
  const refresh = () => {
    prev.innerHTML = input.value.trim()
      ? `<img src="${escHtml(input.value.trim())}" alt="">`
      : `<span><i data-lucide="image"></i></span>`;
    lucide.createIcons({ nodes: [prev] });
  };
  input.addEventListener('input', refresh);
  btn?.addEventListener('click', () => file.click());
  file?.addEventListener('change', async () => {
    if (!file.files.length) return;
    status.textContent = 'Subiendo...';
    try {
      const fd = new FormData();
      fd.append('file', file.files[0]);
      const res  = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 100)); }
      if (!res.ok) throw new Error(data.error || 'Error en la subida');
      input.value = data.url;
      refresh();
      status.textContent = 'Listo ✓';
    } catch (e) {
      status.textContent = 'Error: ' + e.message;
    }
  });
}

function bindTeamAnthemUpload() {
  const input  = document.getElementById('f-team-anthem');
  const btn    = document.getElementById('f-team-anthem-btn');
  const file   = document.getElementById('f-team-anthem-file');
  const status = document.getElementById('f-team-anthem-status');
  if (!input) return;
  btn?.addEventListener('click', () => file.click());
  file?.addEventListener('change', async () => {
    if (!file.files.length) return;
    const f = file.files[0];
    status.textContent = 'Procesando audio...';
    try {
      // ── Recortar y comprimir: 15s mono 22kHz WAV (~660KB) ──
      const MAX_SECS = 15;
      const OUT_RATE = 22050;
      const arrayBuf = await f.arrayBuffer();
      const actx = new (window.AudioContext || window.webkitAudioContext)();
      const decoded = await actx.decodeAudioData(arrayBuf);
      const duration = Math.min(decoded.duration, MAX_SECS);
      const frames = Math.floor(duration * OUT_RATE);

      // Render offline a mono + tasa baja
      const offline = new OfflineAudioContext(1, frames, OUT_RATE);
      const src = offline.createBufferSource();
      src.buffer = decoded;
      src.connect(offline.destination);
      src.start(0, 0, duration);
      const rendered = await offline.startRendering();
      const samples = rendered.getChannelData(0);

      // Codificar WAV
      const wavBuf = encodeWAV(samples, OUT_RATE);
      const wavBlob = new Blob([wavBuf], { type: 'audio/wav' });
      const wavName = f.name.replace(/\.[^.]+$/, '') + '_clip.wav';

      actx.close();

      // Subir el WAV recortado (~660KB, bien dentro del limite de 4.5MB)
      status.textContent = `Subiendo (${Math.round(wavBlob.size / 1024)}KB)...`;
      const fd = new FormData();
      fd.append('file', wavBlob, wavName);
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); } catch { throw new Error(text.slice(0, 120)); }
      if (!res.ok) throw new Error(data.error || 'Error en la subida');
      input.value = data.url;
      status.textContent = `Listo ✓ (${Math.round(duration)}s, ${Math.round(wavBlob.size / 1024)}KB)`;
    } catch (e) {
      console.error('Anthem upload error:', e);
      status.textContent = 'Error: ' + e.message;
    }
  });
}

// Codifica PCM float32 a WAV 16-bit
function encodeWAV(samples, sampleRate) {
  const numCh = 1, bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const dataLen = samples.length * bytesPerSample;
  const buf = new ArrayBuffer(44 + dataLen);
  const view = new DataView(buf);
  const writeStr = (off, str) => { for (let i = 0; i < str.length; i++) view.setUint8(off + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataLen, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numCh, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numCh * bytesPerSample, true);
  view.setUint16(32, numCh * bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataLen, true);
  let off = 44;
  for (let i = 0; i < samples.length; i++, off += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(off, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buf;
}

document.getElementById('addTeamBtn')?.addEventListener('click', () => {
  openModal('Nuevo equipo', teamFormHTML(), async () => {
    const name = document.getElementById('f-team-name').value.trim();
    const logo = document.getElementById('f-team-logo').value.trim();
    const anthem = document.getElementById('f-team-anthem').value.trim();
    if (!name) return alert('Nombre requerido');
    await api('POST', '/api/admin/teams', { name, logo, anthem });
    closeModal();
    loadTeamsAdmin();
  });
  bindTeamLogoUpload();
  bindTeamAnthemUpload();
});

function editTeam(id) {
  const team = teamsCache.find(t => t.id === id) || {};
  openModal('Editar equipo', teamFormHTML(team), async () => {
    const name = document.getElementById('f-team-name').value.trim();
    const logo = document.getElementById('f-team-logo').value.trim();
    const anthem = document.getElementById('f-team-anthem').value.trim();
    if (!name) return alert('Nombre requerido');
    await api('PUT', `/api/admin/teams/${id}`, { name, logo, anthem });
    closeModal();
    loadTeamsAdmin();
  });
  bindTeamLogoUpload();
  bindTeamAnthemUpload();
}

function deleteTeam(id, name) {
  confirm('Eliminar equipo', `¿Eliminar el equipo "${name}"?`, async () => {
    await api('DELETE', `/api/admin/teams/${id}`);
    loadTeamsAdmin();
  });
}

// ─── Bracket admin ────────────────────────────────────
let bkState = { size: 8, rounds: [], title: '', subtitle: '' };
let bkTeams = [];
let bkDirty = false;

function bkEmptyRounds(size) {
  const rounds = [];
  let matches = size / 2;
  while (matches >= 1) {
    rounds.push(Array.from({ length: matches }, () => ({ a: null, b: null, scoreA: '', scoreB: '', winner: null })));
    matches = Math.floor(matches / 2);
  }
  return rounds;
}

// Propaga ganadores (espejo de resolveBracket del servidor)
function bkResolve() {
  const r = bkState.rounds;
  for (let i = 0; i < r.length - 1; i++) {
    for (let j = 0; j < r[i].length; j++) {
      const m = r[i][j];
      const w = m.winner === 'a' ? m.a : m.winner === 'b' ? m.b : null;
      // Si el ganador ya no es válido (equipo removido), lo limpiamos
      if (m.winner === 'a' && m.a == null) m.winner = null;
      if (m.winner === 'b' && m.b == null) m.winner = null;
      const next = r[i + 1][Math.floor(j / 2)];
      if (!next) continue;
      if (j % 2 === 0) next.a = (m.winner ? w : null);
      else             next.b = (m.winner ? w : null);
    }
  }
  // Limpieza de ganadores en rondas avanzadas cuyos equipos quedaron nulos
  for (const round of r) for (const m of round) {
    if (m.winner === 'a' && m.a == null) m.winner = null;
    if (m.winner === 'b' && m.b == null) m.winner = null;
  }
}

const ROUND_NAMES = n => n === 1 ? 'Final' : n === 2 ? 'Semifinales' : n === 3 ? 'Cuartos' : n === 4 ? 'Octavos' : 'Ronda';

async function loadBracketAdmin() {
  const board = document.getElementById('bkAdminBoard');
  if (!board) return;
  try {
    const data = await api('GET', '/api/bracket');
    bkTeams = data.teams || [];
    bkState = {
      size: data.size || 8,
      rounds: Array.isArray(data.rounds) && data.rounds.length ? data.rounds : bkEmptyRounds(data.size || 8),
      third: data.third || null,
      title: data.title || '',
      subtitle: data.subtitle || '',
    };
    bkDirty = false;
    document.getElementById('bk-title').value    = bkState.title;
    document.getElementById('bk-subtitle').value = bkState.subtitle;
    bkSyncSizeToggle();
    renderBracketAdmin();
  } catch (e) {
    board.innerHTML = `<p style="color:#ef4444">${e.message}</p>`;
  }
}

function bkSyncSizeToggle() {
  document.querySelectorAll('#bkSizeToggle button').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.size) === bkState.size);
  });
}

function bkTeamById(id) { return bkTeams.find(t => t.id === id); }

function bkPlacedIds() {
  const ids = new Set();
  (bkState.rounds[0] || []).forEach(m => { if (m.a != null) ids.add(m.a); if (m.b != null) ids.add(m.b); });
  return ids;
}

function renderBracketPool() {
  const pool  = document.getElementById('bkPool');
  const empty = document.getElementById('bkPoolEmpty');
  if (!pool) return;
  if (!bkTeams.length) { pool.innerHTML = ''; empty.hidden = false; return; }
  empty.hidden = true;
  const placed = bkPlacedIds();
  pool.innerHTML = bkTeams.map(t => `
    <div class="bk-pool-team ${placed.has(t.id) ? 'is-placed' : ''}" draggable="true" data-team="${t.id}">
      ${t.logo ? `<img src="${escHtml(t.logo)}" alt="">` : `<span class="bk-pool-ph">${escHtml((t.name[0]||'?').toUpperCase())}</span>`}
      <span class="bk-pool-name">${escHtml(t.name)}</span>
    </div>`).join('');
  lucide.createIcons({ nodes: [pool] });
}

// Fila de equipo editable (logo · nombre · marcador · quitar). Clic = ganador.
function bkRowHTML(teamId, r, m, side, editable) {
  const t = teamId != null ? bkTeamById(teamId) : null;
  const match = bkState.rounds[r][m];
  const isWin = match.winner === side;
  const cls = ['bk-ed-row'];
  if (editable) cls.push('bk-ed-row--drop');
  if (isWin) cls.push('bk-ed-row--win');
  if (!t) cls.push('bk-ed-row--tbd');
  const score = side === 'a' ? match.scoreA : match.scoreB;
  return `<div class="${cls.join(' ')}" data-r="${r}" data-m="${m}" data-side="${side}">
    ${t ? (t.logo ? `<img src="${escHtml(t.logo)}" alt="" class="bk-ed-logo">` : `<span class="bk-ed-logo bk-ed-logo--ph">${escHtml((t.name[0]||'?').toUpperCase())}</span>`) : ''}
    <span class="bk-ed-name">${t ? escHtml(t.name) : 'Por definir'}</span>
    <input type="text" class="bk-ed-score" data-r="${r}" data-m="${m}" data-side="${side}" value="${escHtml(score || '')}" maxlength="4" placeholder="–">
    ${editable && t ? `<button class="bk-ed-clear" data-r="${r}" data-m="${m}" data-side="${side}" title="Quitar">&times;</button>` : ''}
  </div>`;
}

function bkMatchCardEd(m, r, mi) {
  const editable = r === 0;
  return `<div class="bk-ed-match"><div class="bk-ed-card">
    ${bkRowHTML(m.a, r, mi, 'a', editable)}
    ${bkRowHTML(m.b, r, mi, 'b', editable)}
  </div></div>`;
}

// Editor con la misma forma que el sitio: lados convergentes hacia la final central.
function renderBracketAdmin() {
  bkResolve();
  const board = document.getElementById('bkAdminBoard');
  renderBracketPool();
  const rounds = bkState.rounds;
  const nFull = rounds.length;
  const sideRounds = nFull - 1;

  const buildSide = (side) => {
    const order = side === 'left'
      ? [...Array(sideRounds).keys()]
      : [...Array(sideRounds).keys()].reverse();
    let h = `<div class="bk-ed-side bk-ed-side--${side}">`;
    order.forEach(r => {
      const matches = rounds[r];
      const half = matches.length / 2;
      const offset = side === 'left' ? 0 : half;
      const slice = side === 'left' ? matches.slice(0, half) : matches.slice(half);
      h += `<div class="bk-ed-round"><div class="bk-ed-round-title">${ROUND_NAMES(nFull - r)}</div><div class="bk-ed-matches">`;
      slice.forEach((m, k) => { h += bkMatchCardEd(m, r, offset + k); });
      h += `</div></div>`;
    });
    return h + '</div>';
  };

  const fin = rounds[nFull - 1][0];
  const champId = fin ? (fin.winner === 'a' ? fin.a : fin.winner === 'b' ? fin.b : null) : null;
  const champ = champId != null ? bkTeamById(champId) : null;
  const center = `<div class="bk-ed-center">
    <div class="bk-ed-round-title bk-ed-round-title--gold">${ROUND_NAMES(1)}</div>
    ${bkMatchCardEd(fin, nFull - 1, 0)}
    <div class="bk-ed-champ ${champ ? 'is-crowned' : ''}">
      <i data-lucide="crown"></i>
      <span>${champ ? escHtml(champ.name) : 'Por coronar'}</span>
    </div>
  </div>`;

  board.innerHTML = `<div class="bk-ed-arena">${buildSide('left')}${center}${buildSide('right')}</div>`;
  lucide.createIcons({ nodes: [board] });
  bkBindBoardEvents();
}

function bkMarkDirty() {
  bkDirty = true;
  const fb = document.getElementById('bracketFeedback');
  if (fb) { fb.textContent = 'Cambios sin guardar'; fb.className = 'cfg-feedback warn'; }
}

function bkBindBoardEvents() {
  const board = document.getElementById('bkAdminBoard');
  // Drag&drop de equipos del pool a slots de la primera ronda
  document.querySelectorAll('.bk-pool-team').forEach(el => {
    el.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', el.dataset.team);
      e.dataTransfer.effectAllowed = 'move';
    });
  });
  board.querySelectorAll('.bk-ed-row--drop').forEach(slot => {
    slot.addEventListener('dragover', e => { e.preventDefault(); slot.classList.add('bk-drag-over'); });
    slot.addEventListener('dragleave', () => slot.classList.remove('bk-drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault();
      slot.classList.remove('bk-drag-over');
      const id = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!Number.isFinite(id)) return;
      const r = +slot.dataset.r, m = +slot.dataset.m, side = slot.dataset.side;
      // Quitar el equipo de cualquier otra fila de la primera ronda (sin duplicados)
      bkState.rounds[0].forEach(mt => { if (mt.a === id) mt.a = null; if (mt.b === id) mt.b = null; });
      bkState.rounds[r][m][side] = id;
      bkMarkDirty();
      renderBracketAdmin();
    });
  });
  // Quitar equipo de una fila
  board.querySelectorAll('.bk-ed-clear').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const r = +btn.dataset.r, m = +btn.dataset.m, side = btn.dataset.side;
      bkState.rounds[r][m][side] = null;
      if (bkState.rounds[r][m].winner === side) bkState.rounds[r][m].winner = null;
      bkMarkDirty();
      renderBracketAdmin();
    });
  });
  // Click en fila = marcar ganador (si hay equipo)
  board.querySelectorAll('.bk-ed-row').forEach(slot => {
    slot.addEventListener('click', () => {
      const r = +slot.dataset.r, m = +slot.dataset.m, side = slot.dataset.side;
      const match = bkState.rounds[r][m];
      const teamId = side === 'a' ? match.a : match.b;
      if (teamId == null) return;
      match.winner = match.winner === side ? null : side;
      bkMarkDirty();
      renderBracketAdmin();
    });
  });
  // Inputs de marcador
  board.querySelectorAll('.bk-ed-score').forEach(inp => {
    inp.addEventListener('input', () => {
      const r = +inp.dataset.r, m = +inp.dataset.m, side = inp.dataset.side;
      bkState.rounds[r][m][side === 'a' ? 'scoreA' : 'scoreB'] = inp.value;
      bkDirty = true;
    });
    inp.addEventListener('click', e => e.stopPropagation());
  });
}

// Toggle de tamaño
document.getElementById('bkSizeToggle')?.addEventListener('click', e => {
  const btn = e.target.closest('button[data-size]');
  if (!btn) return;
  const size = Number(btn.dataset.size);
  if (size === bkState.size) return;
  confirm('Cambiar tamaño', `¿Cambiar a ${size} equipos? Se reiniciarán las posiciones actuales.`, () => {
    bkState.size = size;
    bkState.rounds = bkEmptyRounds(size);
    bkSyncSizeToggle();
    bkMarkDirty();
    renderBracketAdmin();
  });
});

document.getElementById('saveBracketBtn')?.addEventListener('click', async () => {
  const fb = document.getElementById('bracketFeedback');
  try {
    await api('PUT', '/api/admin/bracket', {
      size: bkState.size,
      rounds: bkState.rounds,
      third: bkState.third,
      title: document.getElementById('bk-title').value.trim(),
      subtitle: document.getElementById('bk-subtitle').value.trim(),
    });
    bkDirty = false;
    if (fb) { fb.textContent = 'Llave guardada'; fb.className = 'cfg-feedback ok'; }
  } catch (e) {
    if (fb) { fb.textContent = 'Error: ' + e.message; fb.className = 'cfg-feedback err'; }
  }
});

// Guarda el bracket actual de bkState de inmediato (lo usan los resets del torneo)
async function bkSaveNow(okMsg) {
  const fb = document.getElementById('bracketFeedback');
  try {
    await api('PUT', '/api/admin/bracket', { size: bkState.size, rounds: bkState.rounds, third: bkState.third });
    bkDirty = false;
    if (fb) { fb.textContent = okMsg; fb.className = 'cfg-feedback ok'; }
  } catch (e) {
    if (fb) { fb.textContent = 'Error: ' + e.message; fb.className = 'cfg-feedback err'; }
  }
}

// Reiniciar resultados: borra marcadores/ganadores de todas las rondas y del 3er
// lugar, pero mantiene los equipos colocados en la primera ronda.
document.getElementById('resetResultsBtn')?.addEventListener('click', () => {
  confirm('Reiniciar resultados', '¿Borrar todos los marcadores y ganadores del torneo? Los equipos colocados en la primera ronda se mantienen.', async () => {
    const firstRound = (bkState.rounds[0] || []).map(m => ({ a: m.a, b: m.b, scoreA: '', scoreB: '', winner: null }));
    bkState.rounds = bkEmptyRounds(bkState.size);
    bkState.rounds[0] = firstRound;
    bkState.third = null;
    await bkSaveNow('Resultados reiniciados — el torneo queda listo para jugarse de nuevo');
    renderBracketAdmin();
  });
});

// Vaciar llave: quita también los equipos colocados (llave en blanco)
document.getElementById('clearBracketBtn')?.addEventListener('click', () => {
  confirm('Vaciar llave', '¿Vaciar la llave por completo? Se quitan los equipos colocados y todos los resultados.', async () => {
    bkState.rounds = bkEmptyRounds(bkState.size);
    bkState.third = null;
    await bkSaveNow('Llave vaciada');
    renderBracketAdmin();
  });
});

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
