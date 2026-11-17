// rules.js — 预设管理 + 规则书管理页
import { ICONS, paintIcons } from '../icons.js';
import * as state from '../state.js';
import { makePresetBlocks } from '../storage.js';

const $ = (sel) => document.querySelector(sel);
const PRESET_DEFS = state.PRESET_BLOCK_DEFS;

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function brief(str = '', n = 100) {
  const text = String(str).replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n) + '…' : text;
}

// ---- 预设列表 ----
export function renderPresets() {
  const s = state.getState();
  const list = $('#preset-list');
  const searchEl = $('#preset-search');
  if (!list) return;
  const query = (searchEl?.value || '').trim().toLowerCase();
  const all = s.presets || [];
  const items = query
    ? all.filter(p => `${p.name} ${p.description || ''}`.toLowerCase().includes(query))
    : all;

  if (!items.length) {
    list.innerHTML = '<div class="empty-state" style="border:1px dashed var(--border);border-radius:var(--r-card)"><div class="empty-title">没有匹配的预设</div><div class="empty-desc">换个关键词，或新建一个预设。</div></div>';
    return;
  }

  list.innerHTML = items.map(p => {
    const active = p.id === s.activePresetId;
    const enabledCount = (p.blocks || []).filter(b => b.enabled !== false).length;
    return `
      <article class="preset-card ${active ? 'preset-active' : ''}">
        <div class="preset-card-head">
          <span class="preset-icon"><span class="icon" data-icon="code"></span></span>
          <div class="preset-name-wrap">
            <div class="preset-name">
              ${escapeHTML(p.name)}
              ${p.builtin ? '<span class="rule-tag">内置</span>' : ''}
              ${p.isDefault ? '<span class="rule-tag on">默认</span>' : ''}
              ${active ? '<span class="rule-tag on">启用中</span>' : ''}
            </div>
            <p class="preset-desc">${escapeHTML(p.description || '')}</p>
          </div>
          <button class="icon-btn" data-action="toggle-preset-menu" data-id="${p.id}" aria-label="${escapeHTML(p.name)} 更多"><span class="icon" data-icon="more"></span></button>
        </div>
        <div class="preset-content">${escapeHTML(brief(p.mainPrompt || p.content || ''))}</div>
        <div class="preset-foot">
          <button class="secondary-btn sm-btn" data-action="select-preset" data-id="${p.id}">${active ? '已启用 · 停用' : '启用'}</button>
          <span class="preset-meta">${enabledCount} / ${(p.blocks || []).length} 块启用</span>
        </div>
        <div class="preset-menu" data-menu="${p.id}" hidden>
          <button data-action="edit-preset" data-id="${p.id}"><span class="icon">${ICONS.edit}</span>编辑</button>
          <button data-action="default-preset" data-id="${p.id}"><span class="icon">${ICONS.toggle}</span>设为默认</button>
          ${p.builtin ? '' : `<button class="danger-text" data-action="delete-preset" data-id="${p.id}"><span class="icon">${ICONS.trash}</span>删除</button>`}
        </div>
      </article>`;
  }).join('');
  paintIcons(list);
}

// ---- 预设编辑器 ----
let draft = null;

