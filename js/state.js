// state.js — 全局状态、订阅与业务操作
import * as storage from './storage.js';
export { PRESET_BLOCK_DEFS } from './storage.js';

let state = storage.load();
const listeners = new Set();

export function getState() { return state; }

/** 订阅状态变化。fn(state, hint) — hint 标明变化类型，便于精确更新视图 */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/** hint: 'characters' | 'messages' | 'settings' | 'general' */
function commit(hint = 'general') {
  if (!storage.save(state)) {
    console.warn('[state] 持久化失败，数据仅保留在内存中');
  }
  listeners.forEach(fn => fn(state, hint));
}

export const COLORS = ['#E0B872', '#8FB6A3', '#9BA7D0', '#D09A96', '#C4A7C7', '#A8B99A', '#D6B48C', '#8FBCC4'];

function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }

export function activeCharacter() {
  return state.characters.find(c => c.id === state.activeCharacterId) || null;
}

export function activeMessages() {
  const id = state.activeCharacterId;
  return id ? (state.conversations[id] || []) : [];
}

// ---- 设定作用域：通用模板 / 每个角色一整套（规则书 + 世界书 + 主角 + 记忆）----
/**
 * 角色可以拥有自己的一整套设定（character.scoped）。没有时读取端回落到顶层的
 * 「通用设定」，因此老数据零迁移，未编辑过的角色行为与之前完全一致。
 * 一旦在该角色的任何设定页做了修改，就整套复制一份过来（fork），此后彻底独立。
 */

/** 页面正在编辑的设定范围：undefined = 跟随当前角色，null = 通用模板，字符串 = 指定角色 */
let editScopeId;

/** 顶层那套「通用设定」（同时作为新建/未独立角色的模板） */
const globalScopeRef = {
  get rules() { return state.rules; },
  set rules(v) { state.rules = v; },
  get worldBooks() { return state.worldBooks; },
  set worldBooks(v) { state.worldBooks = v; },
  get protagonist() { return state.protagonist; },
  set protagonist(v) { state.protagonist = v; },
  get memory() { return state.memory; },
  set memory(v) { state.memory = v; },
};

/** 用 getter/setter 固定引用，写入方既能 push 也能整体替换，始终落在 state 上 */
export function globalScope() {
  return globalScopeRef;
}

function findCharacter(id) {
  return id ? state.characters.find(c => c.id === id) || null : null;
}

/** 注入用：永远取「当前对话角色」的那一套，不受页面上编辑范围的影响 */
export function scopeOf(characterId = state.activeCharacterId) {
  const char = findCharacter(characterId);
  return char?.scoped || globalScope();
}

/** 当前编辑目标：未显式选择时跟随当前角色 */
export function editScopeTarget() {
  if (editScopeId === undefined) return state.activeCharacterId || null;
  return editScopeId;
}

export function setEditScope(id) {
  editScopeId = id === null ? null : String(id);
  commit('scope');
}

/** 页面展示用：返回当前编辑范围那一套 + 独立性状态，不触发 fork */
export function viewScope() {
  const char = findCharacter(editScopeTarget());
  if (char?.scoped) {
    return { ...char.scoped, independent: true, isGlobal: false, characterId: char.id, characterName: char.name };
  }
  return {
    ...globalScope(),
    independent: false,
    isGlobal: !char,
    characterId: char?.id || null,
    characterName: char?.name || '',
  };
}

/** 把通用设定整套复制一份，作为某个角色的独立设定 */
function forkFromGlobal() {
  return {
    rules: state.rules.map(r => ({ ...r })),
    worldBooks: state.worldBooks.map(w => ({ ...w })),
    protagonist: { ...state.protagonist },
    memory: { ...state.memory },
    forkedAt: Date.now(),
  };
}

/** 写入用：编辑范围对应的那套设定，目标是角色且未独立时先整套 fork */
export function editingScope() {
  const char = findCharacter(editScopeTarget());
  if (!char) return globalScope();
  if (!char.scoped) char.scoped = forkFromGlobal();
  return char.scoped;
}

