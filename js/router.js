/* router.js — SPA navigation via URL hash */

const ROUTES = [
  { pattern: /^\/tambos\/(\d+)\/control\/(\d+)\/planilla$/, screen: 'planilla',  params: ['tamboId','controlId'] },
  { pattern: /^\/tambos\/(\d+)\/padron\/([^/]+)$/,          screen: 'historial-vaca', params: ['tamboId','rp'] },
  { pattern: /^\/tambos\/(\d+)\/control\/(\d{4}-\d{2}-\d{2})$/, screen: 'registro', params: ['tamboId', 'fecha'] },
  { pattern: /^\/tambos\/(\d+)\/control$/,                  screen: 'registro',  params: ['tamboId'] },
  { pattern: /^\/tambos\/(\d+)\/padron$/,                   screen: 'padron',    params: ['tamboId'] },
  { pattern: /^\/tambos\/(\d+)\/editar$/,                   screen: 'tambo-form', params: ['tamboId'] },
  { pattern: /^\/tambos\/(\d+)$/,                           screen: 'tambo-detalle', params: ['tamboId'] },
  { pattern: /^\/tambos\/nuevo$/,                           screen: 'tambo-form', params: [] },
  { pattern: /^\/tambos$/,                                  screen: 'tambos',    params: [] },
  { pattern: /^\/historial$/,                               screen: 'historial', params: [] },
  { pattern: /^\/config$/,                                  screen: 'config',    params: [] },
  { pattern: /^\/ayuda$/,                                    screen: 'ayuda',     params: [] },
  { pattern: /^\/?$/,                                       screen: 'home',      params: [] },
];

// Pantallas que ocultan el bottom nav (pantallas de trabajo de fondo completo)
const FULLSCREEN = new Set(['registro', 'planilla']);

// Handlers registrados por cada módulo de pantalla
const _handlers = {};

function registerScreen(name, fn) {
  _handlers[name] = fn;
}

function navigate(path) {
  location.hash = '#' + path;
}

function _parsePath(hash) {
  const path = hash.replace(/^#/, '') || '/';
  for (const route of ROUTES) {
    const m = path.match(route.pattern);
    if (m) {
      const params = {};
      route.params.forEach((k, i) => { params[k] = m[i + 1]; });
      return { screen: route.screen, params };
    }
  }
  return { screen: 'home', params: {} };
}

function _updateBottomNav(screen) {
  const nav = document.getElementById('bottom-nav');
  if (!nav) return;
  nav.style.display = FULLSCREEN.has(screen) ? 'none' : '';

  const map = { home: '/', tambos: '/tambos', historial: '/historial', config: '/config', ayuda: '/ayuda' };
  nav.querySelectorAll('.nav-item').forEach(el => {
    const target = el.dataset.route;
    el.classList.toggle('active', screen === target || location.hash === '#' + map[target]);
  });
}

async function _render(hash) {
  const { screen, params } = _parsePath(hash);
  const content = document.getElementById('app-content');
  if (!content) return;

  _updateBottomNav(screen);

  if (_handlers[screen]) {
    await _handlers[screen](content, params);
  } else {
    content.innerHTML = `<div class="placeholder-screen">
      <h2>${screen}</h2>
      <p class="text2">Pantalla en construcción</p>
      <pre>${JSON.stringify(params, null, 2)}</pre>
    </div>`;
  }
}

function refresh() {
  _render(location.hash);
}

function initRouter() {
  window.addEventListener('hashchange', () => _render(location.hash));
  _render(location.hash);
}
