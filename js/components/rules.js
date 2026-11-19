// rules.js — 规则书面板：左侧预设编排器 + 右侧规则片段库
import { ICONS, paintIcons } from '../icons.js';
import * as state from '../state.js';
import * as storage from '../storage.js';
import { parsePresetFile, serializePreset, presetOrderSummary } from '../preset-io.js';
import { estimateTokens, composePlanParts } from '../api.js';
import { renderScopeBar } from './scope.js';
import { openPreview } from './preview.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

/** 页面本地 UI 状态：当前编辑的预设、展开的块、当前 Tab */
const ui = {
  tab: 'presets',
  editingId: null,
  expanded: new Set(),
};

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function brief(str = '', n = 120) {
  const text = String(str).replace(/\s+/g, ' ').trim();
  return text.length > n ? text.slice(0, n) + '…' : text;
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2400);
}

// ---- 当前编辑的预设 ----
function editingPreset() {
  const s = state.getState();
  const byId = ui.editingId ? s.presets.find(p => p.id === ui.editingId) : null;
  return byId || state.activePreset() || s.presets[0] || null;
}

function setEditingPreset(id) {
  ui.editingId = id;
  ui.expanded.clear();
  renderPresetPanel();
}

// ---- 预设编排器 ----
function renderPresetPanel() {
  const s = state.getState();
  const preset = editingPreset();
  const select = $('#preset-select');
  const countEl = $('#preset-count');
  if (!select) return;

  select.innerHTML = s.presets.map(p => {
    const tags = [p.isDefault ? '默认' : '', p.builtin ? '内置' : '', p.id === s.activePresetId ? '启用中' : '']
      .filter(Boolean).join(' · ');
    return `<option value="${p.id}"${preset && p.id === preset.id ? ' selected' : ''}>${escapeHTML(p.name)}${tags ? `（${tags}）` : ''}</option>`;
  }).join('');

  const isActive = !!preset && preset.id === s.activePresetId;
  const activateBtn = $('#preset-activate-btn');
  if (activateBtn) {
    activateBtn.textContent = isActive ? '停用' : '启用';
    activateBtn.classList.toggle('is-on', isActive);
  }

  const nameInput = $('#preset-name-input');
  const descInput = $('#preset-desc-input');
  if (nameInput && document.activeElement !== nameInput) nameInput.value = preset?.name || '';
  if (descInput && document.activeElement !== descInput) descInput.value = preset?.description || '';

  if (countEl) {
    const active = state.activePreset();
    countEl.textContent = active
      ? `${s.presets.length} 个预设 · 启用中`
      : `${s.presets.length} 个预设 · 当前未启用`;
  }

  const list = $('#block-list');
  if (!preset) {
    list.innerHTML = '<div class="empty-inline">还没有预设，点右上角「新建」创建一个。</div>';
    return;
  }
  list.innerHTML = preset.blocks.map((b, i) => blockRow(b, i, preset)).join('');
  list.dataset.presetId = preset.id;

  const stat = $('#seq-stat');
  const est = estimatePreset(preset);
  if (stat) stat.textContent = `≈ ${est.tokens.toLocaleString('zh-CN')} tokens · ${est.chars.toLocaleString('zh-CN')} 字符`;

  const hint = $('#seq-hint');
  if (hint) {
    const order = presetOrderSummary(preset, 4).join(' → ');
    hint.textContent = order ? `顺序：${order}` : '';
  }
}

/** 估算该预设实际会发出的设定体量（系统提示词 + 历史底部规则 + 历史后指令） */
function estimatePreset(preset) {
  const settings = state.getState().settings;
  const char = state.activeCharacter();
  const plan = state.buildPresetPlanFor(preset, char, state.activeMessages(), '', settings);
  if (!plan) return { tokens: 0, chars: 0 };
  const sys = composePlanParts(plan, settings.promptCharLimit).join('\n\n');
  const depth = plan.depthRules.map(r => r.text).join('\n');
  const text = [sys, depth, plan.postHistory].filter(Boolean).join('\n\n');
  return { tokens: estimateTokens(text), chars: text.length };
}

