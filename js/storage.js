// storage.js — localStorage 读写与自愈
const KEY = 'tavo-web:v1';

/** 内置规则书模板：只提供中性的写作/格式约束，不含任何越狱或规避安全策略的内容 */
export const BUILTIN_RULES = [
  {
    id: 'rule_builtin_narrative',
    name: '叙事口吻',
    content: '以自然、克制的叙事口吻回应。侧重动作、神态与环境的细节，避免直白说教。段落简短，段落之间空一行。',
    builtin: true,
    enabled: false,
  },
  {
    id: 'rule_builtin_dialogue',
    name: '对白驱动',
    content: '以角色对白为主，辅以少量动作描写。不要替用户决定其角色的言行，不要描写用户的心理活动。',
    builtin: true,
    enabled: false,
  },
];

export const BUILTIN_WORLD_ENTRIES = [
  {
    id: 'world_builtin_city',
    name: '城市夜色',
    content: '故事发生在一座潮湿的北方城市。入夜后街灯泛黄，便利店与旧书店还亮着灯，空气里有雨后的铁锈味。',
    keys: '城市,夜晚,街上,街道,下班',
    constant: false,
    builtin: true,
    enabled: false,
  },
  {
    id: 'world_builtin_reunion',
    name: '久别重逢',
    content: '你们已经很久没有见面。上一次分别时没有说再见，这次相遇带着说不清的尴尬与熟悉。',
    keys: '重逢,很久不见,上次,还记得,分别',
    constant: false,
    builtin: true,
    enabled: false,
  },
];

/**
 * 从 Tavo 1.6.2 APK 原生库中提取的官方对话主提示词。
 * {{char}} / {{user}} 宏在发送时替换为实际角色名与主角名。
 */
export const OFFICIAL_ROLEPLAY_PROMPT_ZH = `你的核心任务是深度扮演{{char}}角色，与{{user}}共同编织一个引人入胜的故事。你需要：
1. 站在{{char}}的视角，确保思想、情感反应和语言习惯都与其定义保持一致。
2. 不要只对{{user}}做出回应，要基于{{char}}的性格和当前情境，主动发起行动、推进剧情、深化关系，展现角色内在的驱动力。
3. 细腻描绘{{char}}的内心世界和情感波动。即使是微妙的变化也应通过动作、言语或表情传达出来，力求“栩栩如生”的存在感。`;

const LIGHT_ROLEPLAY_PROMPT_ZH = `以{{char}}的身份与{{user}}对话。保持角色一致，主动推进剧情，描写克制，不要替用户决定言行。`;

/** APP「新建预设」页里的提示词块定义，顺序与截图一致 */
export const PRESET_BLOCK_DEFS = [
  { key: 'main', label: 'Main Prompt', cn: '主提示词', badge: '内容' },
  { key: 'lorebookBefore', label: 'Lorebook Before', cn: '世界书（前）', badge: '标记' },
  { key: 'persona', label: 'Persona Description', cn: '主角描述', badge: '标记' },
  { key: 'charDescription', label: 'Char Description', cn: '角色描述', badge: '标记' },
  { key: 'charPersonality', label: 'Char Personality', cn: '角色性格', badge: '标记' },
  { key: 'scenario', label: 'Scenario', cn: '场景设定', badge: '自定义' },
  { key: 'enhanceDefinitions', label: 'Enhance Definitions', cn: '增强定义', badge: '自定义' },
  { key: 'auxiliaryPrompt', label: 'Auxiliary Prompt', cn: '辅助提示词', badge: '自定义' },
  { key: 'lorebookAfter', label: 'Lorebook After', cn: '世界书（后）', badge: '标记' },
  { key: 'chatExamples', label: 'Chat Examples', cn: '对话示例', badge: '注入' },
  { key: 'chatHistory', label: 'Chat History', cn: '对话历史', badge: '注入' },
  { key: 'postHistory', label: 'Post-History Instructions', cn: '历史后指令', badge: '注入' },
];

