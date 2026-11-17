// api.js — OpenAI 兼容（DeepSeek 默认）流式/非流式请求
export class APIError extends Error {
  constructor(message, kind = 'unknown') {
    super(message);
    this.kind = kind;
  }
}

/**
 * 本地粗略 token 估算：CJK 字符按 1 token，其余字符按 0.3 token 计。
 * 只用于发送前预估显示，实际用量以 API 返回的 usage 为准。
 */
export function estimateTokens(text = '') {
  const str = String(text || '');
  let cjk = 0;
  let other = 0;
  for (const ch of str) {
    if (/[\u3400-\u9fff\uf900-\ufaff\u3040-\u30ff\uac00-\ud7af]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return Math.ceil(cjk + other * 0.3);
}

/** 从 API 响应中提取 usage，兼容 OpenAI / DeepSeek 常见字段命名 */
export function normalizeUsage(raw) {
  const pick = (...keys) => {
    for (const key of keys) {
      const value = Number(raw?.[key]);
      if (Number.isFinite(value) && value >= 0) return Math.floor(value);
    }
    return 0;
  };
  const promptTokens = pick('prompt_tokens', 'promptTokens', 'input_tokens', 'inputTokens');
  const completionTokens = pick('completion_tokens', 'completionTokens', 'output_tokens', 'outputTokens');
  const totalTokens = pick('total_tokens', 'totalTokens') || promptTokens + completionTokens;
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function endpoint(settings) {
  let base = (settings.baseURL || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) base = base.replace(/\/chat\/completions$/, '');
  return `${base}/chat/completions`;
}

/** 归一化 API 根地址：去掉结尾斜杠与 /chat/completions，保留 /v1 */
function normalizeBase(baseURL = '') {
  let base = String(baseURL || '').trim().replace(/\/+$/, '');
  if (/\/chat\/completions$/.test(base)) base = base.replace(/\/chat\/completions$/, '').replace(/\/+$/, '');
  return base || 'https://api.deepseek.com';
}

/** 模型列表地址：兼容 https://host/v1 与 https://host 两种写法 */
function modelsEndpoint(base) {
  return /\/v1$/i.test(base) ? `${base}/models` : `${base}/v1/models`;
}

/**
 * 连通性测试（参考 Tavo APP 的「测试连接」）。
 * 先用 GET /v1/models 拉取模型列表（不消耗 token）；若服务端不支持该端点，
 * 再回退到一次 max_tokens=1 的最小聊天请求。
 * @returns {Promise<{ok:boolean,kind:string,message:string,models:string[],latencyMs:number,method:string}>}
 */
export async function testConnection(settings = {}, signal = null) {
  const baseURL = normalizeBase(settings.baseURL);
  const apiKey = String(settings.apiKey || '').trim();

  // 校验顺序参考 APP：先 URL，再 Key
  if (/^https?:\/\//i.test(apiKey)) {
    return { ok: false, kind: 'bad_key', message: '这里要填 API 密钥，不是网址', models: [], latencyMs: 0, method: '' };
  }
  if (/^sk[-_]/i.test(baseURL) || (!/^https?:\/\//i.test(baseURL))) {
    return { ok: false, kind: 'bad_url', message: 'API 地址不正确，应形如 https://api.deepseek.com/v1', models: [], latencyMs: 0, method: '' };
  }
  if (!apiKey) {
    return { ok: false, kind: 'no_key', message: '请先填写 API 密钥', models: [], latencyMs: 0, method: '' };
  }

  const started = Date.now();
  const latency = () => Date.now() - started;
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  const classifyHttp = (status, detail = '') => {
    if (status === 401 || status === 403) return { kind: 'auth', message: '密钥无效或已过期（401/403）' };
    if (status === 402 || status === 429) return { kind: 'quota', message: detail || '余额不足或请求过于频繁' };
    return { kind: 'http', message: detail || `请求失败（HTTP ${status}）` };
  };

  // 第一步：GET /v1/models
  try {
    const res = await fetch(modelsEndpoint(baseURL), { method: 'GET', headers, signal });
    if (res.ok) {
      let models = [];
      try {
        const data = await res.json();
        const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        models = list.map(m => (typeof m === 'string' ? m : m?.id)).filter(Boolean).map(String);
      } catch (_) { /* 响应不是 JSON，仍视为连通 */ }
      return {
        ok: true,
        kind: 'success',
        message: models.length
          ? `连接成功 · 检测到 ${models.length} 个模型`
          : '连接成功 · 该服务未在模型列表中返回模型',
        models,
        latencyMs: latency(),
        method: 'models',
      };
    }
    // 401/403/余额 直接判失败，不必再试聊天端点
    if (res.status === 401 || res.status === 403 || res.status === 402 || res.status === 429) {
      let detail = '';
      try { detail = (await res.json())?.error?.message || ''; } catch (_) {}
      const c = classifyHttp(res.status, detail);
      return { ok: false, kind: c.kind, message: c.message, models: [], latencyMs: latency(), method: 'models' };
    }
    // 404/405 等：服务端可能没实现 models，继续走聊天端点
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: '连接超时，请检查网络或代理', models: [], latencyMs: latency(), method: 'models' };
    }
    return { ok: false, kind: 'network', message: '网络错误，请检查当前网络能否访问该 API 地址', models: [], latencyMs: latency(), method: 'models' };
  }

  // 第二步：最小聊天请求（不产生实质内容）
  try {
    const res = await fetch(endpoint(settings), {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: String(settings.model || 'deepseek-chat').trim(),
        messages: [{ role: 'user', content: 'hi' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (res.ok) {
      return { ok: true, kind: 'success', message: '连接成功 · 聊天端点可用（模型列表不可用，已回退验证）', models: [], latencyMs: latency(), method: 'chat' };
    }
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch (_) {}
    const c = classifyHttp(res.status, detail);
    return { ok: false, kind: c.kind, message: c.message, models: [], latencyMs: latency(), method: 'chat' };
  } catch (err) {
    if (err?.name === 'AbortError') {
      return { ok: false, kind: 'timeout', message: '连接超时，请检查网络或代理', models: [], latencyMs: latency(), method: 'chat' };
    }
    return { ok: false, kind: 'network', message: '网络错误，请检查当前网络能否访问该 API 地址', models: [], latencyMs: latency(), method: 'chat' };
  }
}

/**
 * 按字符预算裁剪提示词片段。按空行分段保留，避免把一段设定从中间切断。
 * 角色设定与全局前后缀不参与裁剪，只裁剪世界书 + 规则书。
 */
function trimByBudget(text = '', limit = 0) {
  const clean = String(text).trim();
  if (!clean || !limit || clean.length <= limit) return clean;
  const paragraphs = clean.split(/\n{2,}/);
  const kept = [];
  let used = 0;
  for (const para of paragraphs) {
    const cost = para.length + (kept.length ? 2 : 0);
    if (used + cost > limit) break;
    kept.push(para);
    used += cost;
  }
  if (!kept.length) kept.push(clean.slice(0, Math.max(1, limit)));
  const result = kept.join('\n\n');
  return result.length < clean.length ? `${result}\n\n（部分设定因字符预算已省略）` : result;
}

/**
 * 组装 system 提示词。
 * 顺序：全局前缀 → 角色设定 → 世界书（主角 / 长期记忆 / 触发条目）→ 规则书 → 全局后缀。
 * 世界书 + 规则书合计受 settings.promptCharLimit 约束（0 = 不限制）。
 */
export function buildSystem(character, rulesText, settings, worldText = '', presetText = '') {
  const parts = [];
  if (settings.systemPrefix?.trim()) parts.push(settings.systemPrefix.trim());
  // 对话预设相当于 APP 的 Main Prompt，置于角色定义之前决定整体叙事风格
  if (presetText?.trim()) parts.push(presetText.trim());
  parts.push(character.systemPrompt || '你是一个角色扮演助手，请以角色身份回应。');
  const extra = [worldText, rulesText].filter(v => v?.trim()).map(v => v.trim()).join('\n\n');
  const trimmed = trimByBudget(extra, Math.max(0, Number(settings.promptCharLimit) || 0));
  if (trimmed) parts.push(trimmed);
  if (settings.systemSuffix?.trim()) parts.push(settings.systemSuffix.trim());
  return parts.join('\n\n');
}

/**
 * 按预设块顺序组装 system 片段。
 * 预算块（世界书 / 规则书等）各自按「剩余字符预算」就地裁剪，位置保持用户设定的顺序；
 * 非预算块（主提示词 / 角色性格 / 前后缀）不参与裁剪。budget 为 0 表示不限制。
 * 设置页的估算与本函数共用，保证显示的字符数与实际发送一致。
 */
export function composePlanParts(plan, promptCharLimit = 0) {
  const budget = Math.max(0, Number(promptCharLimit) || 0);
  let remaining = budget > 0 ? budget : Infinity;
  let budgetedCount = 0;
  const out = [];
  for (const part of plan?.systemParts || []) {
    if (!part?.budgeted) {
      if (part?.text) out.push(part.text);
      continue;
    }
    if (remaining <= 0) continue;
    // 相邻预算块之间实际会用 '\n\n' 连接，这 2 个字符也要计入预算
    const sep = budgetedCount ? 2 : 0;
    const allowance = remaining === Infinity ? Infinity : remaining - sep;
    if (allowance <= 0) continue;
    const piece = allowance === Infinity
      ? String(part.text || '').trim()
      : trimByBudget(part.text, allowance);
    if (!piece) continue;
    out.push(piece);
    budgetedCount += 1;
    if (remaining !== Infinity) remaining -= piece.length + sep;
  }
  return out;
}

function buildMessages(character, history, userInput, contextLimit, rulesText, settings, worldText, presetText = '', plan = null) {
  let recent = history.filter(m => m.status !== 'error' && m.content).slice(-Math.max(1, contextLimit));
  // 历史字符上限：超限时从最早的开始丢弃，至少保留最近一条
  const charLimit = Math.max(0, Number(settings.historyCharLimit) || 0);
  if (charLimit > 0) {
    const total = () => recent.reduce((n, m) => n + String(m.content || '').length, 0);
    while (recent.length > 1 && total() > charLimit) recent.shift();
  }
  const historyMessages = recent.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }));

  // 未启用预设：走原有拼接（前缀 → 主提示词 → 角色 → 世界书+规则 → 后缀）
  if (!plan) {
    const messages = [{ role: 'system', content: buildSystem(character, rulesText, settings, worldText, presetText) }];
    messages.push(...historyMessages);
    messages.push({ role: 'user', content: userInput });
    return messages;
  }

  // 启用预设：严格按预设中的块顺序构建（预算块逐个裁剪，不合并、不搬位置）
  const messages = [];
  const systemText = composePlanParts(plan, settings.promptCharLimit).join('\n\n').trim();
  if (systemText) messages.push({ role: 'system', content: systemText });
  for (const ex of plan.examples || []) messages.push({ role: ex.role, content: ex.content });
  if (plan.useHistory !== false) messages.push(...historyMessages);
  if (plan.postHistory?.trim()) messages.push({ role: 'system', content: plan.postHistory.trim() });
  messages.push({ role: 'user', content: userInput });
  return messages;
}

function clamp(n, min, max, fallback) {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * 对话请求（默认流式；settings.stream === false 时走非流式）
 * @param {object} opts
 * @param {object} opts.settings API 配置
 * @param {object} opts.character 当前角色
 * @param {string} opts.rulesText 已启用的规则书拼接文本
 * @param {string} opts.worldText 世界书（主角 / 记忆 / 触发条目）拼接文本
 * @param {string} opts.presetText 当前启用的对话预设文本（已展开宏）
 * @param {object} opts.plan 由 state.buildPresetPlan 生成的结构化提示词计划（启用预设时）
 * @param {Array} opts.history 历史消息（不含本次输入）
 * @param {string} opts.userInput 本次输入
 * @param {AbortSignal} opts.signal 中止信号
 * @param {(text:string)=>void} opts.onDelta 增量文本回调
 * @param {(usage:{promptTokens:number,completionTokens:number,totalTokens:number})=>void} opts.onUsage API 返回的用量回调
 * @returns {Promise<string>} 完整回复
 */
export async function streamChat({ settings, character, rulesText = '', worldText = '', presetText = '', plan = null, history, userInput, signal, onDelta, onUsage }) {
  if (!settings.apiKey || !settings.apiKey.trim()) {
    throw new APIError('尚未配置 API Key，请前往设置页填写', 'no_key');
  }

  const stream = settings.stream !== false;
  const body = {
    model: (settings.model || 'deepseek-chat').trim(),
    messages: buildMessages(character, history, userInput, settings.contextLimit || 20, rulesText, settings, worldText, presetText, plan),
    temperature: clamp(settings.temperature, 0, 5, 1.2),
    top_p: clamp(settings.topP ?? 1, 0, 1, 1),
    stream,
  };
  if (stream && settings.includeUsage !== false) {
    // DeepSeek / OpenAI 兼容：让流式响应的最后一帧带上 usage
    body.stream_options = { include_usage: true };
  }
  let usageReported = false;
  const reportUsage = (raw) => {
    if (usageReported) return;
    const usage = normalizeUsage(raw);
    if (!usage) return;
    usageReported = true;
    onUsage?.(usage);
  };
  const maxTokens = Number(settings.maxTokens);
  if (Number.isFinite(maxTokens) && maxTokens > 0) body.max_tokens = Math.floor(maxTokens);

  let response;
  try {
    response = await fetch(endpoint(settings), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${settings.apiKey.trim()}`,
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new APIError('连接失败，请检查网络与 API 地址', 'network');
  }

  if (!response.ok) {
    let detail = '';
    try { detail = (await response.json())?.error?.message || ''; } catch (_) {}
    if (response.status === 401) throw new APIError('API Key 无效或已过期', 'auth');
    if (response.status === 402 || response.status === 429) throw new APIError(detail || '余额不足或请求过于频繁', 'quota');
    throw new APIError(detail || `请求失败（HTTP ${response.status}）`, 'http');
  }

  if (!stream) {
    let data;
    try { data = await response.json(); } catch (_) { throw new APIError('响应解析失败', 'stream'); }
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) {
      const reason = data?.choices?.[0]?.finish_reason;
      if (reason === 'content_filter') throw new APIError('模型未返回内容（服务端内容策略拦截）', 'content_filter');
      throw new APIError('模型未返回内容', 'empty');
    }
    reportUsage(data?.usage);
    onDelta?.(text, text);
    return text;
  }

  if (!response.body) throw new APIError('响应为空', 'network');

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let full = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') continue;
        let json;
        try { json = JSON.parse(payload); } catch (_) { continue; }
        reportUsage(json?.usage);
        const delta = json?.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta.length) {
          full += delta;
          onDelta?.(full, delta);
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new APIError('读取流式响应失败', 'stream');
  }

  if (!full.trim()) throw new APIError('模型未返回内容（可能被服务端内容策略拦截）', 'content_filter');
  return full;
}
