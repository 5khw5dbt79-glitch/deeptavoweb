// scope.js — 规则书 / 世界书页顶部的「设定范围」切换条
// 每个角色可以拥有一整套自己的规则书 + 世界书 + 主角 + 记忆；通用设定只作模板与回落。
import * as state from '../state.js';

const $ = (sel) => document.querySelector(sel);

let confirmFnRef = null;

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 由 app.js 注入确认弹层，用于「恢复跟随通用」这种不可撤销操作 */
export function initScope(confirmFn) {
  confirmFnRef = confirmFn;
}

/**
 * 渲染作用域条。hostSel 是页面里的容器，page 用于生成唯一 id。
 */
export function renderScopeBar(hostSel, page) {
  const host = $(hostSel);
  if (!host) return;

  const s = state.getState();
  const chars = s.characters || [];
  const target = state.editScopeTarget();
  const current = target ? chars.find(c => c.id === target) || null : null;
  const view = state.viewScope();

  if (!chars.length) {
    host.innerHTML = '<div class="scope-bar"><p class="scope-note">还没有角色。这里的设定会作为「通用模板」，新建角色时整套复制过去。</p></div>';
    return;
  }

  const options = [
    `<option value="__global__"${target === null ? ' selected' : ''}>通用设定（模板）</option>`,
    ...chars.map(c => `<option value="${escapeHTML(c.id)}"${c.id === target ? ' selected' : ''}>${escapeHTML(c.name)}${c.scoped ? ' · 独立' : ''}</option>`),
  ].join('');

  let note;
  if (!current) note = '所有角色共用的模板：新建角色会复制一份，未独立的角色也继续用它。';
  else if (view.independent) note = `「${current.name}」的独立设定：这里改的任何内容都只影响它。`;
  else note = `「${current.name}」正在跟随通用模板：第一次修改会自动复制一整套独立设定给它。`;

  host.innerHTML = `
    <div class="scope-bar">
      <div class="scope-row">
        <label class="scope-label" for="scope-select-${page}">设定范围</label>
        <select class="form-select scope-select" id="scope-select-${page}" data-scope-select>
          ${options}
        </select>
        <div class="scope-actions">
          ${current && !view.independent ? '<button class="secondary-btn sm-btn" data-scope-action="fork">改为独立</button>' : ''}
          ${current && view.independent ? '<button class="secondary-btn sm-btn" data-scope-action="reset">恢复跟随通用</button>' : ''}
        </div>
      </div>
      <p class="scope-note">${escapeHTML(note)}</p>
    </div>`;
}

// 作用域切换与两个按钮：用模块级委托，避免每页重复绑定
document.addEventListener('change', (e) => {
  const sel = e.target.closest('[data-scope-select]');
  if (!sel) return;
  state.setEditScope(sel.value === '__global__' ? null : sel.value);
});

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-scope-action]');
  if (!btn) return;
  const target = state.editScopeTarget();
  if (!target) return;

  if (btn.dataset.scopeAction === 'fork') {
    state.forkScope(target);
  } else if (btn.dataset.scopeAction === 'reset') {
    const name = state.viewScope().characterName || '该角色';
    confirmFnRef?.('恢复跟随通用',
      `「${name}」专属的规则书、世界书、主角与记忆将被丢弃，改为跟随通用设定。此操作无法撤销。`,
      () => state.resetScope(target), '恢复');
  }
});
