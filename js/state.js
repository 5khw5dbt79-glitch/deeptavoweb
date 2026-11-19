// state.js — 全局状态、订阅与业务操作
import * as storage from './storage.js';
export { PRESET_BLOCK_DEFS, RULE_POSITIONS, RECOMMENDED_RULE_IDS, positionMeta, positionLabel, isMarkerBlock, APPEARANCE_TAG_GROUPS, MAX_CUSTOM_TAGS } from './storage.js';

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
    avatar: String(data.avatar || ''),
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
    // 只有显式传入 avatar 才覆盖，避免老表单把图片清掉
    ...('avatar' in data ? { avatar: String(data.avatar || '') } : {}),
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

/**
 * 追加一个候选版本（Reroll）并切到它。
 * content 始终等于当前选中的版本，其他模块不需要感知 variants 的存在。
 */
export function addMessageVariant(characterId, messageId, text) {
  const msgs = state.conversations[characterId] || [];
  const msg = msgs.find(m => m.id === messageId);
  if (!msg) return null;
  const clean = String(text || '');
  const variants = Array.isArray(msg.variants) ? msg.variants.slice() : [];
  // 首次生成时 content 已经是完整文本，先把它作为第 1 版，避免重复入列
  if (!variants.length && msg.content) variants.push(msg.content);
  if (clean && variants[variants.length - 1] !== clean) variants.push(clean);
  msg.variants = variants.length ? variants : [clean];
  msg.variantIndex = msg.variants.length - 1;
  msg.content = clean;
  msg.status = 'done';
  commit('messages');
  return msg;
}

/** 在多个版本之间切换（content 同步更新，历史记录读到的就是选中版本） */
export function setMessageVariant(characterId, messageId, index) {
  const msgs = state.conversations[characterId] || [];
  const msg = msgs.find(m => m.id === messageId);
  if (!msg?.variants?.length) return null;
  const next = Math.max(0, Math.min(Number(index) || 0, msg.variants.length - 1));
  msg.variantIndex = next;
  msg.content = msg.variants[next];
  commit('messages');
  return msg;
}

/** 取某条消息之前的历史快照（Reroll 用：不包含这条回复本身） */
// ---- 对话记录：新对话时归档当前对话，可恢复 ----
const MAX_SESSIONS = 10;

function archiveList(characterId) {
  const char = state.characters.find(c => c.id === characterId);
  if (!char) return null;
  if (!Array.isArray(char.sessions)) char.sessions = [];
  return char.sessions;
}

function sessionTitle(messages) {
  const first = messages.find(m => m.role === 'user' && String(m.content || '').trim())
    || messages.find(m => String(m.content || '').trim());
  const text = String(first?.content || '空对话').replace(/\s+/g, ' ').trim();
  return text.length > 26 ? `${text.slice(0, 26)}…` : text;
}

function pushArchive(characterId, messages) {
  const list = archiveList(characterId);
  if (!list || !messages.length) return;
  list.unshift({
    id: uid('session'),
    title: sessionTitle(messages),
    createdAt: Date.now(),
    messages: messages.map(m => ({ ...m })),
  });
  if (list.length > MAX_SESSIONS) list.length = MAX_SESSIONS;
}

/** 开始新对话：当前对话归档，重新写入开场白（角色卡与设定不变） */
export function startNewChat(characterId = state.activeCharacterId) {
  const char = state.characters.find(c => c.id === characterId);
  if (!char) return null;
  const current = state.conversations[characterId] || [];
  pushArchive(characterId, current);
  const now = Date.now();
  state.conversations[characterId] = char.greeting
    ? [{ id: uid('msg'), role: 'assistant', content: char.greeting, status: 'done', createdAt: now }]
    : [];
  commit('messages');
  return { archived: current.length };
}

