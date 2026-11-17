// world.js — 世界书页：世界条目 / 主角档案 / 长期记忆
import { ICONS } from '../icons.js';
import * as state from '../state.js';

const $ = (sel) => document.querySelector(sel);

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function brief(str = '', n = 120) {
  const text = String(str).replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n) + '…' : text;
}

export function renderWorld() {
  const s = state.getState();
  const entries = s.worldBooks || [];
  const p = s.protagonist || {};
  const m = s.memory || {};

  $('#world-entry-count').textContent =
    `共 ${entries.length} 条条目 · 常驻 ${entries.filter(e => e.constant).length} 条 · 已启用 ${entries.filter(e => e.enabled).length} 条`;

  // 主角卡片
  const pName = p.name?.trim() || '未设定主角';
  const pTitle = p.title?.trim();
  const pFacts = [p.title, p.personality, p.background, p.relationship]
    .map(v => v?.trim()).filter(Boolean);
  $('#protagonist-card').innerHTML = `
    <div class="profile-head">
      <div class="profile-avatar" aria-hidden="true"><span class="icon">${ICONS.user}</span></div>
      <div class="profile-info" style="min-width:0;flex:1">
        <div class="profile-name">${escapeHTML(pName)} ${p.enabled ? '<span class="rule-tag on">注入中</span>' : '<span class="rule-tag">未启用</span>'}</div>
        <div class="profile-sub">${pTitle ? escapeHTML(pTitle) : '设定你在故事中的身份，角色会据此称呼你'}</div>
      </div>
      <label class="switch" title="${p.enabled ? '点击停用' : '点击启用'}">
        <input type="checkbox" data-action="toggle-protagonist" ${p.enabled ? 'checked' : ''} aria-label="启用主角设定">
        <span class="switch-track"></span>
      </label>
    </div>
    ${pFacts.length ? `<div class="profile-facts">${pFacts.map(v => `<span class="world-key">${escapeHTML(brief(v, 40))}</span>`).join('')}</div>` : ''}
    <div class="profile-foot">
      <button class="secondary-btn sm-btn" data-action="edit-protagonist"><span class="icon">${ICONS.edit}</span><span>编辑主角</span></button>
    </div>`;

  // 长期记忆卡片
  const hasMemory = !!m.content?.trim();
  $('#memory-card').innerHTML = `
    <div class="profile-head">
      <div class="profile-avatar memory" aria-hidden="true"><span class="icon">${ICONS.brain}</span></div>
      <div class="profile-info" style="min-width:0;flex:1">
        <div class="profile-name">长期记忆 ${m.enabled && hasMemory ? '<span class="rule-tag on">注入中</span>' : '<span class="rule-tag">未生效</span>'}</div>
        <div class="profile-sub">${hasMemory ? escapeHTML(brief(m.content, 100)) : '记录已经发生、希望角色一直记住的事情'}</div>
      </div>
      <label class="switch" title="${m.enabled ? '点击停用' : '点击启用'}">
        <input type="checkbox" data-action="toggle-memory" ${m.enabled ? 'checked' : ''} aria-label="启用长期记忆">
        <span class="switch-track"></span>
      </label>
    </div>
    <div class="profile-foot">
      <button class="secondary-btn sm-btn" data-action="edit-memory"><span class="icon">${ICONS.edit}</span><span>编辑记忆</span></button>
    </div>`;

  // 世界书条目
  const list = $('#world-list');
  if (!entries.length) {
    list.innerHTML = `
      <div class="empty-state" style="border:1px dashed var(--border);border-radius:var(--r-card)">
        <div class="empty-mark"><span class="icon">${ICONS.globe}</span></div>
        <div class="empty-title">还没有世界书条目</div>
        <div class="empty-desc">写下一个地点、组织或往事，设置触发关键词，它会在对话提及时自动带给角色。</div>
        <button class="primary-btn" data-action="new-world-entry"><span class="icon">${ICONS.plus}</span><span>新建条目</span></button>
      </div>`;
    return;
  }

  list.innerHTML = entries.map(entry => {
    const keys = state.splitKeys(entry.keys);
    return `
      <article class="rule-card world-card ${entry.enabled ? 'rule-on' : ''}">
        <div class="rule-head">
          <div style="min-width:0;flex:1">
            <div class="rule-name">
              ${escapeHTML(entry.name)}
              ${entry.builtin ? '<span class="rule-tag">内置</span>' : ''}
              ${entry.constant ? '<span class="rule-tag constant">常驻</span>' : ''}
              ${entry.enabled ? '' : '<span class="rule-tag">已停用</span>'}
            </div>
            ${keys.length ? `<div class="world-keys">${keys.map(k => `<span class="world-key">${escapeHTML(k)}</span>`).join('')}</div>` : ''}
          </div>
          <label class="switch" title="${entry.enabled ? '点击停用' : '点击启用'}">
            <input type="checkbox" data-action="toggle-world-entry" data-id="${entry.id}" ${entry.enabled ? 'checked' : ''} aria-label="启用 ${escapeHTML(entry.name)}">
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="rule-content">${escapeHTML(brief(entry.content, 140))}</div>
        <div class="rule-foot">
          <div class="rule-actions">
            <button class="icon-btn" data-action="edit-world-entry" data-id="${entry.id}" aria-label="编辑 ${escapeHTML(entry.name)}" title="编辑"><span class="icon">${ICONS.edit}</span></button>
            <button class="icon-btn" data-action="delete-world-entry" data-id="${entry.id}" aria-label="删除 ${escapeHTML(entry.name)}" title="删除"><span class="icon">${ICONS.trash}</span></button>
          </div>
        </div>
      </article>`;
  }).join('');
}