function ruleCountForSlot(preset, slotKey) {
  const charId = state.getState().activeCharacterId;
  const buckets = state.activeRuleBuckets(charId);
  if (slotKey === 'rulesDefault') return buckets.charAfter;
  if (slotKey === 'rulesDepth') return buckets.depth;
  return [];
}

function blockRow(block, index, preset) {
  const def = storage.blockDef(block.key);
  const marker = !!def?.marker;
  const label = block.custom ? (block.label || block.key) : (def?.label || block.key);
  const cn = marker ? '规则片段落点' : (block.custom ? '自定义块' : (def?.cn || ''));
  const badge = block.custom ? '自定义' : (def?.badge || '内容');
  const open = ui.expanded.has(block.key);
  const key = escapeHTML(block.key);

  if (marker) {
    const rules = ruleCountForSlot(preset, block.key);
    const names = rules.map(r => r.name).join('、');
    return `
      <div class="block-row block-slot ${rules.length ? 'has-rules' : ''}" data-block-key="${key}" data-index="${index}" draggable="true" data-slot="${key}">
        <div class="block-row-main">
          <span class="block-grip" aria-hidden="true">⋮⋮</span>
          <div class="block-label">
            <div class="block-name">${escapeHTML(label)} <span class="block-badge">注入槽</span></div>
            <div class="block-cn">${rules.length ? `${rules.length} 条规则流入${names ? '：' + escapeHTML(brief(names, 24)) : ''}` : '把右侧规则卡片拖到这里'}</div>
          </div>
          <span class="slot-count">${rules.length}</span>
        </div>
      </div>`;
  }

  return `
    <div class="block-row ${block.enabled === false ? 'block-off' : ''} ${open ? 'is-open' : ''}" data-block-key="${key}" data-index="${index}" draggable="true">
      <div class="block-row-main">
        <span class="block-grip" aria-hidden="true">⋮⋮</span>
        <div class="block-label">
          <div class="block-name">${escapeHTML(label)} <span class="block-badge">${escapeHTML(badge)}</span></div>
          <div class="block-cn">${escapeHTML(cn)}${block.content ? ` · ${block.content.length} 字` : ''}</div>
        </div>
        <div class="block-tools">
          <button class="icon-btn xs" data-action="block-up" data-key="${key}" aria-label="上移 ${escapeHTML(label)}" title="上移"><span class="icon">${ICONS.up}</span></button>
          <button class="icon-btn xs" data-action="block-down" data-key="${key}" aria-label="下移 ${escapeHTML(label)}" title="下移"><span class="icon">${ICONS.down}</span></button>
          <button class="icon-btn xs" data-action="block-edit" data-key="${key}" aria-label="编辑 ${escapeHTML(label)}" aria-expanded="${open}" title="编辑内容"><span class="icon">${ICONS.edit}</span></button>
          <label class="switch" title="${block.enabled === false ? '点击启用' : '点击停用'}">
            <input type="checkbox" data-action="block-switch" data-key="${key}" ${block.enabled === false ? '' : 'checked'} aria-label="启用 ${escapeHTML(label)}">
            <span class="switch-track"></span>
          </label>
        </div>
      </div>
      <div class="block-editor" ${open ? '' : 'hidden'}>
        ${block.custom ? `<input class="form-input block-label-input" data-field="label" data-key="${key}" value="${escapeHTML(block.label || block.key)}" placeholder="块名称" aria-label="块名称">` : ''}
        <textarea class="form-textarea" data-field="content" data-key="${key}" rows="5" placeholder="${block.key === 'main' ? '主提示词，支持 {{char}} / {{user}} 宏' : '这块要注入的内容…'}">${escapeHTML(block.content || '')}</textarea>
        ${block.key === 'chatHistory' ? '<p class="block-tip">这块控制「是否携带历史消息」，内容留空即可；位置决定历史消息插在序列的哪里。</p>' : ''}
        ${block.key === 'chatExamples' || block.key === 'postHistory' ? '<p class="block-tip">每行一条示例：<code>user: …</code> / <code>char: …</code>。postHistory 会作为独立 system 消息放在历史之后。</p>' : ''}
      </div>
    </div>`;
}

