// router.js — hash 路由
const VALID = ['chat', 'characters', 'world', 'rules', 'settings'];
let onChange = null;

function current() {
  const hash = (location.hash || '').replace(/^#\/?/, '').split('?')[0];
  return VALID.includes(hash) ? hash : 'chat';
}

export function startRouter(handler) {
  onChange = handler;
  window.addEventListener('hashchange', () => onChange(current()));
  if (!location.hash || !VALID.includes(location.hash.replace(/^#\/?/, ''))) {
    location.replace('#/chat');
  }
  onChange(current());
}

export function navigate(page) {
  if (!VALID.includes(page)) return;
  location.hash = `#/${page}`;
}

export function currentPage() { return current(); }
