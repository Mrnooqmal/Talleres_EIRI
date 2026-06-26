function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function cssUrl(u) { return String(u).replace(/'/g, '%27').replace(/"/g, '%22'); }

function initNavbar() {
  const header = document.getElementById('siteHeader');
  const burger = document.getElementById('navBurger');
  const mobile = document.getElementById('navMobile');
  if (!header) return;
  window.addEventListener('scroll', () => header.classList.toggle('scrolled', window.scrollY > 40));
  burger?.addEventListener('click', () => {
    const open = mobile.classList.toggle('open');
    burger.classList.toggle('open', open);
  });
  mobile?.querySelectorAll('.nav-m-link').forEach(l => {
    l.addEventListener('click', () => { mobile.classList.remove('open'); burger.classList.remove('open'); });
  });
}

function observeReveals(root = document) {
  const targets = root.querySelectorAll('.reveal-l, .reveal-r, .reveal-up');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || !('IntersectionObserver' in window)) {
    targets.forEach(el => el.classList.add('visible'));
    return;
  }
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target); }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -10% 0px' });
  targets.forEach(el => obs.observe(el));
  setTimeout(() => targets.forEach(el => el.classList.add('visible')), 2500);
}

// Hero landing: carrusel de fotos a pantalla completa (Swiper). Sin fotos → fallback elegante.
async function initHero() {
  const wrapper = document.getElementById('heroSlides');
  if (!wrapper) return;
  let imgs = [];
  try { imgs = await fetch('/api/club/banner').then(r => r.json()); } catch {}
  if (imgs.length) {
    wrapper.innerHTML = imgs.map(b =>
      `<div class="swiper-slide"><div class="hero-slide-img" style="background-image:url('${cssUrl(b.image_url)}')"></div></div>`
    ).join('');
  }
  if (window.Swiper) {
    const multi = wrapper.children.length > 1;
    new Swiper('.club-hero-swiper', {
      effect: 'fade', fadeEffect: { crossFade: true }, speed: 1200, loop: multi,
      autoplay: multi ? { delay: 5500, disableOnInteraction: false } : false,
      pagination: { el: '.club-hero-pagination', clickable: true },
      allowTouchMove: multi,
    });
  }
}

async function loadProjects() {
  const root = document.getElementById('projRows');
  if (!root) return;
  try {
    const projects = await fetch('/api/club/projects').then(r => r.json());
    if (!projects.length) {
      root.innerHTML = '<div class="proj-empty"><i data-lucide="folder-open"></i><p>Pronto compartiremos nuestros proyectos.</p></div>';
      lucide.createIcons({ nodes: [root] });
      return;
    }

    root.innerHTML = projects.map((p, i) => {
      const reverse = i % 2 === 1;
      const figure = p.image_url
        ? `<img src="${escapeHtml(p.image_url)}" alt="" class="proj-img">`
        : `<span class="proj-img proj-img--ph"><i data-lucide="cpu"></i></span>`;
      return `<article class="proj-row ${reverse ? 'proj-row--reverse' : ''}">
        <figure class="proj-figure ${reverse ? 'reveal-r' : 'reveal-l'}">${figure}</figure>
        <div class="proj-content ${reverse ? 'reveal-l' : 'reveal-r'}">
          <h3 class="proj-title">${escapeHtml(p.title)}</h3>
          <p class="proj-desc">${escapeHtml(p.description)}</p>
        </div>
      </article>`;
    }).join('');

    lucide.createIcons({ nodes: [root] });
    observeReveals(root);
  } catch {
    root.innerHTML = '<div class="proj-empty"><p>No se pudieron cargar los proyectos.</p></div>';
  }
}

function initApplyForm() {
  const form   = document.getElementById('applyForm');
  const status = document.getElementById('applyStatus');
  const submit = document.getElementById('applySubmit');
  if (!form) return;

  const tsInstances = [];
  form.querySelectorAll('select[data-type="dropdown"]').forEach(sel => {
    if (window.TomSelect && !sel.tomselect) {
      tsInstances.push(new TomSelect(sel, {
        create: false, allowEmptyOption: false, maxOptions: 200,
        placeholder: sel.getAttribute('placeholder') || 'Selecciona',
      }));
    }
    if (sel.dataset.other === '1') {
      const other = document.getElementById(sel.id + '-other');
      sel.addEventListener('change', () => {
        const isOther = sel.value === '__otro__';
        if (other) { other.hidden = !isOther; if (isOther) other.focus(); }
      });
    }
  });

  const collect = () => {
    const answers = {};
    form.querySelectorAll('[data-qid][data-type]').forEach(el => {
      const qid = el.dataset.qid;
      const type = el.dataset.type;
      if (type === 'checkboxes') {
        answers[qid] = Array.from(el.querySelectorAll('input:checked')).map(c => c.value);
      } else if (type === 'dropdown') {
        let v = el.value;
        if (v === '__otro__') v = (document.getElementById(el.id + '-other')?.value || '').trim();
        answers[qid] = v;
      } else {
        answers[qid] = (el.value || '').trim();
      }
    });
    return answers;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    submit.disabled = true;
    status.textContent = 'Enviando...';
    status.className = 'club-apply-status';
    try {
      const res  = await fetch('/api/club/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers: collect() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Error');
      form.reset();
      tsInstances.forEach(t => t.clear());
      form.querySelectorAll('.q-other').forEach(o => { o.hidden = true; });
      status.textContent = '¡Gracias! Recibimos tu postulación.';
      status.className = 'club-apply-status ok';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'club-apply-status err';
    } finally {
      submit.disabled = false;
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  observeReveals();
  initHero();
  loadProjects();
  initApplyForm();
  setTimeout(() => document.querySelectorAll('[data-aos]').forEach(el => el.classList.add('visible')), 100);
  lucide.createIcons();
});