/** 保存块字段（失焦时提交，避免每敲一个字就整页重渲染） */
function commitBlockField(key, field, value) {
  const preset = editingPreset();
  if (!preset) return;
  const blocks = preset.blocks.map(b => ({ ...b }));
  const block = blocks.find(b => b.key === key);
  if (!block) return;
  if (field === 'label') block.label = value;
  else block.content = value;
  const patch = { blocks };
  if (block.key === 'main') patch.mainPrompt = value;
  state.updatePreset(preset.id, patch);
}

function moveBlock(key, delta) {
  const preset = editingPreset();
  if (!preset) return;
  const blocks = preset.blocks.map(b => ({ ...b }));
  const index = blocks.findIndex(b => b.key === key);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= blocks.length) return;
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  state.updatePreset(preset.id, { blocks });
}

function reorderBlock(fromIndex, toIndex) {
  const preset = editingPreset();
  if (!preset) return;
  const blocks = preset.blocks.map(b => ({ ...b }));
  if (fromIndex === toIndex || fromIndex < 0 || fromIndex >= blocks.length) return;
  const [moved] = blocks.splice(fromIndex, 1);
  blocks.splice(toIndex > fromIndex ? toIndex - 1 : toIndex, 0, moved);
  state.updatePreset(preset.id, { blocks });
}

/** 把规则放进预设：设置注入位置并启用，让用户看到它真的流进了序列 */
function placeRule(ruleId, position) {
  const rule = state.setRulePosition(ruleId, position);
  if (!rule) return;
  toast(`「${rule.name}」已改为${storage.positionLabel(position)}注入`);
}

// ---- 规则片段库 ----
function renderRuleList() {
  const rules = state.viewScope().rules;
  const list = $('#rule-list');
  if (!list) return;

  const enabled = rules.filter(r => r.enabled).length;
  const inline = $('#rule-count-inline');
  if (inline) inline.textContent = `${rules.length} 条片段 · ${enabled} 条生效`;
  const header = $('#rule-count');
  if (header) header.textContent = `共 ${rules.length} 条规则 · 已启用 ${enabled} 条`;

  if (!rules.length) {
    list.innerHTML = `
      <div class="empty-state empty-inline-state">
        <div class="empty-mark"><span class="icon">${ICONS.book}</span></div>
        <div class="empty-title">片段库还是空的</div>
        <div class="empty-desc">载入 DeepSeek 4.1 Flash 推荐小说规则包，或新建一条自己的写作约束。</div>
        <div class="empty-actions">
          <button class="primary-btn" data-action="load-recommended"><span class="icon">${ICONS.plus}</span><span>载入推荐小说规则包</span></button>
          <button class="secondary-btn" data-action="new-rule">新建规则</button>
        </div>
      </div>`;
    return;
  }

  list.innerHTML = rules.map(rule => {
    const pos = storage.positionMeta(rule.position);
    const posText = rule.position === 'chat_history_bottom' ? `${pos.label} · D${rule.depth}` : pos.label;
    const scopeText = rule.scope === 'character' && rule.boundCharacterIds?.length
      ? `仅 ${rule.boundCharacterIds.length} 个角色`
      : '全局';
    const tokens = estimateTokens(rule.content);
    return `
      <article class="rule-card ${rule.enabled ? 'rule-on' : ''}" draggable="true" data-rule-id="${rule.id}" aria-label="${escapeHTML(rule.name)}">
        <div class="rule-head">
          <div class="rule-title-wrap">
            <div class="rule-name">
              ${escapeHTML(rule.name)}
              ${rule.builtin ? '<span class="rule-tag">内置</span>' : ''}
            </div>
            <div class="rule-badges">
              <span class="rule-chip">${escapeHTML(posText)}</span>
              <span class="rule-chip">${escapeHTML(scopeText)}</span>
              ${rule.enabled ? '<span class="rule-chip is-on">生效中</span>' : ''}
            </div>
          </div>
          <label class="switch" title="${rule.enabled ? '点击停用' : '点击启用'}">
            <input type="checkbox" data-action="toggle-rule" data-id="${rule.id}" ${rule.enabled ? 'checked' : ''} aria-label="启用 ${escapeHTML(rule.name)}">
            <span class="switch-track"></span>
          </label>
        </div>
        <p class="rule-preview">${escapeHTML(brief(rule.content))}</p>
        <div class="rule-foot">
          <span class="rule-meta">≈ ${tokens.toLocaleString('zh-CN')} tokens</span>
          <div class="rule-actions">
            <button class="icon-btn xs" data-action="rule-place" data-id="${rule.id}" aria-label="插入到当前预设" title="插入到当前预设"><span class="icon">${ICONS.plus}</span></button>
            <button class="icon-btn xs" data-action="edit-rule" data-id="${rule.id}" aria-label="编辑 ${escapeHTML(rule.name)}" title="编辑"><span class="icon">${ICONS.edit}</span></button>
            <button class="icon-btn xs" data-action="delete-rule" data-id="${rule.id}" aria-label="删除 ${escapeHTML(rule.name)}" title="删除"><span class="icon">${ICONS.trash}</span></button>
          </div>
        </div>
      </article>`;
  }).join('');
  paintIcons(list);
}