function blockRow(b, index, total) {
  const def = PRESET_DEFS.find(d => d.key === b.key);
  const label = b.custom ? (b.label || b.key) : (def?.label || b.key);
  const cn = b.custom ? '自定义块' : (def?.cn || '');
  const badge = b.custom ? '自定义' : (def?.badge || '内容');
  const key = escapeHTML(b.key);
  return `
    <div class="block-row ${b.enabled === false ? 'block-off' : ''}" data-block-key="${key}">
      <div class="block-row-main">
        <span class="block-grip" aria-hidden="true">⋮⋮</span>
        <div class="block-label">
          <div class="block-name">${escapeHTML(label)} <span class="block-badge">${escapeHTML(badge)}</span></div>
          <div class="block-cn">${escapeHTML(cn)}</div>
        </div>
        <div class="block-tools">
          <button class="icon-btn xs" data-action="edit-block" data-key="${key}" aria-label="编辑内容" title="编辑内容"><span class="icon">${ICONS.edit}</span></button>
          ${index >= 0 && index > 0 ? `<button class="icon-btn xs" data-action="move-block-up" data-key="${key}" aria-label="上移" title="上移"><span class="icon">${ICONS.up}</span></button>` : ''}
          ${index >= 0 && index < total - 1 ? `<button class="icon-btn xs" data-action="move-block-down" data-key="${key}" aria-label="下移" title="下移"><span class="icon">${ICONS.down}</span></button>` : ''}
          <button class="icon-btn xs" data-action="toggle-block" data-key="${key}" aria-label="停用或启用" title="停用或启用"><span class="icon">${ICONS.eyeOff}</span></button>
          ${b.custom ? `<button class="icon-btn xs" data-action="remove-block" data-key="${key}" aria-label="删除此块" title="删除此块"><span class="icon">${ICONS.trash}</span></button>` : ''}
          <label class="switch">
            <input type="checkbox" data-action="block-switch" data-key="${key}" ${b.enabled === false ? '' : 'checked'} aria-label="启用 ${escapeHTML(label)}">
            <span class="switch-track"></span>
          </label>
        </div>
      </div>
      <div class="block-editor" hidden>
        ${b.custom ? `<input class="form-input block-label-input" data-field="label" data-key="${key}" value="${escapeHTML(b.label || b.key)}" placeholder="块名称" aria-label="块名称">` : ''}
        <textarea class="form-textarea" data-field="content" data-key="${key}" rows="5" placeholder="这块要注入的内容…">${escapeHTML(b.content || '')}</textarea>
      </div>
    </div>`;
}

function renderBlockList() {
  if (!draft) return;
  const active = draft.blocks.filter(b => b.enabled !== false);
  const inactive = draft.blocks.filter(b => b.enabled === false);
  $('#block-list').innerHTML = active.map((b, i) => blockRow(b, i, active.length)).join('');
  $('#block-list-inactive').innerHTML = inactive.map(b => blockRow(b, -1, inactive.length)).join('');
  if (!inactive.length) $('#block-list-inactive').innerHTML = '<p class="block-empty">暂无未激活提示词</p>';
  paintIcons($('#preset-editor'));
}

export function openPresetEditor(id = null) {
  const existing = id ? state.getState().presets.find(p => p.id === id) : null;
  draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
      id: null,
      name: '',
      description: '',
      mainPrompt: '',
      blocks: makePresetBlocks(''),
      builtin: false,
      isDefault: false,
    };
  $('#preset-editor-title').textContent = existing ? '编辑预设' : '新建预设';
  $('#preset-edit-name').value = draft.name || '';
  $('#preset-edit-main').value = draft.mainPrompt || '';
  $('#base-prompt-editor').hidden = false;
  document.querySelectorAll('.preset-menu').forEach(m => { m.hidden = true; });
  renderBlockList();
  $('#preset-editor').hidden = false;
  setTimeout(() => $('#preset-edit-name').focus(), 50);
}

export function closePresetEditor() {
  $('#preset-editor').hidden = true;
  draft = null;
}

export function savePreset() {
  if (!draft) return;
  const name = $('#preset-edit-name').value.trim();
  if (!name) { $('#preset-edit-name').focus(); return; }
  const mainPrompt = $('#preset-edit-main').value;
  draft.name = name;
  draft.mainPrompt = mainPrompt;
  const main = draft.blocks.find(b => b.key === 'main');
  if (main) main.content = mainPrompt;
  if (draft.id) {
    state.updatePreset(draft.id, { name, mainPrompt, blocks: draft.blocks });
  } else {
    const created = state.addPreset({ name, mainPrompt, blocks: draft.blocks });
    state.selectPreset(created.id);
  }
  closePresetEditor();
}

function togglePresetMenu(id) {
  document.querySelectorAll('.preset-menu').forEach(menu => {
    menu.hidden = menu.dataset.menu !== id ? true : !menu.hidden;
  });
}

