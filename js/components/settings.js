// settings.js — 设置页
import * as state from '../state.js';
import * as storage from '../storage.js';
import { buildSystem, estimateTokens } from '../api.js';

const $ = (sel) => document.querySelector(sel);

/** 用量预设：省流 / 均衡 / 完整。只改与输入 token 直接相关的参数。 */
const PRESETS = {
  economy: { label: '省流', contextLimit: 8, historyCharLimit: 1200, worldEntryLimit: 1, promptCharLimit: 1200, maxTokens: 1024 },
  balanced: { label: '均衡', contextLimit: 20, historyCharLimit: 4000, worldEntryLimit: 3, promptCharLimit: 4000, maxTokens: 0 },
  full: { label: '完整', contextLimit: 100, historyCharLimit: 0, worldEntryLimit: 0, promptCharLimit: 0, maxTokens: 0 },
};

const BUDGET_KEYS = ['contextLimit', 'historyCharLimit', 'worldEntryLimit', 'promptCharLimit', 'maxTokens'];

function clampInt(raw, min, max, fallback) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
}

function matchPreset(values) {
  for (const [name, preset] of Object.entries(PRESETS)) {
    if (BUDGET_KEYS.every(k => values[k] === preset[k])) return name;
  }
  return 'custom';
}

function note(msg) {
  const el = $('#save-note');
  el.textContent = msg;
  clearTimeout(note._t);
  note._t = setTimeout(() => { el.textContent = ''; }, 2400);
}

/** 按当前配置估算实际会发送的 system 与历史字符数，与 api.js 的裁剪逻辑一致 */
function updateEstimate() {
  const s = state.getState();
  const settings = s.settings;
  const char = state.activeCharacter() || { systemPrompt: '' };
  const world = state.activeWorldText(state.activeMessages(), '', settings.worldEntryLimit).text;
  const plan = state.buildPresetPlan(char, state.activeMessages(), '', settings);
  const sys = plan
    ? plan.systemParts.map(p => p.text).join('\n\n')
    : buildSystem(char, state.activeRulesText(), settings, world, state.activePresetText(char));

  let recent = state.activeMessages().filter(m => m.status !== 'error' && m.content)
    .slice(-Math.max(1, settings.contextLimit || 20));
  const charLimit = Math.max(0, Number(settings.historyCharLimit) || 0);
  if (charLimit > 0) {
    const total = () => recent.reduce((n, m) => n + String(m.content || '').length, 0);
    while (recent.length > 1 && total() > charLimit) recent.shift();
  }
  const histChars = recent.reduce((n, m) => n + String(m.content || '').length, 0);
  const sysTokens = estimateTokens(sys);
  const histTokens = estimateTokens(recent.map(m => m.content).join('\n'));
  $('#usage-estimate').textContent =
    `当前配置：设定约 ${sys.length} 字符 / ≈${sysTokens} tokens · 历史约 ${histChars} 字符 / ≈${histTokens} tokens（不含本次输入）。这是本地粗估，实际扣费以 API 返回的 usage 为准。`;
}

/** 展示 API 返回的真实用量 */
function renderTokenStats() {
  const u = state.getState().usage || {};
  const num = (n) => Number(n || 0).toLocaleString('zh-CN');
  const grid = $('#token-grid');
  if (!grid) return;
  const cards = [
    ['请求次数', num(u.requests), '次'],
    ['输入 token', num(u.promptTokens), ''],
    ['输出 token', num(u.completionTokens), ''],
    ['合计 token', num(u.totalTokens), ''],
  ];
  grid.innerHTML = cards.map(([label, value, unit]) =>
    `<div class="token-card"><div class="token-label">${label}</div><div class="token-value">${value}<span class="token-unit">${unit}</span></div></div>`
  ).join('');

  const days = Object.entries(u.days || {}).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
  $('#token-days').innerHTML = days.length
    ? '<div class="token-days-title">最近使用</div>' + days.map(([day, v]) =>
      `<div class="token-day"><span>${day}</span><span>${num(v.totalTokens)} tokens · ${num(v.requests)} 次</span></div>`).join('')
    : '<p class="form-help">还没有记录。发送一条消息后，这里会显示 API 返回的真实 token 数。</p>';
}