/** 归档列表（只给界面用的摘要，不带 messages） */
export function archivedSessions(characterId = state.activeCharacterId) {
  const char = state.characters.find(c => c.id === characterId);
  return (char?.sessions || []).map(s => ({
    id: s.id,
    title: s.title,
    createdAt: s.createdAt,
    count: s.messages?.length || 0,
  }));
}

/** 恢复某段归档：当前对话先归档，再把选中的换回当前 */
export function restoreSession(sessionId, characterId = state.activeCharacterId) {
  const list = archiveList(characterId);
  if (!list) return null;
  const idx = list.findIndex(s => s.id === sessionId);
  if (idx < 0) return null;
  const target = list[idx];
  const current = state.conversations[characterId] || [];
  if (current.length) {
    list.push({ id: uid('session'), title: sessionTitle(current), createdAt: Date.now(), messages: current.map(m => ({ ...m })) });
  }
  list.splice(idx, 1);
  if (list.length > MAX_SESSIONS) list.length = MAX_SESSIONS;
  state.conversations[characterId] = (target.messages || []).map(m => ({ ...m }));
  commit('messages');
  return state.conversations[characterId];
}

export function deleteSession(sessionId, characterId = state.activeCharacterId) {
  const list = archiveList(characterId);
  if (!list) return false;
  const next = list.filter(s => s.id !== sessionId);
  if (next.length === list.length) return false;
  state.characters.find(c => c.id === characterId).sessions = next;
  commit('characters');
  return true;
}

export function historyBefore(characterId, messageId) {
  const msgs = state.conversations[characterId] || [];
  const idx = msgs.findIndex(m => m.id === messageId);
  return idx < 0 ? msgs.slice() : msgs.slice(0, idx);
}

/** 删除某条消息（Reroll 前的用户输入需要重新发送时用） */
export function removeMessage(characterId, messageId) {
  const msgs = state.conversations[characterId] || [];
  state.conversations[characterId] = msgs.filter(m => m.id !== messageId);
  commit('messages');
}

/** 批量剔除最早的若干条消息（自动摘要归档后使用） */
export function dropMessages(characterId, count) {
  const msgs = state.conversations[characterId] || [];
  const n = Math.max(0, Math.min(Number(count) || 0, msgs.length));
  state.conversations[characterId] = msgs.slice(n);
  commit('messages');
}

export function updateSettings(patch) {
  Object.assign(state.settings, patch);
  commit('settings');
}

// ---- 配置改动计数（用于「该备份了」的轻提示）----
export function markConfigEdited() {
  if (!state.meta) state.meta = storage.defaultMeta();
  state.meta.edits = (Number(state.meta.edits) || 0) + 1;
}

/** 自上次导出以来改了几次规则 / 预设 */
export function configEditCount() {
  return Math.max(0, Number(state.meta?.edits) || 0);
}

export function markConfigExported() {
  if (!state.meta) state.meta = storage.defaultMeta();
  state.meta.edits = 0;
  state.meta.exportedAt = Date.now();
  commit('meta');
}

// ---- 规则书（可复用的 system 提示词片段）----
/**
 * 规则片段字段：
 * position           注入位置（after_char_desc / before_main_prompt / chat_history_bottom）
 * depth              位置为 chat_history_bottom 时，从最新一条历史往回数第几条
 * scope              global = 全局生效；character = 仅 boundCharacterIds 中的角色
 * boundCharacterIds  作用域为 character 时生效的角色
 */
function normalizeRuleInput(data, fallback = {}) {
  const position = storage.RULE_POSITIONS.some(p => p.key === data.position)
    ? data.position
    : (fallback.position || 'after_char_desc');
  const bound = Array.isArray(data.boundCharacterIds)
    ? data.boundCharacterIds.map(String).filter(Boolean)
    : (fallback.boundCharacterIds || []);
  const wantsCharacterScope = data.scope === 'character';
  return {
    position,
    depth: Math.max(0, Math.min(20, Number(data.depth ?? fallback.depth) || 0)),
    // 选择了「仅指定角色」却没选人时，回落为全局，避免规则静默失效
    scope: wantsCharacterScope && bound.length ? 'character' : 'global',
    boundCharacterIds: bound,
  };
}