// ---- 提醒条 ----
function renderAlerts() {
  const host = $('#rules-alerts');
  if (!host) return;
  const s = state.getState();
  const rules = state.viewScope().rules;
  const enabledCount = rules.filter(r => r.enabled).length;
  const edits = state.configEditCount();
  const alerts = [];

  if (!state.activePreset()) {
    const fallback = s.presets.find(p => p.isDefault) || s.presets[0];
    alerts.push(`
      <div class="rules-alert" role="status">
        <span class="rules-alert-text">当前没有启用预设，请求会按默认拼接顺序发送</span>
        ${fallback ? `<button class="secondary-btn sm-btn" data-action="activate-preset" data-id="${fallback.id}">启用「${escapeHTML(fallback.name)}」</button>` : ''}
      </div>`);
  }

  const missing = state.missingRecommendedRules();
  if (!enabledCount) {
    alerts.push(`
      <div class="rules-alert" role="status">
        <span class="rules-alert-text">规则片段一条都没生效，文风与节奏只能靠角色设定</span>
        <button class="secondary-btn sm-btn" data-action="load-recommended">载入推荐小说规则包</button>
      </div>`);
  } else if (missing > 0) {
    alerts.push(`
      <div class="rules-alert" role="status">
        <span class="rules-alert-text">还有 ${missing} 条推荐规则未启用（共 ${storage.RECOMMENDED_RULE_IDS.length} 条）</span>
        <button class="secondary-btn sm-btn" data-action="load-recommended">一键补齐</button>
      </div>`);
  }

  if (edits >= 3) {
    alerts.push(`
      <div class="rules-alert alert-backup" role="status">
        <span class="rules-alert-text">规则与预设已改动 ${edits} 次，建议导出一份配置</span>
        <button class="secondary-btn sm-btn" data-action="export-config">导出配置</button>
      </div>`);
  }

  host.innerHTML = alerts.join('');
  const badge = $('#export-badge');
  if (badge) {
    badge.hidden = edits < 3;
    badge.textContent = String(edits);
    badge.title = `已改动 ${edits} 次，建议导出备份`;
  }
}

// ---- 渲染入口 ----
export function renderRules() {
  renderScopeBar('#rules-scope', 'rules');
  renderPresetPanel();
  renderRuleList();
  renderAlerts();
  applyTab(ui.tab);
}

function applyTab(tab) {
  ui.tab = tab;
  const bench = $('#rules-workbench');
  if (bench) bench.dataset.tab = tab;
  $$('.wb-tab').forEach(btn => {
    const on = btn.dataset.tab === tab;
    btn.classList.toggle('is-active', on);
    btn.setAttribute('aria-selected', on ? 'true' : 'false');
  });
}

