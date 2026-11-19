// settings.js — 设置页
import * as state from '../state.js';
import * as storage from '../storage.js';
import { buildSystem, estimateTokens, testConnection, composePlanParts, historyLimit } from '../api.js';

const $ = (sel) => document.querySelector(sel);

/** 用量预设：省流 / 均衡 / 完整。只改与输入 token 直接相关的参数。 */
const PRESETS = {
  economy: { label: '省流', historyTurns: 6, contextLimit: 8, historyCharLimit: 1200, worldEntryLimit: 1, promptCharLimit: 1200, maxTokens: 1024 },
  balanced: { label: '均衡', historyTurns: 30, contextLimit: 20, historyCharLimit: 4000, worldEntryLimit: 3, promptCharLimit: 4000, maxTokens: 0 },
  full: { label: '完整', historyTurns: 0, contextLimit: 100, historyCharLimit: 0, worldEntryLimit: 0, promptCharLimit: 0, maxTokens: 0 },
};

const BUDGET_KEYS = ['historyTurns', 'contextLimit', 'historyCharLimit', 'worldEntryLimit', 'promptCharLimit', 'maxTokens'];

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
  const buckets = state.activeRuleBuckets(char.id);
  const world = state.activeWorldText(state.activeMessages(), '', settings.worldEntryLimit, char.id).text;
  const plan = state.buildPresetPlan(char, state.activeMessages(), '', settings);
  const sys = plan
    ? composePlanParts(plan, settings.promptCharLimit).join('\n\n')
    : buildSystem(char, buckets, settings, world, state.activePresetText(char));
  // 历史底部的规则是以独立 system 消息注入的，也要算进设定开销
  const depthRules = plan ? (plan.depthRules || []) : (buckets.depth || []);
  const depthText = depthRules.map(r => r.text).join('\n');

  let recent = state.activeMessages().filter(m => m.status !== 'error' && m.content)
    .slice(-historyLimit(settings));
  const charLimit = Math.max(0, Number(settings.historyCharLimit) || 0);
  if (charLimit > 0) {
    const total = () => recent.reduce((n, m) => n + String(m.content || '').length, 0);
    while (recent.length > 1 && total() > charLimit) recent.shift();
  }
  const histChars = recent.reduce((n, m) => n + String(m.content || '').length, 0);
  const sysChars = sys.length + depthText.length;
  const sysTokens = estimateTokens(sys) + estimateTokens(depthText);
  const histTokens = estimateTokens(recent.map(m => m.content).join('\n'));
  $('#usage-estimate').textContent =
    `当前配置：设定约 ${sysChars} 字符 / ≈${sysTokens} tokens · 历史约 ${histChars} 字符 / ≈${histTokens} tokens（不含本次输入）。这是本地粗估，实际扣费以 API 返回的 usage 为准。`;
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

let connController = null;
let connTimer = null;
/** 连通性测试的硬超时：部分网络会长时间挂住，不主动 abort 会一直卡在「测试中…」 */
const CONN_TIMEOUT_MS = 10000;

/** 读取表单里当前的 API 参数（尚未保存也能测） */
function currentApiSettings() {
  return {
    baseURL: ($('#setting-baseurl').value || '').trim(),
    apiKey: ($('#setting-apikey').value || '').trim(),
    model: ($('#setting-model').value || '').trim(),
  };
}

function showConn(html) {
  const box = $('#conn-result');
  box.hidden = false;
  box.innerHTML = html;
}

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function runConnectionTest() {
  if (connController) return; // 测试中
  const btn = $('#test-conn-btn');
  btn.disabled = true;
  btn.querySelector('span:last-child').textContent = '测试中…';
  showConn('<div class="conn-line conn-busy"><span class="spinner"></span>正在测试连接…</div>');

  const controller = new AbortController();
  connController = controller;
  connTimer = setTimeout(() => controller.abort(), CONN_TIMEOUT_MS);
  const started = Date.now();
  try {
    const result = await testConnection(currentApiSettings(), controller.signal);
    const ms = result.latencyMs || (Date.now() - started);
    if (result.ok) {
      const models = result.models || [];
      let modelsHTML = '';
      if (models.length) {
        const shown = models.slice(0, 12);
        modelsHTML = '<div class="conn-models-title">检测到的模型（点击填入上面的模型框）</div><div class="conn-models">' +
          shown.map(m => `<button type="button" class="conn-model-chip" data-action="pick-model" data-model="${escapeHTML(m)}">${escapeHTML(m)}</button>`).join('') +
          (models.length > shown.length ? `<span class="conn-more">…另有 ${models.length - shown.length} 个</span>` : '') +
          '</div>';
      }
      showConn(
        `<div class="conn-line conn-ok"><span class="conn-dot"></span><span>${escapeHTML(result.message)}</span><span class="conn-ms">${ms} ms</span></div>` +
        `<div class="conn-sub">验证方式：${result.method === 'models' ? 'GET /v1/models（未消耗 token）' : '最小聊天请求（约 1 token）'}</div>` + modelsHTML
      );
    } else {
      const tips = {
        no_key: '在上方填写 API Key 后再测试。',
        bad_key: 'API 密钥应填在「API Key」框，API 地址填在「API 地址」框。',
        bad_url: '填写 OpenAI 兼容的根地址，例如 https://api.deepseek.com 或 https://api.openai.com/v1。',
        auth: '检查密钥是否正确、是否过期，以及是否选对了服务商。',
        quota: '账户余额不足或触发限流，请充值或稍后再试。',
        network: '检查网络、代理或防火墙；国内访问部分海外 API 可能需要代理。',
        timeout: '服务端长时间未响应，检查地址是否正确或换网络重试。',
        http: '服务端返回了错误，可看下方说明调整地址或参数。',
      };
      showConn(
        `<div class="conn-line conn-fail"><span class="conn-dot"></span><span>${escapeHTML(result.message)}</span><span class="conn-ms">${ms} ms</span></div>` +
        `<div class="conn-sub">${escapeHTML(tips[result.kind] || '请检查 API 配置。')}</div>`
      );
    }
  } catch (err) {
    showConn(`<div class="conn-line conn-fail"><span class="conn-dot"></span>${escapeHTML(err?.message || '测试失败')}</div>`);
  } finally {
    clearTimeout(connTimer);
    connTimer = null;
    if (connController === controller) connController = null;
    btn.disabled = false;
    btn.querySelector('span:last-child').textContent = '测试连接';
  }
}