export function handlePresetAction(action, id, confirmFn) {
  if (action === 'select-preset') {
    const current = state.getState().activePresetId;
    state.selectPreset(current === id ? null : id);
  } else if (action === 'toggle-preset-menu') {
    togglePresetMenu(id);
  } else if (action === 'edit-preset') {
    openPresetEditor(id);
  } else if (action === 'default-preset') {
    state.setDefaultPreset(id);
    document.querySelectorAll('.preset-menu').forEach(m => { m.hidden = true; });
  } else if (action === 'delete-preset') {
    const p = state.getState().presets.find(x => x.id === id);
    if (!p || p.builtin) return;
    confirmFn?.('删除预设', `确定删除「${p.name}」吗？此操作无法撤销。`, () => state.deletePreset(id), '删除');
  }
}

// ---- 规则书 ----
export function renderRules() {
  renderPresets();
  const rules = state.getState().rules;
  $('#rule-count').textContent = `共 ${rules.length} 条规则 · 已启用 ${rules.filter(r => r.enabled).length} 条`;

  const list = $('#rule-list');
  if (!rules.length) {
    list.innerHTML = `
      <div class="empty-state" style="border:1px dashed var(--border);border-radius:var(--r-card)">
        <div class="empty-mark"><span class="icon">${ICONS.book}</span></div>
        <div class="empty-title">还没有规则</div>
        <div class="empty-desc">新建一条规则，统一角色对话的口吻与格式。</div>
        <button class="primary-btn" data-action="new-rule"><span class="icon">${ICONS.plus}</span><span>新建规则</span></button>
      </div>`;
    return;
  }

  list.innerHTML = rules.map(r => {
    const preview = r.content.length > 120 ? r.content.slice(0, 120) + '…' : r.content;
    return `
      <article class="rule-card ${r.enabled ? 'rule-on' : ''}">
        <div class="rule-head">
          <div style="min-width:0;flex:1">
            <div class="rule-name">
              ${escapeHTML(r.name)}
              ${r.builtin ? '<span class="rule-tag">内置</span>' : ''}
              ${r.enabled ? '<span class="rule-tag on">已启用</span>' : ''}
            </div>
          </div>
          <label class="switch" title="${r.enabled ? '点击停用' : '点击启用'}">
            <input type="checkbox" data-action="toggle-rule" data-id="${r.id}" ${r.enabled ? 'checked' : ''} aria-label="启用 ${escapeHTML(r.name)}">
            <span class="switch-track"></span>
          </label>
        </div>
        <div class="rule-content">${escapeHTML(preview)}</div>
        <div class="rule-foot">
          <div class="rule-actions">
            <button class="icon-btn" data-action="edit-rule" data-id="${r.id}" aria-label="编辑 ${escapeHTML(r.name)}" title="编辑"><span class="icon">${ICONS.edit}</span></button>
            <button class="icon-btn" data-action="delete-rule" data-id="${r.id}" aria-label="删除 ${escapeHTML(r.name)}" title="删除"><span class="icon">${ICONS.trash}</span></button>
          </div>
        </div>
      </article>`;
  }).join('');
}

export function openRuleModal(id = null) {
  const form = $('#rule-form');
  form.reset();
  const rule = id ? state.getState().rules.find(r => r.id === id) : null;
  $('#rule-modal-title').textContent = rule ? '编辑规则' : '新建规则';
  $('#rule-id').value = rule?.id || '';
  $('#rule-name').value = rule?.name || '';
  $('#rule-content').value = rule?.content || '';
  $('#rule-modal').hidden = false;
  setTimeout(() => $('#rule-name').focus(), 50);
}

export function closeRuleModal() {
  $('#rule-modal').hidden = true;
}