// ---- 规则弹层 ----

function renderCharPicker(selected = []) {
  const host = $('#rule-char-picker');
  if (!host) return;
  const chars = state.getState().characters || [];
  if (!chars.length) {
    host.innerHTML = '<p class="form-help">还没有角色，先创建角色再绑定。</p>';
    return;
  }
  host.innerHTML = chars.map(c => `
    <label class="char-chip">
      <input type="checkbox" value="${c.id}" ${selected.includes(c.id) ? 'checked' : ''}>
      <span>${escapeHTML(c.name)}</span>
    </label>`).join('');
}

function syncPositionFields() {
  const position = $('#rule-position').value;
  const meta = storage.positionMeta(position);
  $('#rule-depth-group').hidden = !meta.hasDepth;
  $('#rule-position-help').textContent = meta.desc;
}

export function openRuleModal(id = null) {
  const form = $('#rule-form');
  form.reset();
  const rule = id ? state.viewScope().rules.find(r => r.id === id) : null;
  $('#rule-modal-title').textContent = rule ? '编辑规则' : '新建规则';
  $('#rule-id').value = rule?.id || '';
  $('#rule-name').value = rule?.name || '';
  $('#rule-content').value = rule?.content || '';
  $('#rule-position').value = rule?.position || 'after_char_desc';
  $('#rule-depth').value = rule?.depth ?? 0;
  $('#rule-depth-value').textContent = rule?.depth ?? 0;
  $('#rule-scope').value = rule?.scope || 'global';
  $('#rule-chars-group').hidden = ($('#rule-scope').value !== 'character');
  renderCharPicker(rule?.boundCharacterIds || []);
  syncPositionFields();
  $('#rule-modal').hidden = false;
  setTimeout(() => $('#rule-name').focus(), 50);
}

export function closeRuleModal() {
  $('#rule-modal').hidden = true;
}

// ---- 导入 / 导出 ----
let importMode = 'config';

function pickFile(mode) {
  importMode = mode;
  const input = $('#config-file');
  input.value = '';
  input.click();
}

async function readJSONFile(file) {
  const text = await file.text();
  return JSON.parse(text.replace(/^\uFEFF/, ''));
}

function exportConfig() {
  storage.downloadJSON(storage.buildConfigExport(state.getState()),
    `yetan-rules-${new Date().toISOString().slice(0, 10)}.json`);
  state.markConfigExported();
  renderAlerts();
  toast('规则配置已导出');
}