export function renderSettings() {
  const s = state.getState().settings;
  $('#setting-baseurl').value = s.baseURL;
  $('#setting-apikey').value = s.apiKey;
  $('#setting-model').value = s.model;
  $('#setting-temp').value = s.temperature;
  $('#temp-value').textContent = Number(s.temperature).toFixed(2);
  $('#setting-topp').value = s.topP ?? 1;
  $('#topp-value').textContent = Number(s.topP ?? 1).toFixed(2);
  $('#setting-maxtokens').value = s.maxTokens || '';
  $('#setting-history-turns').value = s.historyTurns ?? 30;
  $('#setting-auto-summary').checked = s.autoSummary !== false;
  $('#setting-context').value = s.contextLimit;
  $('#context-value').textContent = s.contextLimit;
  $('#setting-stream').checked = s.stream !== false;
  $('#setting-chat-bg').checked = s.chatBackground !== false;
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
  $('#setting-temp').addEventListener('input', (e) => { $('#temp-value').textContent = Number(e.target.value).toFixed(2); });
  $('#setting-topp').addEventListener('input', (e) => { $('#topp-value').textContent = Number(e.target.value).toFixed(2); });
  $('#setting-context').addEventListener('input', (e) => { $('#context-value').textContent = e.target.value; });

  $('#settings-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const temp = Math.min(5, Math.max(0, Number(fd.get('temperature')) || 0));
    const topP = Math.min(1, Math.max(0, Number(fd.get('topP')) || 0));
    const context = clampInt(fd.get('contextLimit'), 1, 500, 20);
    const historyTurns = clampInt(fd.get('historyTurns'), 0, 200, 30);
    const maxTokensRaw = Number(fd.get('maxTokens'));
    const maxTokens = Number.isFinite(maxTokensRaw) && maxTokensRaw > 0 ? Math.min(32000, Math.floor(maxTokensRaw)) : 0;
    const budget = {
      historyTurns,
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
      historyTurns,
      contextLimit: context,
      autoSummary: fd.get('autoSummary') === 'on',
      stream: fd.get('stream') === 'on',
      chatBackground: fd.get('chatBackground') === 'on',
      includeUsage: fd.get('includeUsage') === 'on',
      systemPrefix: (fd.get('systemPrefix') || '').trim(),
      systemSuffix: (fd.get('systemSuffix') || '').trim(),
      ...budget,
      usagePreset: matchPreset(budget),
    });
    renderSettings();
    note('设置已保存');
  });

  // 导入整库备份：解析 → 确认 → 覆盖运行时状态
  const backupInput = $('#backup-file');
  backupInput?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const next = storage.parseBackupFile(JSON.parse(text));
      confirmFn?.(
        '导入备份',
        `将用这份备份替换当前全部数据（${next.characters.length} 个角色、${next.presets.length} 套预设、${next.rules.length} 条规则）。当前内容不会保留，建议先导出。`,
        () => {
          state.applyBackup(next);
          renderSettings();
          note('备份已导入');
        },
        '覆盖导入'
      );
    } catch (err) {
      note(err?.message || '备份文件读取失败');
    }
  });

  document.addEventListener('click', (e) => {
    const actionEl = e.target.closest('[data-action]');
    if (!actionEl) return;
    const action = actionEl.dataset.action;
    if (action === 'test-connection') {
      runConnectionTest();
    } else if (action === 'pick-model') {
      $('#setting-model').value = actionEl.dataset.model || '';
      note(`已选择模型：${actionEl.dataset.model}`);
    } else if (action === 'usage-preset') {
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
    } else if (action === 'import-data') {
      $('#backup-file').click();
    } else if (action === 'clear-data') {
      confirmFn('清空所有数据', '这将删除全部角色、规则书、世界书、对话记录和设置，且无法恢复。建议先导出备份。', () => {
        storage.clear();
        location.reload();
      });
    }
  });
}