export function renderSettings() {
  const s = state.getState().settings;
  $('#setting-baseurl').value = s.baseURL;
  $('#setting-apikey').value = s.apiKey;
  $('#setting-model').value = s.model;
  $('#setting-temp').value = s.temperature;
  $('#temp-value').textContent = Number(s.temperature).toFixed(1);
  $('#setting-topp').value = s.topP ?? 1;
  $('#topp-value').textContent = Number(s.topP ?? 1).toFixed(2);
  $('#setting-maxtokens').value = s.maxTokens || '';
  $('#setting-context').value = s.contextLimit;
  $('#context-value').textContent = s.contextLimit;
  $('#setting-stream').checked = s.stream !== false;
  $('#setting-include-usage').checked = s.includeUsage !== false;
  $('#setting-prefix').value = s.systemPrefix || '';
  $('#setting-suffix').value = s.systemSuffix || '';
  $('#setting-history-char').value = s.historyCharLimit ?? 0;
  $('#setting-world-limit').value = s.worldEntryLimit ?? 3;
  $('#setting-prompt-char').value = s.promptCharLimit ?? 0;
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.preset === s.usagePreset);
  });
  updateEstimate();
  renderTokenStats();
}

function applyPreset(name) {
  const preset = PRESETS[name];
  if (!preset) return;
  const patch = {};
  for (const k of BUDGET_KEYS) patch[k] = preset[k];
  patch.usagePreset = name;
  state.updateSettings(patch);
  renderSettings();
  note(`已切换到「${preset.label}」档`);
}

export function initSettings(confirmFn) {
  $('#setting-temp').addEventListener('input', (e) => { $('#temp-value').textContent = Number(e.target.value).toFixed(1); });
  $('#setting-topp').addEventListener('input', (e) => { $('#topp-value').textContent = Number(e.target.value).toFixed(2); });
  $('#setting-context').addEventListener('input', (e) => { $('#context-value').textContent = e.target.value; });

  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const temp = Math.min(5, Math.max(0, Number(fd.get('temperature')) || 0));
    const topP = Math.min(1, Math.max(0, Number(fd.get('topP')) || 0));
    const context = clampInt(fd.get('contextLimit'), 1, 500, 20);
    const maxTokensRaw = Number(fd.get('maxTokens'));
    const maxTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.min(32000, Math.floor(maxTokensRaw)) : 0;
    const budget = {
      contextLimit: context,
      historyCharLimit: clampInt(fd.get('historyCharLimit'), 0, 200000, 0),
      worldEntryLimit: clampInt(fd.get('worldEntryLimit'), 0, 50, 0),
      promptCharLimit: clampInt(fd.get('promptCharLimit'), 0, 100000, 0),
      maxTokens,
    };
    state.updateSettings({
      baseURL: (fd.get('baseURL') || '').trim() || 'https://api.deepseek.com',
      apiKey: (fd.get('apiKey') || '').trim(),
      model: (fd.get('model') || '').trim() || 'deepseek-chat',
      temperature: temp,
      topP,
      maxTokens,
      contextLimit: context,
      stream: fd.get('stream') === 'on',
      includeUsage: fd.get('includeUsage') === 'on',
      systemPrefix: (fd.get('systemPrefix') || '').trim(),
      systemSuffix: (fd.get('systemSuffix') || '').trim(),
      ...budget,
      usagePreset: matchPreset(budget),
    });
    renderSettings();
    note('设置已保存');
  });

  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'usage-preset') {
      applyPreset(actionEl.dataset.preset);
    } else if (action === 'export-data') {
      const includeKey = window.confirm('导出的备份是否包含 API Key？\n\n选择「取消」将脱敏导出（推荐），选择「确定」则包含密钥，请妥善保管文件。');
      storage.exportData(state.getState(), includeKey);
      note('备份已导出');
    } else if (action === 'reset-usage') {
      confirmFn?.('清零 Token 统计', '只清除用量统计数字，不影响角色、对话和设置。确定继续？', () => {
        state.resetUsage();
        renderTokenStats();
        note('统计已清零');
      }, '清零');
    } else if (action === 'clear-data') {
      confirmFn('清空所有数据', '这将删除全部角色、规则书、世界书、对话记录和设置，且无法恢复。建议先导出备份。', () => {
        storage.clear();
        location.reload();
      });
    }
  });
}