function exportPreset() {
  const preset = editingPreset();
  if (!preset) return;
  const safeName = (preset.name || 'preset').replace(/[\\/:*?"<>|]/g, '-');
  storage.downloadJSON(serializePreset(preset), `yetan-preset-${safeName}.json`);
  toast('当前预设已导出（SillyTavern 可读）');
}

async function handleImport(file) {
  if (!file) return;
  try {
    const raw = await readJSONFile(file);
    if (importMode === 'preset') {
      const parsed = parsePresetFile(raw);
      const preset = state.importPreset(parsed);
      setEditingPreset(preset.id);
      renderRules();
      toast(`已导入预设「${preset.name}」${parsed.warnings.length ? ' · ' + parsed.warnings[0] : ''}`);
      return;
    }
    const parsed = storage.parseConfigImport(raw);
    let presetCount = 0;
    for (const p of parsed.presets) {
      state.importPreset({
        name: p.name || '导入的预设',
        description: p.description || '',
        mainPrompt: p.mainPrompt || '',
        blocks: p.blocks || [],
      });
      presetCount += 1;
    }
    const ruleCount = state.importRules(parsed.rules);
    renderRules();
    toast(`导入完成：${presetCount} 个预设、${ruleCount} 条规则`);
  } catch (err) {
    toast(err?.message || '导入失败，请检查文件格式');
  }
}

// ---- 事件绑定 ----
export function initRules(confirmFn) {
  // 规则表单
  $('#rule-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const bound = $$('#rule-char-picker input:checked').map(el => el.value);
    const data = {
      name: fd.get('name'),
      content: fd.get('content'),
      position: fd.get('position'),
      depth: Number(fd.get('depth')) || 0,
      scope: fd.get('scope'),
      boundCharacterIds: bound,
    };
    const id = fd.get('id');
    if (id) state.updateRule(id, data);
    else state.addRule({ ...data, enabled: true });
    closeRuleModal();
    toast(id ? '规则已更新' : '规则已创建');
  });

  $('#rule-position').addEventListener('change', syncPositionFields);
  $('#rule-depth').addEventListener('input', (e) => {
    $('#rule-depth-value').textContent = e.target.value;
  });
  $('#rule-scope').addEventListener('change', (e) => {
    $('#rule-chars-group').hidden = e.target.value !== 'character';
  });

  // 预设下拉切换
  $('#preset-select').addEventListener('change', (e) => setEditingPreset(e.target.value));

  // 预设名称 / 说明（失焦提交，避免打断输入）
  $('#preset-name-input').addEventListener('change', (e) => {
    const preset = editingPreset();
    if (!preset) return;
    state.updatePreset(preset.id, { name: e.target.value });
  });
  $('#preset-desc-input').addEventListener('change', (e) => {
    const preset = editingPreset();
    if (!preset) return;
    state.updatePreset(preset.id, { description: e.target.value });
  });

  $('#config-file').addEventListener('change', (e) => handleImport(e.target.files?.[0]));

  // 块列表：点击 / 输入 / 键盘
  const blockList = $('#block-list');
  blockList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const key = btn.dataset.key;
    const action = btn.dataset.action;
    if (action === 'block-edit') {
      const row = btn.closest('.block-row');
      const editor = row.querySelector('.block-editor');
      const open = editor.hidden;
      editor.hidden = !open;
      row.classList.toggle('is-open', open);
      if (open) ui.expanded.add(key);
      else ui.expanded.delete(key);
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) editor.querySelector('textarea, input')?.focus();
    } else if (action === 'block-up') {
      moveBlock(key, -1);
    } else if (action === 'block-down') {
      moveBlock(key, 1);
    }
  });

  blockList.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.action === 'block-switch') {
      const preset = editingPreset();
      if (!preset) return;
      const blocks = preset.blocks.map(b => (b.key === el.dataset.key ? { ...b, enabled: el.checked } : b));
      state.updatePreset(preset.id, { blocks });
    } else if (el.dataset.field) {
      commitBlockField(el.dataset.key, el.dataset.field, el.value);
    }
  });

  // ---- 拖拽：块排序 ----
  let draggingIndex = -1;
  blockList.addEventListener('dragstart', (e) => {
    const row = e.target.closest('.block-row');
    if (!row) return;
    draggingIndex = Number(row.dataset.index);
    row.classList.add('is-dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `block:${draggingIndex}`);
  });
  blockList.addEventListener('dragend', () => {
    draggingIndex = -1;
    $$('#block-list .block-row').forEach(r => r.classList.remove('is-dragging', 'drop-before', 'drop-after'));
  });
  blockList.addEventListener('dragover', (e) => {
    const row = e.target.closest('.block-row');
    if (!row) return;
    const payload = e.dataTransfer.types.includes('text/plain');
    if (!payload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = draggingIndex >= 0 ? 'move' : 'copy';
    const rect = row.getBoundingClientRect();
    const before = e.clientY - rect.top < rect.height / 2;
    $$('#block-list .block-row').forEach(r => r.classList.remove('drop-before', 'drop-after'));
    row.classList.add(before ? 'drop-before' : 'drop-after');
  });
  blockList.addEventListener('dragleave', (e) => {
    if (e.target.closest('.block-row')) return;
    $$('#block-list .block-row').forEach(r => r.classList.remove('drop-before', 'drop-after'));
  });
  blockList.addEventListener('drop', (e) => {
    e.preventDefault();
    const row = e.target.closest('.block-row');
    const raw = e.dataTransfer.getData('text/plain') || '';
    const rect = row?.getBoundingClientRect();
    const before = row && rect ? (e.clientY - rect.top < rect.height / 2) : true;

    if (raw.startsWith('rule:')) {
      const ruleId = raw.slice(5);
      const slotKey = row?.dataset.slot;
      placeRule(ruleId, slotKey === 'rulesDepth' ? 'chat_history_bottom' : 'after_char_desc');
      return;
    }
    if (raw.startsWith('block:') && row) {
      const from = Number(raw.slice(6));
      const to = Number(row.dataset.index) + (before ? 0 : 1);
      reorderBlock(from, to);
    }
  });

  // 规则库：整条列表的点击与拖拽
  const ruleList = $('#rule-list');
  ruleList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const id = btn.dataset.id || btn.closest('[data-rule-id]')?.dataset.ruleId;
    if (btn.dataset.action === 'rule-place') {
      placeRule(id, 'after_char_desc');
    } else if (btn.dataset.action === 'edit-rule') {
      openRuleModal(id);
    } else if (btn.dataset.action === 'delete-rule') {
      const rule = state.viewScope().rules.find(r => r.id === id);
      if (!rule) return;
      confirmFn?.('删除规则', `确定删除「${rule.name}」吗？此操作无法撤销。`, () => state.deleteRule(id), '删除');
    }
  });
  ruleList.addEventListener('change', (e) => {
    const el = e.target.closest('[data-action="toggle-rule"]');
    if (el) state.toggleRule(el.dataset.id);
  });
  ruleList.addEventListener('dragstart', (e) => {
    const card = e.target.closest('[data-rule-id]');
    if (!card) return;
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('text/plain', `rule:${card.dataset.ruleId}`);
    card.classList.add('is-dragging');
  });
  ruleList.addEventListener('dragend', (e) => {
    e.target.closest('[data-rule-id]')?.classList.remove('is-dragging');
  });

  // 页面级动作（只处理规则书页自己的按钮）
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    const id = btn.dataset.id;
    switch (action) {
      case 'wb-tab':
        applyTab(btn.dataset.tab);
        break;
      case 'new-preset': {
        const preset = state.addPreset({ name: `新预设 ${state.getState().presets.length + 1}`, blocks: [] });
        setEditingPreset(preset.id);
        renderAlerts();
        toast('已创建预设，可直接编辑');
        break;
      }
      case 'duplicate-preset': {
        const preset = editingPreset();
        if (!preset) break;
        const copy = state.duplicatePreset(preset.id);
        if (copy) { setEditingPreset(copy.id); toast('已复制为新预设'); }
        break;
      }
      case 'delete-preset': {
        const preset = editingPreset();
        if (!preset) break;
        if (preset.builtin) { toast('内置预设不能删除，可以复制一份再改'); break; }
        confirmFn?.('删除预设', `确定删除「${preset.name}」吗？此操作无法撤销。`, () => {
          state.deletePreset(preset.id);
          ui.editingId = null;
          renderRules();
        }, '删除');
        break;
      }
      case 'toggle-active-preset': {
        const preset = editingPreset();
        if (!preset) break;
        const isActive = preset.id === state.getState().activePresetId;
        state.selectPreset(isActive ? null : preset.id);
        renderAlerts();
        toast(isActive ? '已停用预设' : `已启用「${preset.name}」`);
        break;
      }
      case 'activate-preset':
        state.selectPreset(id);
        renderAlerts();
        break;
      case 'load-recommended': {
        const r = state.enableRecommendedRules();
        renderRules();
        if (!r.missing && !r.added) toast('推荐规则已全部启用');
        else if (r.added) toast(`已补回 ${r.added} 条推荐规则，并全部启用`);
        else toast(`已启用 ${r.enabled} 条推荐规则`);
        break;
      }
      case 'new-rule':
        openRuleModal();
        break;
      case 'open-preview':
        openPreview({ preset: editingPreset() });
        break;
      case 'export-config':
        exportConfig();
        break;
      case 'export-preset':
        exportPreset();
        break;
      case 'import-preset':
        pickFile('preset');
        break;
      case 'import-config':
        pickFile('config');
        break;
    }
  });
}