/** 显式「改为独立」：立即复制通用设定（不改变内容，只是脱钩） */
export function forkScope(characterId = editScopeTarget()) {
  const char = findCharacter(characterId);
  if (!char) return null;
  if (!char.scoped) char.scoped = forkFromGlobal();
  commit('scope');
  return char.scoped;
}

/** 恢复跟随通用：丢弃该角色的独立设定 */
export function resetScope(characterId = editScopeTarget()) {
  const char = findCharacter(characterId);
  if (!char || !char.scoped) return null;
  delete char.scoped;
  commit('scope');
  return char;
}

export function addCharacter(data) {
  const now = Date.now();
  const char = {
    id: uid('chr'),
    name: (data.name || '').trim() || '未命名角色',
    description: (data.description || '').trim(),
    systemPrompt: (data.systemPrompt || '').trim() || '你是一个角色扮演助手，请以角色身份回应。',
    greeting: (data.greeting || '').trim(),
    color: data.color || COLORS[0],
    createdAt: now,
    updatedAt: now,
  };
  // 每个新角色从通用设定复制一整套属于自己的规则书 / 世界书 / 主角 / 记忆
  char.scoped = forkFromGlobal();
  state.characters.push(char);
  state.conversations[char.id] = [];
  state.activeCharacterId = char.id;
  editScopeId = undefined;

  if (char.greeting) {
    state.conversations[char.id].push({
      id: uid('msg'), role: 'assistant', content: char.greeting, status: 'done', createdAt: now,
    });
  }
  commit('characters');
  return char;
}

export function updateCharacter(id, data) {
  const char = state.characters.find(c => c.id === id);
  if (!char) return null;
  const now = Date.now();
  Object.assign(char, {
    name: (data.name || '').trim() || char.name,
    description: (data.description || '').trim(),
    systemPrompt: (data.systemPrompt || '').trim() || char.systemPrompt,
    greeting: (data.greeting || '').trim(),
    color: data.color || char.color,
    updatedAt: now,
  });
  commit('characters');
  return char;
}

export function deleteCharacter(id) {
  state.characters = state.characters.filter(c => c.id !== id);
  delete state.conversations[id];
  if (state.activeCharacterId === id) {
    state.activeCharacterId = state.characters[0]?.id || null;
  }
  if (editScopeId === id) editScopeId = undefined;
  commit('characters');
}

export function selectCharacter(id) {
  if (!state.characters.some(c => c.id === id)) return;
  state.activeCharacterId = id;
  // 切换角色后，设定页自动跟着切到该角色的那一套
  editScopeId = undefined;
  const msgs = state.conversations[id] || [];
  const char = state.characters.find(c => c.id === id);
  if (msgs.length === 0 && char.greeting) {
    state.conversations[id] = [{
      id: uid('msg'), role: 'assistant', content: char.greeting, status: 'done', createdAt: Date.now(),
    }];
  }
  commit('characters');
}

export function appendMessage(characterId, message) {
  if (!state.conversations[characterId]) state.conversations[characterId] = [];
  const msg = { id: uid('msg'), status: 'done', createdAt: Date.now(), ...message };
  state.conversations[characterId].push(msg);
  commit('messages');
  return msg;
}

export function patchMessage(characterId, messageId, patch) {
  const msgs = state.conversations[characterId] || [];
  const msg = msgs.find(m => m.id === messageId);
  if (!msg) return;
  Object.assign(msg, patch);
  commit('messages');
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  commit('settings');
}

// ---- 规则书（可复用的 system 提示词片段）----
export function addRule(data) {
  const now = Date.now();
  const rule = {
    id: uid('rule'),
    name: (data.name || '').trim() || '未命名规则',
    content: (data.content || '').trim(),
    builtin: false,
    enabled: !!data.enabled,
    createdAt: now,
    updatedAt: now,
  };
  editingScope().rules.push(rule);
  commit('rules');
  return rule;
}