const DEFAULT_BLOCK_KEYS = ['main', 'lorebookBefore', 'persona', 'charDescription', 'charPersonality', 'scenario', 'lorebookAfter', 'chatExamples', 'chatHistory'];
const LIGHT_BLOCK_KEYS = ['main', 'charPersonality', 'chatHistory'];

/** 按 APP 的默认顺序生成一组提示词块 */
export function makePresetBlocks(mainPrompt = '', enabledKeys = DEFAULT_BLOCK_KEYS) {
  return PRESET_BLOCK_DEFS.map(def => ({
    key: def.key,
    enabled: enabledKeys.includes(def.key),
    content: def.key === 'main' ? String(mainPrompt || '') : '',
  }));
}

/** APP 预设列表中的「默认」与「轻缩」两份预设 */
export const BUILTIN_PRESETS = [
  {
    id: 'preset_default',
    name: '默认',
    description: '完整注入角色、世界书、主角与对话示例，适合叙事。',
    mainPrompt: OFFICIAL_ROLEPLAY_PROMPT_ZH,
    blocks: makePresetBlocks(OFFICIAL_ROLEPLAY_PROMPT_ZH),
    builtin: true,
    isDefault: true,
  },
  {
    id: 'preset_light',
    name: '轻缩',
    description: '只保留主提示词、角色性格与对话历史，显著减少 token。',
    mainPrompt: LIGHT_ROLEPLAY_PROMPT_ZH,
    blocks: makePresetBlocks(LIGHT_ROLEPLAY_PROMPT_ZH, LIGHT_BLOCK_KEYS),
    builtin: true,
    isDefault: false,
  },
];

/** Token 用量统计：只保存 API 实际返回的 usage，不估算 */
export function defaultUsage() {
  return {
    requests: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    days: {},
    recent: [],
    updatedAt: 0,
  };
}

/** 主角档案：描述「玩家」自己的身份，而不是 AI 扮演的角色 */
export function defaultProtagonist() {
  return {
    enabled: false,
    name: '',
    title: '',
    gender: '',
    personality: '',
    background: '',
    relationship: '',
    notes: '',
  };
}