export function addRule(data) {
  const now = Date.now();
  const rule = {
    id: uid('rule'),
    name: (data.name || '').trim() || '未命名规则',
    content: (data.content || '').trim(),
    builtin: false,
    enabled: data.enabled === undefined ? true : !!data.enabled,
    createdAt: now,
    updatedAt: now,
    ...normalizeRuleInput(data, { position: 'after_char_desc', depth: 0, boundCharacterIds: [] }),
  };
  editingScope().rules.push(rule);
  markConfigEdited();
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
    ...normalizeRuleInput(data, rule),
  });
  markConfigEdited();
  commit('rules');
  return rule;
}

export function deleteRule(id) {
  const scope = editingScope();
  scope.rules = scope.rules.filter(r => r.id !== id);
  markConfigEdited();
  commit('rules');
}

export function toggleRule(id) {
  const rule = editingScope().rules.find(r => r.id === id);
  if (!rule) return;
  rule.enabled = !rule.enabled;
  rule.updatedAt = Date.now();
  markConfigEdited();
  commit('rules');
}

/** 只改注入位置（拖拽落槽时用），不触发内容覆盖 */
export function setRulePosition(id, position, depth = null) {
  const rule = editingScope().rules.find(r => r.id === id);
  if (!rule) return null;
  if (!storage.RULE_POSITIONS.some(p => p.key === position)) return rule;
  rule.position = position;
  if (depth !== null) rule.depth = Math.max(0, Math.min(20, Number(depth) || 0));
  if (position === 'chat_history_bottom' && depth === null) rule.depth = 0;
  rule.enabled = true;
  rule.updatedAt = Date.now();
  markConfigEdited();
  commit('rules');
  return rule;
}

/**
 * 一键载入推荐规则包：补齐被删掉的内置片段并全部启用（幂等）。
 * @returns {{added:number, enabled:number, total:number, missing:number}}
 *   added   本次补回的条数；enabled 本次从停用变启用的条数；missing 执行前缺/未启用的条数
 */
export function enableRecommendedRules() {
  const scope = editingScope();
  const total = storage.RECOMMENDED_RULE_IDS.length;
  const before = storage.RECOMMENDED_RULE_IDS.filter(id => {
    const rule = scope.rules.find(r => r.id === id);
    return !rule || !rule.enabled;
  }).length;
  let added = 0;
  let enabled = 0;
  for (const id of storage.RECOMMENDED_RULE_IDS) {
    let rule = scope.rules.find(r => r.id === id);
    if (!rule) {
      const source = storage.BUILTIN_RULES.find(r => r.id === id);
      if (!source) continue;
      scope.rules.push({ ...source, boundCharacterIds: [...source.boundCharacterIds], enabled: true });
      added += 1;
      enabled += 1;
      continue;
    }
    if (!rule.enabled) {
      rule.enabled = true;
      enabled += 1;
    }
  }
  markConfigEdited();
  commit('rules');
  return { added, enabled, total, missing: before };
}

/** 推荐规则里还有几条没生效（用于提醒条与按钮文案） */
export function missingRecommendedRules(characterId) {
  const rules = scopeOf(characterId).rules || [];
  return storage.RECOMMENDED_RULE_IDS.filter(id => {
    const rule = rules.find(r => r.id === id);
    return !rule || !rule.enabled;
  }).length;
}

/**
 * 批量导入规则片段（配置 JSON）。
 * 必须走 commit：旧实现直接 push 到 scope.rules，刷新页面就丢了。
 */