export function openWorldModal(id = null) {
  const form = $('#world-form');
  form.reset();
  const entry = id ? state.getState().worldBooks.find(w => w.id === id) : null;
  $('#world-modal-title').textContent = entry ? '编辑条目' : '新建世界书条目';
  $('#world-entry-id').value = entry?.id || '';
  $('#world-entry-name').value = entry?.name || '';
  $('#world-entry-keys').value = entry?.keys || '';
  $('#world-entry-content').value = entry?.content || '';
  $('#world-entry-constant').checked = !!entry?.constant;
  $('#world-entry-enabled').checked = entry ? !!entry.enabled : true;
  $('#world-modal').hidden = false;
  setTimeout(() => $('#world-entry-name').focus(), 50);
}

export function closeWorldModal() { $('#world-modal').hidden = true; }

export function openProtagonistModal() {
  const p = state.getState().protagonist;
  $('#protagonist-enabled').checked = !!p.enabled;
  $('#protagonist-name').value = p.name || '';
  $('#protagonist-title').value = p.title || '';
  $('#protagonist-gender').value = p.gender || '';
  $('#protagonist-personality').value = p.personality || '';
  $('#protagonist-background').value = p.background || '';
  $('#protagonist-relationship').value = p.relationship || '';
  $('#protagonist-notes').value = p.notes || '';
  $('#protagonist-modal').hidden = false;
  setTimeout(() => $('#protagonist-name').focus(), 50);
}

export function closeProtagonistModal() { $('#protagonist-modal').hidden = true; }

export function openMemoryModal() {
  const m = state.getState().memory;
  $('#memory-enabled').checked = !!m.enabled;
  $('#memory-content').value = m.content || '';
  $('#memory-modal').hidden = false;
  setTimeout(() => $('#memory-content').focus(), 50);
}

export function closeMemoryModal() { $('#memory-modal').hidden = true; }

export function initWorld(confirmFn) {
  $('#world-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      keys: fd.get('keys'),
      content: fd.get('content'),
      constant: fd.has('constant'),
      enabled: fd.has('enabled'),
    };
    const id = fd.get('id');
    if (id) state.updateWorldEntry(id, data);
    else state.addWorldEntry(data);
    closeWorldModal();
  });

  $('#protagonist-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.updateProtagonist({
      enabled: fd.has('enabled'),
      name: fd.get('name'),
      title: fd.get('title'),
      gender: fd.get('gender'),
      personality: fd.get('personality'),
      background: fd.get('background'),
      relationship: fd.get('relationship'),
      notes: fd.get('notes'),
    });
    closeProtagonistModal();
  });

  $('#memory-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    state.updateMemory({ enabled: fd.has('enabled'), content: fd.get('content') });
    closeMemoryModal();
  });

  $('#world-list').addEventListener('change', (e) => {
    const el = e.target.closest('[data-action="toggle-world-entry"]');
    if (el) state.toggleWorldEntry(el.dataset.id);
  });

  $('#protagonist-card').addEventListener('change', (e) => {
    if (e.target.closest('[data-action="toggle-protagonist"]')) state.toggleProtagonist();
  });

  $('#memory-card').addEventListener('change', (e) => {
    if (e.target.closest('[data-action="toggle-memory"]')) state.toggleMemory();
  });
}

export function handleWorldAction(action, id, confirmFn) {
  if (action === 'new-world-entry') openWorldModal();
  else if (action === 'edit-world-entry') openWorldModal(id);
  else if (action === 'delete-world-entry') {
    const entry = state.getState().worldBooks.find(w => w.id === id);
    if (!entry) return;
    confirmFn?.('删除条目', `确定删除「${entry.name}」吗？此操作无法撤销。`, () => state.deleteWorldEntry(id), '删除');
  } else if (action === 'edit-protagonist') openProtagonistModal();
  else if (action === 'edit-memory') openMemoryModal();
}
