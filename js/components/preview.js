// preview.js — 「最终 Context」预览（Dry Run）：不发送请求，只把真正会上送的消息拼出来
import { assembleMessages, estimateTokens } from '../api.js';
import * as state from '../state.js';

const $ = (sel) => document.querySelector(sel);

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** 用一条占位输入预览末尾的拼接效果，而不是真的把用户的话塞进历史 */
const SAMPLE_INPUT = '（你的下一条输入会出现在这里）';

const ROLE_LABEL = { system: 'system', user: 'user', assistant: '助手' };

export function openPreview({ preset = null } = {}) {
  const root = $('#prompt-preview');
  if (!root) return;
  const s = state.getState();
  const settings = s.settings;
  const char = state.activeCharacter();
  const history = state.activeMessages().slice();

  if (!char) {
    $('#preview-sub').textContent = '还没有角色';
    $('#preview-summary').innerHTML = '';
    $('#preview-warnings').hidden = true;
    $('#preview-messages').innerHTML = '<div class="empty-inline">先在「角色」页创建一个角色，预览才有内容可拼。</div>';
    root.hidden = false;
    return;
  }

  const plan = state.buildPresetPlanFor(preset, char, history, SAMPLE_INPUT, settings);
  const buckets = state.activeRuleBuckets(char.id);
  const world = state.activeWorldText(history, SAMPLE_INPUT, settings.worldEntryLimit, char.id).text;
  const messages = assembleMessages(
    char, history, SAMPLE_INPUT, settings.contextLimit || 20,
    buckets, settings, world, state.activePresetText(char), plan,
  );

  const perMessage = messages.map(m => ({ ...m, tokens: estimateTokens(m.content) }));
  const total = perMessage.reduce((n, m) => n + m.tokens, 0);
  const sysTokens = perMessage.filter(m => m.role === 'system').reduce((n, m) => n + m.tokens, 0);
  const historyCount = perMessage.filter(m => m.role !== 'system').length;

  $('#preview-sub').textContent = plan
    ? `预设「${preset?.name || plan.presetName}」· ${char.name} · 共 ${perMessage.length} 条消息`
    : `未启用预设 · ${char.name} · 共 ${perMessage.length} 条消息（默认拼接顺序）`;

  $('#preview-summary').innerHTML = [
    ['消息条数', String(perMessage.length)],
    ['预估输入 token', total.toLocaleString('zh-CN')],
    ['其中设定', sysTokens.toLocaleString('zh-CN')],
    ['对话轮次', String(historyCount)],
  ].map(([label, value]) => `
    <div class="prev-stat">
      <span class="prev-stat-label">${label}</span>
      <span class="prev-stat-value">${value}</span>
    </div>`).join('');

  // ---- 提示与告警 ----
  const warnings = [];
  if (!plan) {
    warnings.push(['info', '没有启用预设，这段内容按默认顺序拼接（系统顶部规则 → 前缀 → 主提示词 → 角色 → 世界书与规则 → 后缀）。']);
  } else {
    const depth = plan.depthRules || [];
    if (depth.length) {
      const names = depth.map(r => `「${r.name}」`).join('、');
      warnings.push(['info', `${names} 作为独立 system 消息插在历史底部（Depth ${depth.map(r => r.depth).join('/')}），不占系统提示词。`]);
    }
    const ruleTotal = (plan.rulesInSystem || []).length + depth.length;
    if (!ruleTotal) warnings.push(['warn', '当前没有任何规则片段生效，文风与节奏完全依赖角色设定。']);
    if (!plan.postHistory && plan.blockOrder?.includes('postHistory')) {
      warnings.push(['info', '「历史后指令」块已启用但内容为空，不会额外发送消息。']);
    }
  }
  const truncated = perMessage.some(m => m.content.includes('（部分设定因字符预算已省略）'));
  if (truncated) {
    warnings.push(['warn', '部分世界书 / 规则因「提示词字符预算」被裁剪，可在设置页调大上限。']);
  }
  const budget = Number(settings.promptCharLimit) || 0;
  if (!budget) warnings.push(['info', '提示词字符预算为 0（不限制），设定体量会随规则增多而线性增长。']);

  const warnBox = $('#preview-warnings');
  warnBox.hidden = !warnings.length;
  warnBox.innerHTML = warnings.map(([kind, text]) => `
    <div class="prev-warn prev-warn-${kind}"><span class="prev-warn-dot"></span><span>${escapeHTML(text)}</span></div>`).join('');

  $('#preview-messages').innerHTML = perMessage.map((m, i) => `
    <article class="prev-msg" data-role="${m.role}">
      <div class="prev-msg-head">
        <span class="prev-role">${ROLE_LABEL[m.role] || m.role}</span>
        <span class="prev-idx">#${i + 1}</span>
        <span class="prev-tokens">≈ ${m.tokens.toLocaleString('zh-CN')} tokens</span>
      </div>
      <pre class="prev-msg-body">${escapeHTML(m.content)}</pre>
    </article>`).join('');

  root.hidden = false;
  const panel = root.querySelector('.preview-panel');
  panel.scrollTop = 0;
}

export function closePreview() {
  const root = $('#prompt-preview');
  if (root) root.hidden = true;
}

export function initPreview() {
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    const root = $('#prompt-preview');
    if (root && !root.hidden) { closePreview(); e.stopPropagation(); }
  });
  const root = $('#prompt-preview');
  root?.addEventListener('click', (e) => {
    if (e.target.closest('[data-action="close-preview"]')) closePreview();
  });
}