export function importRules(list = []) {
  const scope = editingScope();
  const existing = new Set(scope.rules.map(r => `${r.name}::${r.content}`));
  let added = 0;
  for (const rule of list) {
    if (!rule || typeof rule.content !== 'string') continue;
    const key = `${rule.name}::${rule.content}`;
    if (existing.has(key)) continue;
    scope.rules.push({
      ...rule,
      id: uid('rule'),
      name: String(rule.name || '导入的规则'),
      content: String(rule.content),
      builtin: false,
      enabled: rule.enabled !== false,
    });
    existing.add(key);
    added += 1;
  }
  if (added) {
    markConfigEdited();
    commit('rules');
  }
  return added;
}

/**
 * 按注入位置把「已启用且对当前角色生效」的规则分桶。
 * 作用域过滤在这一层完成，注入端不必再判断。
 */
export function activeRuleBuckets(characterId = state.activeCharacterId) {
  const buckets = { top: [], charAfter: [], depth: [] };
  for (const rule of scopeOf(characterId).rules || []) {
    if (!rule.enabled) continue;
    const text = String(rule.content || '').trim();
    if (!text) continue;
    if (rule.scope === 'character' && rule.boundCharacterIds?.length
      && !rule.boundCharacterIds.includes(characterId)) continue;
    const item = {
      id: rule.id,
      name: rule.name,
      text,
      position: rule.position || 'after_char_desc',
      depth: Math.max(0, Number(rule.depth) || 0),
    };
    if (item.position === 'before_main_prompt') buckets.top.push(item);
    else if (item.position === 'chat_history_bottom') buckets.depth.push(item);
    else buckets.charAfter.push(item);
  }
  return buckets;
}

/** 兼容旧调用：系统提示词内的规则文本（不含历史底部那部分） */
export function activeRulesText(characterId = state.activeCharacterId) {
  const b = activeRuleBuckets(characterId);
  return [...b.top, ...b.charAfter].map(r => r.text).join('\n\n');
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

function normalizeBlockList(blocks, mainPrompt) {
  return storage.normalizePresetBlocks(Array.isArray(blocks) ? blocks : [], mainPrompt).map(b => {
    if (b.marker) return b;
    return { ...b, enabled: b.enabled !== false, content: String(b.content || '') };
  });
}

export function addPreset(data) {
  const mainPrompt = String(data.mainPrompt || '');
  const preset = {
    id: uid('preset'),
    name: (data.name || '').trim() || '未命名预设',
    description: (data.description || '').trim(),
    mainPrompt,
    blocks: normalizeBlockList(data.blocks, mainPrompt),
    builtin: false,
    isDefault: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  state.presets.push(preset);
  markConfigEdited();
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
    preset.blocks = normalizeBlockList(data.blocks, preset.mainPrompt);
  }
  preset.updatedAt = Date.now();
  markConfigEdited();
  commit('presets');
  return preset;
}

/** 复制一份预设：内置预设也能复制成可自由改的版本 */
export function duplicatePreset(id) {
  const preset = state.presets.find(p => p.id === id);
  if (!preset) return null;
  return addPreset({
    name: `${preset.name} 副本`,
    description: preset.description,
    mainPrompt: preset.mainPrompt,
    blocks: JSON.parse(JSON.stringify(preset.blocks)),
  });
}

/** 从导入结果新建预设（不覆盖已有的同名预设） */
export function importPreset(parsed) {
  const exists = state.presets.some(p => p.name === parsed.name);
  return addPreset({
    name: exists ? `${parsed.name}（导入）` : parsed.name,
    description: parsed.description,
    mainPrompt: parsed.mainPrompt,
    blocks: parsed.blocks,
  });
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
  markConfigEdited();
  commit('presets');
  return true;
}

export function setDefaultPreset(id) {
  if (!state.presets.some(p => p.id === id)) return;
  state.presets.forEach(p => { p.isDefault = p.id === id; });
  markConfigEdited();
  commit('presets');
}

/**
 * 把 Chat Examples 文本解析为 few-shot 消息
 * 支持「user: xxx / char: xxx」逐行写法，其余行并入上一条。
 */
function parseExamples(text = '', character = null) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const u = line.match(/^(?:user|用户|\{\{user\}\})\s*[:：]\s*(.*)$/i);
    const a = line.match(/^(?:assistant|char|角色|\{\{char\}\})\s*[:：]\s*(.*)$/i);
    if (u) out.push({ role: 'user', content: expandMacros(u[1], character) });
    else if (a) out.push({ role: 'assistant', content: expandMacros(a[1], character) });
    else if (out.length) out[out.length - 1].content += '\n' + line;
    else out.push({ role: 'assistant', content: expandMacros(line, character) });
  }
  return out;
}

