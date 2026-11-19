// icons.js — 内联 SVG 图标集（统一 18px / 1.5 stroke）
const wrap = (paths) => `<svg viewBox="0 0 24 24" aria-hidden="true">${paths}</svg>`;

export const ICONS = {
  plus: wrap('<path d="M12 5v14M5 12h14"/>'),
  settings: wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.6 1h.2a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.6 1z"/>'),
  chat: wrap('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'),
  users: wrap('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>'),
  send: wrap('<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/>'),
  stop: wrap('<rect x="6" y="6" width="12" height="12" rx="2"/>'),
  menu: wrap('<path d="M3 12h18M3 6h18M3 18h18"/>'),
  close: wrap('<path d="M18 6 6 18M6 6l12 12"/>'),
  edit: wrap('<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4z"/>'),
  trash: wrap('<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M10 11v6M14 11v6"/>'),
  download: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>'),
  down: wrap('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
  book: wrap('<path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5V5a2 2 0 0 1 2-2h14v18H6.5A2.5 2.5 0 0 1 4 19.5z"/>'),
  globe: wrap('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.6 2.4 4 5.4 4 9s-1.4 6.6-4 9c-2.6-2.4-4-5.4-4-9s1.4-6.6 4-9z"/>'),
  user: wrap('<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>'),
  brain: wrap('<path d="M9.5 3a2.5 2.5 0 0 0-2.5 2.5A2.5 2.5 0 0 0 5.8 7.3 2.5 2.5 0 0 0 5 11a2.5 2.5 0 0 0 .8 1.8A2.5 2.5 0 0 0 7 17a2.5 2.5 0 0 0 2.5 3M14.5 3a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1 1.2 1.8 2.5 2.5 0 0 1 .8 1.8 2.5 2.5 0 0 1-.8 1.8A2.5 2.5 0 0 1 17 17a2.5 2.5 0 0 1-2.5 3M12 3v18"/>'),
  toggle: wrap('<rect x="2" y="7" width="20" height="10" rx="5"/><circle cx="17" cy="12" r="3"/>'),
  search: wrap('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>'),
  more: wrap('<circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>'),
  arrowLeft: wrap('<path d="M19 12H5M12 19l-7-7 7-7"/>'),
  up: wrap('<path d="m18 15-6-6-6 6"/>'),
  eyeOff: wrap('<path d="M9.9 4.2A10.7 10.7 0 0 1 12 4c6 0 10 6 10 6a17 17 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 10s4 6 10 6a10 10 0 0 0 4.4-1M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8"/>'),
  code: wrap('<path d="m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14"/>'),
  plugin: wrap('<path d="M9 3v3M15 3v3M7 6h10a2 2 0 0 1 2 2v3a3 3 0 0 0 0 6v1a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-1a3 3 0 0 0 0-6V8a2 2 0 0 1 2-2z"/>'),
  eye: wrap('<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z"/><circle cx="12" cy="12" r="2.6"/>'),
  upload: wrap('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>'),
  copy: wrap('<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  grip: wrap('<circle cx="9" cy="6" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="18" r="1"/>'),
  refresh: wrap('<path d="M21 12a9 9 0 1 1-2.6-6.4M21 3v6h-6"/>'),
  left: wrap('<path d="m15 18-6-6 6-6"/>'),
  right: wrap('<path d="m9 18 6-6-6-6"/>'),
  image: wrap('<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>'),
  history: wrap('<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 8v4l3 2"/>'),
};

export function paintIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    const name = el.getAttribute('data-icon');
    const svg = ICONS[name];
    if (svg) el.innerHTML = svg;
  });
  // 没有 data-icon 但带 aria-label 的 icon-btn 补默认图标
  root.querySelectorAll('.icon-btn:not([data-icon]):empty').forEach(el => {
    const label = el.getAttribute('aria-label') || '';
    let key = 'close';
    if (label.includes('设置')) key = 'settings';
    if (label.includes('角色') || label.includes('列表') || label.includes('侧栏')) key = 'menu';
    el.innerHTML = `<span class="icon">${ICONS[key]}</span>`;
  });
}
