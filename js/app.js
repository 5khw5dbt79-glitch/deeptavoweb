// app.js — 启动入口与全局事件绑定
import { paintIcons, ICONS } from './icons.js';
import * as state from './state.js';
import * as router from './router.js';
import * as chat from './components/chat.js';
import * as characters from './components/characters.js';
import * as rules from './components/rules.js';
import * as world from './components/world.js';
import * as settings from './components/settings.js';
import * as scope from './components/scope.js';

const $ = (sel) => document.querySelector(sel);

// ---- 侧栏渲染 ----
function renderSidebar() {
  const s = state.getState();
  const nav = $('#character-nav');
  if (!s.characters.length) {
    nav.innerHTML = '<div style="padding:12px;font-size:13px;color:var(--text-muted)">还没有角色</div>';
    return;
  }
  nav.innerHTML = s.characters.map(c => `
    <button class="nav-item ${c.id === s.activeCharacterId ? 'active' : ''}" data-action="select-character" data-id="${c.id}">
      <span class="avatar-dot" style="background:${c.color}"></span>
      <span class="nav-item-label">${escapeHTML(c.name)}</span>
    </button>`).join('');
}

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---- 抽屉 ----
function openDrawer() {
  $('#sidebar').classList.add('open');
  $('#drawer-mask').classList.add('show');
}
function closeDrawer() {
  $('#sidebar').classList.remove('open');
  $('#drawer-mask').classList.remove('show');
}

// ---- 确认弹层通用 ----
let confirmCallback = null;
function openConfirm(title, text, cb, okText = '确认') {
  $('#confirm-title').textContent = title;
  $('#confirm-text').textContent = text;
  $('#confirm-ok').textContent = okText;
  confirmCallback = cb;
  $('#confirm-modal').hidden = false;
}
function closeConfirm() { $('#confirm-modal').hidden = true; confirmCallback = null; }

// ---- 路由切换 ----
function onRoute(page) {
  document.querySelectorAll('.page').forEach(el => {
    el.classList.toggle('is-active', el.dataset.page === page);
  });
  document.querySelectorAll('.tab, .nav-item[data-route]').forEach(el => {
    el.classList.toggle('active', el.dataset.route === `#/${page}`);
  });
  closeDrawer();
  if (page === 'chat') chat.renderChat();
  else if (page === 'characters') characters.renderCharacters();
  else if (page === 'world') world.renderWorld();
  else if (page === 'rules') rules.renderRules();
  else if (page === 'settings') settings.renderSettings();
  renderSidebar();
}

// ---- 全局事件委托 ----
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action], [data-route]');
  if (!el) return;

  if (el.dataset.route) { router.navigate(el.dataset.route.replace(/^#\//, '')); return; }

  const action = el.dataset.action;
  const id = el.dataset.id;

  switch (action) {
    case 'send': chat.handleChatAction('send'); break;
    case 'scroll-bottom': chat.handleChatAction('scroll-bottom'); break;
    case 'goto-characters': router.navigate('characters'); break;
    case 'open-drawer': openDrawer(); break;
    case 'close-drawer': closeDrawer(); break;
    case 'new-character':
      characters.openCharacterModal();
      closeDrawer();
      break;
    case 'edit-character': characters.handleCharacterAction(action, id); break;
    case 'delete-character': characters.handleCharacterAction(action, id); break;
    case 'chat-with': characters.handleCharacterAction(action, id); closeDrawer(); break;
    case 'select-character': state.selectCharacter(id); closeDrawer(); router.navigate('chat'); break;
    case 'close-modal': characters.closeCharacterModal(); break;
    case 'select-preset': rules.handleRuleAction('select-preset', id); break;
    case 'toggle-preset-menu': rules.handleRuleAction('toggle-preset-menu', id); break;
    case 'edit-preset': rules.handleRuleAction('edit-preset', id); break;
    case 'default-preset': rules.handleRuleAction('default-preset', id); break;
    case 'delete-preset': rules.handleRuleAction('delete-preset', id, openConfirm); break;
    case 'new-preset': rules.handleRuleAction('new-preset'); closeDrawer(); break;
    case 'new-world-entry': world.handleWorldAction('new-world-entry'); closeDrawer(); break;
    case 'edit-world-entry': world.handleWorldAction('edit-world-entry', id); break;
    case 'delete-world-entry': world.handleWorldAction('delete-world-entry', id, openConfirm); break;
    case 'close-world-modal': world.closeWorldModal(); break;
    case 'edit-protagonist': world.handleWorldAction('edit-protagonist'); closeDrawer(); break;
    case 'close-protagonist-modal': world.closeProtagonistModal(); break;
    case 'edit-memory': world.handleWorldAction('edit-memory'); closeDrawer(); break;
    case 'close-memory-modal': world.closeMemoryModal(); break;
    case 'new-rule': rules.handleRuleAction('new-rule'); closeDrawer(); break;
    case 'edit-rule': rules.handleRuleAction('edit-rule', id); break;
    case 'delete-rule': rules.handleRuleAction('delete-rule', id, openConfirm); break;
    case 'close-rule-modal': rules.closeRuleModal(); break;
    case 'close-confirm': closeConfirm(); break;
    case 'confirm-ok':
      if (confirmCallback) { const cb = confirmCallback; closeConfirm(); cb(); }
      break;
    // 设置页的 export-data / clear-data 由 settings.js 内部监听处理
  }
});

// 弹层内部点击不误关：遮罩层与关闭按钮各自带 data-action，点到内容区不会匹配到关闭动作
// （不再全局 stopPropagation，否则会阻断 confirm-ok 等按钮的委托处理）

// ESC 关闭浮层
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if (!$('#character-modal').hidden) characters.closeCharacterModal();
  else if (!$('#preset-editor').hidden) rules.closePresetEditor();
  else if (!$('#world-modal').hidden) world.closeWorldModal();
  else if (!$('#protagonist-modal').hidden) world.closeProtagonistModal();
  else if (!$('#memory-modal').hidden) world.closeMemoryModal();
  else if (!$('#rule-modal').hidden) rules.closeRuleModal();
  else if (!$('#confirm-modal').hidden) closeConfirm();
  else closeDrawer();
});

// ---- 启动 ----
paintIcons();
chat.initChat();
characters.initCharacters(openConfirm);
rules.initRules(openConfirm);
world.initWorld(openConfirm);
settings.initSettings(openConfirm);
scope.initScope(openConfirm);

state.subscribe((_s, hint) => {
  // 'messages' 变化由 chat.js 做局部 DOM 更新，不整页重渲染（否则打断流式打字）
  if (hint === 'messages') return;
  renderSidebar();
  const page = router.currentPage();
  if (hint === 'characters') {
    if (page === 'characters') characters.renderCharacters();
    if (page === 'chat') chat.renderChat();
    // 切换角色后，规则书 / 世界书页要跟着切到该角色的那一套
    if (page === 'rules') rules.renderRules();
    if (page === 'world') world.renderWorld();
  } else if (hint === 'scope' && (page === 'rules' || page === 'world')) {
    if (page === 'rules') rules.renderRules();
    else world.renderWorld();
  } else if (hint === 'rules' && page === 'rules') {
    rules.renderRules();
  } else if (hint === 'presets' && page === 'rules') {
    rules.renderRules();
  } else if (['world', 'protagonist', 'memory'].includes(hint) && page === 'world') {
    world.renderWorld();
  } else if (hint === 'usage' && page === 'settings') {
    settings.renderSettings();
  }
});

router.startRouter(onRoute);
renderSidebar();