/** 在 seq 里找到「角色设定」的位置，规则片段默认贴在它后面 */
function charAnchorIndex(seq) {
  let idx = -1;
  seq.forEach((part, i) => {
    if (part.key === 'charPersonality' || part.key === 'charDescription') idx = i;
  });
  if (idx >= 0) return idx;
  const mainIdx = seq.findIndex(p => p.key === 'main');
  if (mainIdx >= 0) return mainIdx;
  return seq.length ? seq.length - 1 : -1;
}

/** 在 seq 里找到主提示词的位置，顶部规则插在它前面 */
function mainIndex(seq) {
  const idx = seq.findIndex(p => p.key === 'main');
  return idx >= 0 ? idx : (seq[0]?.key === 'prefix' ? 1 : 0);
}

const ruleParts = (list) => list.map(r => ({ key: `rule_${r.id}`, text: r.text, budgeted: true, ruleId: r.id }));

/**
 * 按指定预设生成结构化提示词计划。
 *
 * 规则片段的落点由两件事共同决定：
 * 1. 预设序列里是否有 rulesDefault / rulesDepth 槽位 —— 有就落在槽位处；
 * 2. 规则自身的 injectionPosition —— 决定它进哪个槽（角色后 / 主提示词顶部 / 历史底部）。
 * 历史底部的规则是消息级注入（独立 system 消息），其余进系统提示词。
 *
 * @returns {object|null} 没有预设时返回 null（调用方走旧拼接逻辑）
 */
export function buildPresetPlanFor(preset, character = null, history = [], userInput = '', settings = state.settings) {
  if (!preset) return null;
  const charId = character?.id || state.activeCharacterId;
  const world = activeWorldParts(history, userInput, settings.worldEntryLimit, charId);
  const buckets = activeRuleBuckets(charId);
  const blocks = Array.isArray(preset.blocks) ? preset.blocks : [];

  const seq = [];
  const push = (key, text, budgeted = false) => {
    const clean = String(text || '').trim();
    if (clean) seq.push({ key, text: clean, budgeted });
  };

  push('prefix', settings.systemPrefix);

  let postHistoryText = '';
  let defaultSlotUsed = false;

  for (const b of blocks) {
    if (!b) continue;

    // 槽位块：不承载文本，只决定规则片段落在序列的哪一格
    if (b.key === 'rulesDefault') {
      seq.push(...ruleParts(buckets.charAfter));
      defaultSlotUsed = true;
      continue;
    }
    if (b.key === 'rulesDepth') continue; // 消息级注入，不占系统提示词

    if (b.enabled === false) continue;
    const raw = String(b.content || '');

    switch (b.key) {
      case 'main':
        push('main', expandMacros(raw || preset.mainPrompt || '', character));
        break;
      case 'lorebookBefore':
        push('lorebookBefore', world.constants, true);
        break;
      case 'longMemory':
        push('longMemory', world.memory, true);
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
        postHistoryText = expandMacros(raw, character).trim();
        break;
      case 'chatHistory':
      case 'chatExamples':
        break; // 作为独立消息处理
      default:
        if (b.custom) push(b.key, expandMacros(raw, character), true);
    }
  }

  // 旧预设没有槽位块时，角色后规则回落到「角色设定之后」
  if (!defaultSlotUsed && buckets.charAfter.length) {
    const at = charAnchorIndex(seq);
    seq.splice(at + 1, 0, ...ruleParts(buckets.charAfter));
  }
  // 顶部规则：永远置顶，位置语义优先于槽位
  if (buckets.top.length) {
    seq.splice(mainIndex(seq), 0, ...ruleParts(buckets.top));
  }

  push('suffix', settings.systemSuffix);

  const examplesBlock = blocks.find(b => b && b.key === 'chatExamples' && b.enabled !== false);
  const historyBlock = blocks.find(b => b && b.key === 'chatHistory' && b.enabled !== false);
  const order = blocks.filter(b => b && b.enabled !== false && !storage.isMarkerBlock(b.key)).map(b => b.key);

  return {
    presetId: preset.id || null,
    presetName: preset.name || '',
    systemParts: seq,
    examples: examplesBlock ? parseExamples(expandMacros(examplesBlock.content, character), character) : [],
    useHistory: !!historyBlock,
    postHistory: postHistoryText,
    // depth 大的先插，保证多条规则同时落位时顺序稳定
    depthRules: buckets.depth
      .slice()
      .sort((a, b) => b.depth - a.depth)
      .map(r => ({ id: r.id, name: r.name, text: r.text, depth: r.depth })),
    rulesInSystem: [...buckets.top, ...buckets.charAfter].map(r => r.id),
    rulesAtDepth: buckets.depth.map(r => r.id),
    blockOrder: order,
  };
}