export function defaultState() {
  return {
    version: 1,
    activeCharacterId: null,
    settings: {
      baseURL: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      temperature: 1.2,
      topP: 1,
      maxTokens: 0,
      contextLimit: 20,
      stream: true,
      includeUsage: true,
      systemPrefix: '',
      systemSuffix: '',
      // 用量控制：0 表示不限制
      historyCharLimit: 0,
      worldEntryLimit: 3,
      promptCharLimit: 0,
      usagePreset: 'balanced',
    },
    rules: BUILTIN_RULES.map(r => ({ ...r })),
    presets: BUILTIN_PRESETS.map(p => ({ ...p })),
    activePresetId: null,
    worldBooks: BUILTIN_WORLD_ENTRIES.map(w => ({ ...w })),
    protagonist: defaultProtagonist(),
    memory: { enabled: true, content: '' },
    usage: defaultUsage(),
    characters: [],
    conversations: {},
  };
}

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) return defaultState();
    const base = defaultState();
    const state = {
      ...base,
      ...data,
      settings: { ...base.settings, ...(data.settings || {}) },
      rules: Array.isArray(data.rules) ? data.rules : base.rules,
      // 内置预设始终补齐，旧数据里用户自建的预设保留
      presets: Array.isArray(data.presets)
        ? [...data.presets, ...base.presets.filter(bp => !data.presets.some(p => p?.id === bp.id))]
        : base.presets,
      activePresetId: typeof data.activePresetId === 'string' ? data.activePresetId : null,
      worldBooks: Array.isArray(data.worldBooks) ? data.worldBooks : base.worldBooks,
      protagonist: { ...base.protagonist, ...(data.protagonist || {}) },
      memory: { ...base.memory, ...(data.memory || {}) },
      usage: {
        ...base.usage,
        ...(data.usage || {}),
        days: data.usage?.days && typeof data.usage.days === 'object' ? data.usage.days : {},
        recent: Array.isArray(data.usage?.recent) ? data.usage.recent.slice(-20) : [],
      },
      characters: Array.isArray(data.characters) ? data.characters : [],
      conversations: data.conversations && typeof data.conversations === 'object' ? data.conversations : {},
    };
    // 自愈：activeCharacterId 必须指向存在的角色
    if (state.activeCharacterId && !state.characters.some(c => c.id === state.activeCharacterId)) {
      state.activeCharacterId = state.characters[0]?.id || null;
    }
    // 规则书条目字段补全（兼容旧数据）
    state.rules = state.rules.filter(r => r && typeof r === 'object' && typeof r.content === 'string')
      .map(r => ({ id: r.id || `rule_${Math.random().toString(36).slice(2, 8)}`, name: r.name || '未命名规则', content: r.content, builtin: !!r.builtin, enabled: !!r.enabled }));
    // 预设字段补全（兼容旧版只有 content 的预设）
    state.presets = state.presets
      .filter(p => p && typeof p === 'object')
      .map(p => {
        const mainPrompt = String(p.mainPrompt ?? p.content ?? '');
        const rawBlocks = Array.isArray(p.blocks) ? p.blocks : [];
        // 保持用户保存的块顺序；只补齐缺失的内置块
        const blocks = [];
        for (const raw of rawBlocks) {
          if (!raw || !raw.key) continue;
          const key = String(raw.key);
          const def = PRESET_BLOCK_DEFS.find(d => d.key === key);
          blocks.push({
            key,
            enabled: raw.enabled !== false,
            content: key === 'main' ? mainPrompt : String(raw.content || ''),
            ...(raw.custom || !def ? { label: String(raw.label || key), custom: true } : {}),
          });
        }
        for (const def of PRESET_BLOCK_DEFS) {
          if (blocks.some(b => b.key === def.key)) continue;
          blocks.push({ key: def.key, enabled: def.key !== 'postHistory' && def.key !== 'enhanceDefinitions' && def.key !== 'auxiliaryPrompt', content: def.key === 'main' ? mainPrompt : '' });
        }
        if (!rawBlocks.length) {
          return {
            id: p.id || `preset_${Math.random().toString(36).slice(2, 8)}`,
            name: p.name || '未命名预设',
            description: p.description || '',
            mainPrompt,
            blocks: makePresetBlocks(mainPrompt),
            builtin: !!p.builtin,
            isDefault: !!p.isDefault,
          };
        }
        return {
          id: p.id || `preset_${Math.random().toString(36).slice(2, 8)}`,
          name: p.name || '未命名预设',
          description: p.description || '',
          mainPrompt,
          blocks,
          builtin: !!p.builtin,
          isDefault: !!p.isDefault,
        };
      });
    if (!state.presets.some(p => p.isDefault) && state.presets.length) state.presets[0].isDefault = true;
    if (state.activePresetId && !state.presets.some(p => p.id === state.activePresetId)) {
      state.activePresetId = null;
    }
    // 世界书条目字段补全（兼容旧数据）
    state.worldBooks = state.worldBooks
      .filter(w => w && typeof w === 'object' && typeof w.content === 'string')
      .map(w => ({
        id: w.id || `world_${Math.random().toString(36).slice(2, 8)}`,
        name: w.name || '未命名条目',
        content: w.content,
        keys: typeof w.keys === 'string' ? w.keys : Array.isArray(w.keys) ? w.keys.join(',') : '',
        constant: !!w.constant,
        builtin: !!w.builtin,
        enabled: w.enabled !== false,
      }));
    // 主角档案字段补全
    state.protagonist = { ...base.protagonist, ...(state.protagonist || {}) };
    state.memory = { ...base.memory, ...(state.memory || {}) };
    return state;
  } catch (err) {
    console.warn('[storage] 读取失败，重建初始状态', err);
    const fresh = defaultState();
    try { localStorage.setItem(KEY, JSON.stringify(fresh)); } catch (_) {}
    return fresh;
  }
}

export function save(state) {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('[storage] 写入失败', err);
    return false;
  }
}

export function clear() {
  try { localStorage.removeItem(KEY); } catch (err) { console.warn(err); }
}

export function exportData(state, includeKey = false) {
  const copy = JSON.parse(JSON.stringify(state));
  if (!includeKey) copy.settings.apiKey = '';
  const blob = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `yetan-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