export function initRules(confirmFn) {
  $('#rule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = { name: fd.get('name'), content: fd.get('content') };
    const id = fd.get('id');
    if (id) state.updateRule(id, data);
    else state.addRule({ ...data, enabled: true });
    closeRuleModal();
  });

  $('#rule-list').addEventListener('change', (e) => {
    const el = e.target.closest('[data-action="toggle-rule"]');
    if (el) state.toggleRule(el.dataset.id);
  });

  $('#preset-search')?.addEventListener('input', renderPresets);

  // 预设编辑器内部事件（独立于全局委托）
  const editor = $('#preset-editor');
  editor.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const key = el.dataset.key;
    const action = el.dataset.action;

    if (action === 'close-preset-editor') { closePresetEditor(); return; }
    if (action === 'save-preset') { savePreset(); return; }
    if (action === 'toggle-base-prompt') {
      $('#base-prompt-editor').hidden = !$('#base-prompt-editor').hidden;
      return;
    }
    if (action === 'add-custom-block') {
      const count = draft.blocks.filter(b => b.custom).length + 1;
      draft.blocks.push({ key: `custom_${Date.now().toString(36)}`, label: `自定义块 ${count}`, enabled: true, content: '', custom: true });
      renderBlockList();
      const last = $('#block-list .block-row:last-child');
      if (last) {
        const ta = last.querySelector('textarea');
        last.querySelector('.block-editor').hidden = false;
        ta?.focus();
      }
      return;
    }
    if (!draft) return;
    const b = draft.blocks.find(x => x.key === key);
    if (!b) return;

    if (action === 'edit-block') {
      const box = el.closest('.block-row').querySelector('.block-editor');
      box.hidden = !box.hidden;
    } else if (action === 'toggle-block' || action === 'block-switch') {
      b.enabled = b.enabled === false;
      renderBlockList();
    } else if (action === 'move-block-up' || action === 'move-block-down') {
      const active = draft.blocks.filter(x => x.enabled !== false);
      const pos = active.findIndex(x => x.key === key);
      const swapPos = pos + (action === 'move-block-up' ? -1 : 1);
      if (pos < 0 || swapPos < 0 || swapPos >= active.length) return;
      const i1 = draft.blocks.indexOf(active[pos]);
      const i2 = draft.blocks.indexOf(active[swapPos]);
      [draft.blocks[i1], draft.blocks[i2]] = [draft.blocks[i2], draft.blocks[i1]];
      renderBlockList();
    } else if (action === 'remove-block') {
      draft.blocks = draft.blocks.filter(x => x.key !== key);
      renderBlockList();
    }
  });

  editor.addEventListener('input', (e) => {
    if (!draft) return;
    const el = e.target;
    if (el.id === 'preset-edit-name') draft.name = el.value;
    else if (el.id === 'preset-edit-main') {
      draft.mainPrompt = el.value;
      const main = draft.blocks.find(b => b.key === 'main');
      if (main) main.content = el.value;
    } else if (el.dataset.field) {
      const b = draft.blocks.find(x => x.key === el.dataset.key);
      if (!b) return;
      if (el.dataset.field === 'label') b.label = el.value;
      else b.content = el.value;
      if (b.key === 'main') {
        draft.mainPrompt = b.content;
        $('#preset-edit-main').value = b.content;
      }
    }
  });

  // switch 用 change 事件同步（click 已处理，这里兜住键盘操作）
  editor.addEventListener('change', (e) => {
    if (!draft) return;
    const el = e.target.closest('[data-action="block-switch"]');
    if (!el) return;
    const b = draft.blocks.find(x => x.key === el.dataset.key);
    if (b && b.enabled !== el.checked) { b.enabled = el.checked; renderBlockList(); }
  });
}

export function handleRuleAction(action, id, confirmFn) {
  if (['select-preset', 'toggle-preset-menu', 'edit-preset', 'default-preset', 'delete-preset'].includes(action)) {
    handlePresetAction(action, id, confirmFn);
  } else if (action === 'new-preset') openPresetEditor();
  else if (action === 'new-rule') openRuleModal();
  else if (action === 'edit-rule') openRuleModal(id);
  else if (action === 'delete-rule') {
    const rule = state.getState().rules.find(r => r.id === id);
    if (!rule) return;
    confirmFn?.('删除规则', `确定删除「${rule.name}」吗？此操作无法撤销。`, () => state.deleteRule(id), '删除');
  }
}