/** 用当前启用的预设生成计划（旧入口，行为保持不变） */
export function buildPresetPlan(character = null, history = [], userInput = '', settings = state.settings) {
  return buildPresetPlanFor(activePreset(), character, history, userInput, settings);
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
    if (p.appearance?.trim()) personaLines.push(`玩家外貌：${p.appearance.trim()}。`);
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
// 头像只用于界面展示（本地 dataURL），外貌描述则随 Persona 注入提示词。
export function updateProtagonist(patch) {
  const protagonist = editingScope().protagonist;
  const allowed = ['enabled', 'name', 'title', 'gender', 'personality', 'background', 'relationship', 'notes', 'avatar', 'appearance'];
  for (const key of allowed) {
    if (key in patch) {
      if (key === 'enabled') protagonist[key] = !!patch[key];
      else if (key === 'avatar') protagonist[key] = String(patch[key] || '');
      else protagonist[key] = String(patch[key] ?? '').trim();
    }
  }
  commit('protagonist');
  return protagonist;
}

/** 自定义外貌标签库：跨角色共用的词条池 */
export function addAppearanceTag(tag) {
  const clean = String(tag || '').trim();
  if (!clean) return null;
  if (!Array.isArray(state.appearanceTags)) state.appearanceTags = [];
  if (state.appearanceTags.includes(clean)) return clean;
  state.appearanceTags.push(clean);
  if (state.appearanceTags.length > storage.MAX_CUSTOM_TAGS) {
    state.appearanceTags = state.appearanceTags.slice(-storage.MAX_CUSTOM_TAGS);
  }
  commit('protagonist');
  return clean;
}

export function removeAppearanceTag(tag) {
  const clean = String(tag || '').trim();
  state.appearanceTags = (state.appearanceTags || []).filter(t => t !== clean);
  commit('protagonist');
}

/** 整库恢复：导入备份后整体替换运行时状态 */
export function applyBackup(nextState) {
  if (!nextState || typeof nextState !== 'object') return false;
  state = nextState;
  editScopeId = undefined;
  commit('characters');
  return true;
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

/**
 * 按角色写入长期记忆（自动归档用）。
 * 与 updateMemory 的区别：不受页面上「设定范围」影响，永远落在当前对话角色的那一套。
 */
export function setScopeMemory(characterId, content) {
  const scope = scopeOf(characterId);
  scope.memory = {
    ...(scope.memory || { enabled: true, content: '' }),
    enabled: true,
    content: String(content || '').trim(),
  };
  commit('memory');
  return scope.memory;
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