export function updateRule(id, data) {
  const rule = editingScope().rules.find(r => r.id === id);
  if (!rule) return null;
  Object.assign(rule, {
    name: (data.name || '').trim() || rule.name,
    content: (data.content ?? rule.content).trim(),
    enabled: typeof data.enabled === 'boolean' ? data.enabled : rule.enabled,
    updatedAt: Date.now(),
  });
  commit('rules');
  return rule;
}

export function deleteRule(id) {
  const scope = editingScope();
  scope.rules = scope.rules.filter(r => r.id !== id);
  commit('rules');
}

export function toggleRule(id) {
  const rule = editingScope().rules.find(r => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  rule.updatedAt = Date.now();
  commit('rules');
}

/**
 * 拼接所有已启用规则书，用空行分隔，作为 system 提示词的一部分。
 * 注入时始终用「当前对话角色」的设定，不看页面上的编辑范围。
 */
export function activeRulesText(characterId = state.activeCharacterId) {
  const scope = scopeOf(characterId);
  return scope.rules.filter(r => r.enabled && r.content.trim()).map(r => r.content.trim()).join('\n\n');
}

// ---- 对话预设（APP 风格：一次启用一个预设，预设内是 ordered 提示词块）----
export function activePreset() {
  return state.presets.find(p => p.id === state.activePresetId) || null;
}

export function selectPreset(id) {
  state.activePresetId = state.presets.some(p => p.id === id) ? id : null;
  commit('presets');
}

/** 展开预设宏：{{char}} → 当前角色名，{{user}} → 主角名（未设定则为「你」） */
export function expandMacros(text = '', character = null) {
  const charName = character?.name?.trim() || '角色';
  // 主角名取自「该角色」的设定，不同角色可以有不同的玩家身份
  const userName = scopeOf(character?.id || state.activeCharacterId).protagonist?.name?.trim() || '你';
  return String(text || '')
    .replace(/\{\{\s*char\s*\}\}/gi, charName)
    .replace(/\{\{\s*user\s*\}\}/gi, userName);
}

/** 兼容旧调用：返回当前预设的 Main Prompt 文本（已展开宏） */
export function activePresetText(character = null) {
  const preset = activePreset();
  const main = preset?.blocks?.find(b => b?.key === 'main');
  const text = main?.content || preset?.mainPrompt || preset?.content || '';
  return text.trim() ? expandMacros(text, character) : '';
}

export function addPreset(data) {
  const preset = {
    id: uid('preset'),
    name: (data.name || '').trim() || '未命名预设',
    description: (data.description || '').trim(),
    mainPrompt: String(data.mainPrompt || ''),
    blocks: (data.blocks || []).map(b => ({
      key: b.key,
      enabled: b.enabled !== false,
      content: String(b.content || ''),
      ...(b.custom ? { label: b.label || b.key, custom: true } : {}),
    })),
    builtin: false,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.presets.push(preset);
  commit('presets');
  return preset;
}

export function updatePreset(id, data) {
  const preset = state.presets.find(p => p.id === id);
  if (!preset) return null;
  if ('name' in data) preset.name = String(data.name || '').trim() || preset.name;
  if ('description' in data) preset.description = String(data.description || '').trim();
  if ('mainPrompt' in data) preset.mainPrompt = String(data.mainPrompt || '');
  if (Array.isArray(data.blocks)) {
    preset.blocks = data.blocks.map(b => ({
      key: b.key,
      enabled: b.enabled !== false,
      content: String(b.content || ''),
      ...(b.custom ? { label: b.label || b.key, custom: true } : {}),
    }));
  }
  preset.updatedAt = Date.now();
  commit('presets');
  return preset;
}

export function deletePreset(id) {
  const preset = state.presets.find(p => p.id === id);
  if (!preset || preset.builtin) return false;
  state.presets = state.presets.filter(p => p.id !== id);
  if (state.activePresetId === id) state.activePresetId = null;
  if (preset.isDefault) {
    const next = state.presets.find(p => p.builtin) || state.presets[0];
    if (next) next.isDefault = true;
  }
  commit('presets');
  return true;
}

export function setDefaultPreset(id) {
  if (!state.presets.some(p => p.id === id)) return;
  state.presets.forEach(p => { p.isDefault = p.id === id; });
  commit('presets');
}

/** 把 Chat Examples 文本解析为 few-shot 消息 */
function parseExamples(text = '') {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const u = line.match(/^(?:user|用户|\{\{user\}\})\s*[:：]\s*(.*)$/i);
    const a = line.match(/^(?:assistant|char|角色|\{\{char\}\})\s*[:：]\s*(.*)$/i);
    if (u) out.push({ role: 'user', content: expandMacros(u[1]) });
    else if (a) out.push({ role: 'assistant', content: expandMacros(a[1]) });
    else if (out.length) out[out.length - 1].content += '\n' + line;
    else out.push({ role: 'assistant', content: expandMacros(line) });
  }
  return out;
}

/**
 * 按当前预设的块顺序生成结构化提示词计划。
 * 未启用预设时返回 null，api.js 走原有拼接逻辑。
 */
export function buildPresetPlan(character = null, history = [], userInput = '', settings = {}) {
  const preset = activePreset();
  if (!preset) return null;
  const blocks = Array.isArray(preset.blocks) ? preset.blocks : [];
  const parts = [];
  const push = (key, text, budgeted = false) => {
    const clean = String(text || '').trim();
    if (clean) parts.push({ key, text: clean, budgeted });
  };

  // 全局前缀始终在最前
  push('prefix', settings.systemPrefix);
  const world = activeWorldParts(history, userInput, settings.worldEntryLimit, character?.id || state.activeCharacterId);

  for (const b of blocks) {
    if (!b || b.enabled === false) continue;
    const raw = String(b.content || '');
    switch (b.key) {
      case 'main':
        push('main', expandMacros(raw || preset.mainPrompt || '', character));
        break;
      case 'lorebookBefore':
        push('lorebookBefore', [world.memory, world.constants].filter(Boolean).join('\n\n'), true);
        break;
      case 'persona':
        push('persona', world.persona, true);
        break;
      case 'charDescription':
        push('charDescription', character?.description, true);
        break;
      case 'charPersonality':
        push('charPersonality', character?.systemPrompt);
        break;
      case 'scenario':
      case 'enhanceDefinitions':
      case 'auxiliaryPrompt':
        push(b.key, expandMacros(raw, character), true);
        break;
      case 'lorebookAfter':
        push('lorebookAfter', world.triggered, true);
        break;
      case 'postHistory':
        push('postHistory', expandMacros(raw, character));
        break;
      case 'chatHistory':
      case 'chatExamples':
        break; // 在下面作为独立消息处理
      default:
        if (b.custom) push(b.key, expandMacros(raw, character), true);
    }
  }

  // 规则书片段始终附加（受提示词预算约束），取当前角色的那一套
  push('rules', activeRulesText(character?.id || state.activeCharacterId), true);
  // 全局后缀始终在最后
  push('suffix', settings.systemSuffix);

  const examplesBlock = blocks.find(b => b && b.key === 'chatExamples' && b.enabled !== false);
  const historyBlock = blocks.find(b => b && b.key === 'chatHistory' && b.enabled !== false);
  const post = parts.find(p => p.key === 'postHistory');

  return {
    systemParts: parts.filter(p => p.key !== 'postHistory'),
    examples: examplesBlock ? parseExamples(examplesBlock.content) : [],
    useHistory: !!historyBlock,
    postHistory: post?.text || '',
  };
}

// ---- 世界书（关键词触发 / 常驻条目）----
export function addWorldEntry(data) {
  const now = Date.now();
  const entry = {
    id: uid('world'),
    name: (data.name || '').trim() || '未命名条目',
    content: (data.content || '').trim(),
    keys: (data.keys || '').trim(),
    constant: !!data.constant,
    builtin: false,
    enabled: data.enabled !== false,
    createdAt: now,
    updatedAt: now,
  };
  editingScope().worldBooks.push(entry);
  commit('world');
  return entry;
}

export function updateWorldEntry(id, data) {
  const entry = editingScope().worldBooks.find(w => w.id === id);
  if (!entry) return null;
  Object.assign(entry, {
    name: (data.name || '').trim() || entry.name,
    content: (data.content ?? entry.content).trim(),
    keys: (data.keys ?? entry.keys).trim(),
    constant: typeof data.constant === 'boolean' ? data.constant : entry.constant,
    enabled: typeof data.enabled === 'boolean' ? data.enabled : entry.enabled,
    updatedAt: Date.now(),
  });
  commit('world');
  return entry;
}

export function deleteWorldEntry(id) {
  const scope = editingScope();
  scope.worldBooks = scope.worldBooks.filter(w => w.id !== id);
  commit('world');
}

export function toggleWorldEntry(id) {
  const entry = editingScope().worldBooks.find(w => w.id === id);
  if (!entry) return;
  entry.enabled = !entry.enabled;
  entry.updatedAt = Date.now();
  commit('world');
}

export function splitKeys(keys = '') {
  return String(keys).split(/[,，|、\n]+/).map(k => k.trim().toLowerCase()).filter(Boolean);
}

/**
 * 生成本次对话要注入的世界书文本。
 * 参考 Tavo 的 lorebook_v3：常驻条目始终注入，其余按最近对话 + 本次输入中的关键词触发。
 * @param {Array} history 历史消息（不含本次输入）
 * @param {string} userInput 本次输入
 * @param {number} entryLimit 最多注入几条世界书条目（0 = 不限制，常驻条目优先占位）
 * @param {string} characterId 取哪个角色的设定（默认当前对话角色）
 * @returns {{text:string, matched:Array}} text 为拼接文本，matched 为实际注入的条目
 */
export function activeWorldParts(history = [], userInput = '', entryLimit = 0, characterId = state.activeCharacterId) {
  const scope = scopeOf(characterId);
  const personaLines = [];
  const memoryLines = [];
  const constantLines = [];
  const triggeredLines = [];

  // 1. 主角（玩家）档案
  const p = scope.protagonist || {};
  if (p.enabled) {
    const who = [p.name, p.title].filter(v => v && String(v).trim()).join('，');
    if (who) personaLines.push(`玩家扮演${who}。`);
    if (p.gender?.trim()) personaLines.push(`玩家性别：${p.gender.trim()}。`);
    if (p.personality?.trim()) personaLines.push(`玩家性格：${p.personality.trim()}。`);
    if (p.background?.trim()) personaLines.push(`玩家背景：${p.background.trim()}。`);
    if (p.relationship?.trim()) personaLines.push(`玩家与你的关系：${p.relationship.trim()}。`);
    if (p.notes?.trim()) personaLines.push(p.notes.trim());
    if (personaLines.length) {
      personaLines.push('称呼玩家时使用其名字，不要替玩家决定言行，也不要描写玩家的心理活动。');
    }
  }

  // 2. 长期记忆（独立、始终生效）
  if (scope.memory?.enabled && scope.memory.content?.trim()) {
    memoryLines.push(`【长期记忆】\n${scope.memory.content.trim()}`);
  }

  // 3. 世界书条目：常驻优先，其余按最近对话 + 本次输入的关键词触发
  const scan = [...history.slice(-10).map(m => m?.content || ''), userInput].join('\n').toLowerCase();
  const enabled = (scope.worldBooks || []).filter(entry => entry.enabled && entry.content?.trim());
  const constants = enabled.filter(e => e.constant);
  const triggered = enabled.filter(e => !e.constant && splitKeys(e.keys).some(k => scan.includes(k)));
  const limit = Math.max(0, Number(entryLimit) || 0);
  let remain = limit > 0 ? limit : Infinity;
  const constInjected = constants.slice(0, remain);
  remain -= constInjected.length;
  const triggeredInjected = triggered.slice(0, remain);
  for (const e of constInjected) constantLines.push(`【${e.name}】\n${e.content.trim()}`);
  for (const e of triggeredInjected) triggeredLines.push(`【${e.name}】\n${e.content.trim()}`);

  const persona = personaLines.length ? `【玩家（主角）设定】\n${personaLines.join('\n')}` : '';
  const memory = memoryLines.join('\n\n');
  const constant = constantLines.join('\n\n');
  const triggeredText = triggeredLines.join('\n\n');

  return {
    persona,
    memory,
    constants: constant,
    triggered: triggeredText,
    matched: [...constInjected, ...triggeredInjected],
  };
}

/**
 * 生成本次对话要注入的世界书文本（旧接口，未启用预设时使用）。
 * @returns {{text:string, matched:Array}}
 */
export function activeWorldText(history = [], userInput = '', entryLimit = 0, characterId = state.activeCharacterId) {
  const { persona, memory, constants, triggered, matched } = activeWorldParts(history, userInput, entryLimit, characterId);
  return { text: [persona, memory, constants, triggered].filter(Boolean).join('\n\n'), matched };
}

// ---- 主角档案与长期记忆 ----
export function updateProtagonist(patch) {
  const protagonist = editingScope().protagonist;
  const allowed = ['enabled', 'name', 'title', 'gender', 'personality', 'background', 'relationship', 'notes'];
  for (const key of allowed) {
    if (key in patch) {
      protagonist[key] = key === 'enabled' ? !!patch[key] : String(patch[key] ?? '').trim();
    }
  }
  commit('protagonist');
  return protagonist;
}

export function toggleProtagonist() {
  const protagonist = editingScope().protagonist;
  protagonist.enabled = !protagonist.enabled;
  commit('protagonist');
  return protagonist;
}

export function updateMemory(patch) {
  const memory = editingScope().memory;
  if ('enabled' in patch) memory.enabled = !!patch.enabled;
  if ('content' in patch) memory.content = String(patch.content ?? '').trim();
  commit('memory');
  return memory;
}

export function toggleMemory() {
  const memory = editingScope().memory;
  memory.enabled = !memory.enabled;
  commit('memory');
  return memory;
}

// ---- Token 用量统计（只记录 API 返回的真实 usage）----
function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function toCount(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** 记录一次请求的 token 用量；usage 形如 {promptTokens, completionTokens, totalTokens} */
export function recordUsage(usage = {}, meta = {}) {
  const prompt = toCount(usage.promptTokens ?? usage.prompt_tokens);
  const completion = toCount(usage.completionTokens ?? usage.completion_tokens);
  const total = toCount(usage.totalTokens ?? usage.total_tokens) || prompt + completion;
  if (!prompt && !completion && !total) return null;

  const u = state.usage;
  const day = todayKey();
  const bucket = u.days[day] || { requests: 0, promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  bucket.requests += 1;
  bucket.promptTokens += prompt;
  bucket.completionTokens += completion;
  bucket.totalTokens += total;
  u.days[day] = bucket;

  u.requests += 1;
  u.promptTokens += prompt;
  u.completionTokens += completion;
  u.totalTokens += total;
  u.updatedAt = Date.now();
  u.recent = [
    {
      at: u.updatedAt,
      day,
      characterId: meta.characterId || null,
      characterName: meta.characterName || '',
      model: meta.model || '',
      promptTokens: prompt,
      completionTokens: completion,
      totalTokens: total,
    },
    ...(u.recent || []),
  ].slice(0, 20);

  commit('usage');
  return u;
}

export function resetUsage() {
  state.usage = storage.defaultUsage();
  commit('usage');
  return state.usage;
}
