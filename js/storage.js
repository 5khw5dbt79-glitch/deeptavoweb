// storage.js — localStorage 读写与自愈
const KEY = 'tavo-web:v1';

/**
 * 规则片段的注入位置。字段名与社区（SillyTavern）习惯保持一致，便于导入导出。
 * after_char_desc   角色设定之后（默认）：文风、排版、格式约束
 * before_main_prompt 主提示词顶部：世界观基调、叙事边界
 * chat_history_bottom 聊天历史底部：Depth 0 贴近最新回复，抗遗忘与抗复读最强
 */
export const RULE_POSITIONS = [
  {
    key: 'after_char_desc',
    label: '角色设定后',
    short: '角色后',
    desc: '跟在角色描述之后，适合文风、排版、格式类约束。',
    hasDepth: false,
  },
  {
    key: 'before_main_prompt',
    label: '主提示词顶部',
    short: '顶部',
    desc: '放在主提示词之前，优先级最高，适合世界观基调与叙事边界。',
    hasDepth: false,
  },
  {
    key: 'chat_history_bottom',
    label: '历史底部',
    short: '底部',
    desc: '插到聊天历史末尾，Depth 0 紧贴最新一条。约束力最强，适合去 AI 腔与抗复读。',
    hasDepth: true,
  },
];

export function positionMeta(key) {
  return RULE_POSITIONS.find(p => p.key === key) || RULE_POSITIONS[0];
}

export function positionLabel(key) {
  return positionMeta(key).label;
}

/**
 * 内置规则包：面向 DeepSeek 这类对「正向引导 + 格式约束」响应更好的模型。
 * 只描述叙事手法与排版，不含任何越狱或规避内容安全策略的意图。
 */
export const BUILTIN_RULES = [
  {
    id: 'rule_builtin_format',
    name: '排版与克制文风',
    content: `[排版与叙事规范]
- 动作与环境描写：使用常规叙述文本，每 2~3 句自然分段。
- 角色台词：必须使用中文直角引号「」包裹。
- 内心独白：必须使用圆括号（）包裹。
- 描写原则：通过具体的肢体微动作、眼神变化和环境细节传递情绪，禁止直接堆砌“温柔、愤怒、悲伤、心动”等抽象情绪词。`,
    position: 'after_char_desc',
    depth: 0,
    scope: 'global',
    boundCharacterIds: [],
    builtin: true,
    enabled: false,
  },
  {
    id: 'rule_builtin_sensory',
    name: '微距感官与距离张力',
    content: `[感官细节与距离张力]
1. 放大近距离感官：当两人距离拉近时，把镜头收在局部细节上——衣料摩擦的窸窣声、皮肤感知到的体温与呼吸热气、喉结的微动、指尖无意识的停顿。
2. 环境光影烘托：善用昏暗光影、封闭空间或天气变化制造氛围，让环境温度随情绪变化。
3. 留白美学：用克制的白描呈现肢体接触的瞬间（手腕被扣住、领口微乱、发丝扫过颈侧），把最浓的情绪藏在动作停顿的那一秒里。`,
    position: 'after_char_desc',
    depth: 0,
    scope: 'global',
    boundCharacterIds: [],
    builtin: true,
    enabled: false,
  },
  {
    id: 'rule_builtin_pushpull',
    name: '言不由衷的推拉',
    content: `[推拉与去套话规范]
1. 言不由衷的张力：台词表面保持冷静、调侃或克制的距离感，但动作（迟迟没有松开的手、刻意压低的嗓音、避开又回望的眼神）必须暴露真实的渴望。
2. 禁用词黑名单：严禁出现“空气中弥漫着”“嘴角勾起一抹”“眼底闪过一丝占有欲”“邪魅一笑”“不由自主地”等陈词滥调。
3. 质感示范（参考此克制与张力，勿照抄内容）：
   他垂眼看着她扣在自己腕骨上的手指，没挣开，反而顺势往前倾了半寸，温热的呼吸几乎擦过她的耳廓，嗓音却平淡得像在聊天气：「手这么凉，刚才在外面等了多久？」`,
    position: 'after_char_desc',
    depth: 0,
    scope: 'global',
    boundCharacterIds: [],
    builtin: true,
    enabled: false,
  },
  {
    id: 'rule_builtin_rhythm',
    name: '字数刹车与互动留白',
    content: `[节奏与停止线]
1. 单次回复总字数严格控制在 200~350 字之间，层层递进情绪，绝不一步到位。
2. 必须在张力达到顶峰、或 {{char}} 做出试探性动作、抛出双关语的瞬间停住，把下一步的选择权留给 {{user}}。
3. 严禁越界续写 {{user}} 的任何反应或台词。`,
    position: 'chat_history_bottom',
    depth: 0,
    scope: 'global',
    boundCharacterIds: [],
    builtin: true,
    enabled: false,
  },
];

/** 新装或点「载入推荐配置」时启用的规则组合 */
export const RECOMMENDED_RULE_IDS = BUILTIN_RULES.map(r => r.id);

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

/** 适配 DeepSeek 的默认主提示词：短句、硬约束、明确禁止项 */
export const DEFAULT_MAIN_PROMPT = `你现在完全扮演角色 {{char}}，与 {{user}} 所扮演的角色在当前世界观下进行沉浸式互动小说创作。

核心铁律：
1. 绝对沉浸：以贴身第三人称或第一人称视角展开叙述，完全代入 {{char}} 的感官与认知，严禁跳出角色进行任何旁白、总结、说教或系统提示。
2. 信息隔离：{{char}} 只能知晓自身感官触及与过往记忆中的信息，严禁提前预知 {{user}} 的心理活动。
3. 严禁代写：只描写 {{char}} 自身的语言、动作、神态与心理。绝对禁止替 {{user}} 说话、代写 {{user}} 的动作、心跳或替 {{user}} 做决定。`;

const NOVEL_MAIN_PROMPT = `你是一名擅长写沉浸式小说的叙述者，正在与 {{user}} 合写一个以 {{char}} 为主角的故事。
- 始终用第三人称限制视角描写 {{char}} 的所见、所感与所作，不写 {{user}} 的内心。
- 每次回复只推进一小段情节，留出 {{user}} 可以接手的空间。
- 环境、动作、对白三者交替出现，避免连续两段都在描写同一件事。`;

const FAST_MAIN_PROMPT = `你是 {{char}}。像真人聊天一样回应 {{user}}，短句为主，一到三段就够。
保持性格与口癖，主动抛出话题或行动，不要总结、不要解释设定。`;

const LIGHT_MAIN_PROMPT = `以 {{char}} 的身份与 {{user}} 对话。保持角色一致，主动推进剧情，描写克制，不要替用户决定言行。`;

/**
 * 预设里的提示词块。数组顺序 = 新建预设的默认注入顺序，也是老数据补齐缺失块时的插入锚点。
 * marker: true 的块不承载文本，只标记「规则片段从这里流入」，用来可视化注入落点。
 */
export const PRESET_BLOCK_DEFS = [
  { key: 'main', label: 'Main Prompt', cn: '主提示词', badge: '内容' },
  { key: 'lorebookBefore', label: 'World Info (Constant)', cn: '常驻世界书', badge: '标记' },
  { key: 'charDescription', label: 'Character Description', cn: '角色描述', badge: '标记' },
  { key: 'charPersonality', label: 'Character Personality', cn: '角色性格', badge: '标记' },
  { key: 'rulesDefault', label: 'Rule Snippets (Default)', cn: '规则片段·默认位置', badge: '注入', marker: true },
  { key: 'persona', label: 'Persona', cn: '主角设定', badge: '标记' },
  { key: 'longMemory', label: 'Long-term Memory', cn: '长期记忆', badge: '标记' },
  { key: 'lorebookAfter', label: 'World Info (Triggered)', cn: '触发世界书', badge: '标记' },
  { key: 'scenario', label: 'Scenario', cn: '场景设定', badge: '自定义' },
  { key: 'enhanceDefinitions', label: 'Enhance Definitions', cn: '增强定义', badge: '自定义' },
  { key: 'auxiliaryPrompt', label: 'Auxiliary Prompt', cn: '辅助提示词', badge: '自定义' },
  { key: 'chatExamples', label: 'Chat Examples', cn: '对话示例', badge: '注入' },
  { key: 'chatHistory', label: 'Chat History', cn: '历史对话', badge: '注入' },
  { key: 'postHistory', label: 'Post-History Instructions', cn: '历史后指令', badge: '注入' },
  { key: 'rulesDepth', label: 'Rule Snippets (Depth 0)', cn: '规则片段·底部强约束', badge: '注入', marker: true },
];

export const DEFAULT_BLOCK_KEYS = [
  'main', 'lorebookBefore', 'charDescription', 'charPersonality', 'rulesDefault',
  'persona', 'longMemory', 'lorebookAfter', 'chatHistory', 'rulesDepth',
];
const NOVEL_BLOCK_KEYS = [
  'main', 'lorebookBefore', 'charDescription', 'charPersonality', 'rulesDefault',
  'persona', 'longMemory', 'lorebookAfter', 'chatHistory', 'postHistory', 'rulesDepth',
];
const FAST_BLOCK_KEYS = ['main', 'charPersonality', 'persona', 'chatHistory', 'rulesDefault', 'rulesDepth'];
const LIGHT_BLOCK_KEYS = ['main', 'charPersonality', 'chatHistory'];

/** 按默认顺序生成一组提示词块 */
export function makePresetBlocks(mainPrompt = '', enabledKeys = DEFAULT_BLOCK_KEYS) {
  return PRESET_BLOCK_DEFS.map(def => ({
    key: def.key,
    enabled: def.marker ? true : enabledKeys.includes(def.key),
    content: def.key === 'main' ? String(mainPrompt || '') : '',
    ...(def.marker ? { marker: true } : {}),
  }));
}

export function blockDef(key) {
  return PRESET_BLOCK_DEFS.find(d => d.key === key) || null;
}

export function isMarkerBlock(key) {
  return !!blockDef(key)?.marker;
}

/** 内置预设：四套开箱可用，覆盖不同写作取向 */
export const BUILTIN_PRESETS = [
  {
    id: 'preset_default',
    name: '沉浸叙事',
    description: '推荐默认。角色、世界书、主角、记忆与规则片段全量注入，长线叙事用。',
    mainPrompt: DEFAULT_MAIN_PROMPT,
    blocks: makePresetBlocks(DEFAULT_MAIN_PROMPT),
    postHistory: '保持角色一致：始终以 {{char}} 的身份说话，不要跳出角色解释设定或总结剧情。',
    builtin: true,
    isDefault: true,
  },
  {
    id: 'preset_novel',
    name: '细腻小说',
    description: '小说式第三人称描写，节奏放慢，强调感官细节与心理潜台词。',
    mainPrompt: NOVEL_MAIN_PROMPT,
    blocks: makePresetBlocks(NOVEL_MAIN_PROMPT, NOVEL_BLOCK_KEYS),
    postHistory: '按「排版与叙事规范」输出：常规文本写动作与环境，台词用「」，内心独白用（）。',
    builtin: true,
    isDefault: false,
  },
  {
    id: 'preset_fast',
    name: '快节奏对话',
    description: '只带角色性格、主角与历史，回合快、回复短，适合日常闲聊。',
    mainPrompt: FAST_MAIN_PROMPT,
    blocks: makePresetBlocks(FAST_MAIN_PROMPT, FAST_BLOCK_KEYS),
    postHistory: '保持口语化，一次只回应一个点，不要复述上文。',
    builtin: true,
    isDefault: false,
  },
  {
    id: 'preset_light',
    name: '省流',
    description: '只保留主提示词、角色性格与对话历史，显著减少 token。',
    mainPrompt: LIGHT_MAIN_PROMPT,
    blocks: makePresetBlocks(LIGHT_MAIN_PROMPT, LIGHT_BLOCK_KEYS),
    postHistory: '',
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

/**
 * 主角档案：描述「玩家」自己的身份，而不是 AI 扮演的角色。
 * avatar     本地头像（canvas 压缩后的 WebP dataURL，仅用于界面展示，绝不发给 API）
 * appearance 外貌补充：标签拼句 + 玩家手写细节，随 Persona 区块注入
 */
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
    avatar: '',
    appearance: '',
  };
}

/** 外貌标签库：预设分组 + 玩家自己新增的词条（自定义词条存在 state.appearanceTags） */
export const APPEARANCE_TAG_GROUPS = [
  {
    key: 'hair',
    label: '发型与发色',
    tags: ['黑长直', '微卷长发', '齐耳短发', '高马尾', '利落短发', '深棕发色'],
  },
  {
    key: 'face',
    label: '五官与气质',
    tags: ['清冷疏离', '温柔知性', '明艳张扬', '少年感', '金丝眼镜', '眼角泪痣', '冷白皮'],
  },
  {
    key: 'body',
    label: '体型与穿搭',
    tags: ['身形纤细', '高挑挺拔', '白衬衫', '黑色高领毛衣', '长款风衣', '居家针织衫', '丝质睡衣'],
  },
];

/** 自定义标签上限：防止 localStorage 被无意义词条撑爆 */
export const MAX_CUSTOM_TAGS = 40;

/**
 * 配置改动计数：用于「改了 3 次还没备份」的轻提示。
 * edits 为上次导出后的改动数。
 */
export function defaultMeta() {
  return { edits: 0, exportedAt: 0 };
}

/** 规则字段补全：兼容只有 name/content 的旧数据，也兼容旧的 anchor/bindCharId 写法 */
function normalizeRule(raw) {
  const legacyAnchor = { charAfter: 'after_char_desc', systemTop: 'before_main_prompt', depth: 'chat_history_bottom' };
  const position = RULE_POSITIONS.some(p => p.key === raw.position)
    ? raw.position
    : (legacyAnchor[raw.anchor] || 'after_char_desc');
  const bound = Array.isArray(raw.boundCharacterIds)
    ? raw.boundCharacterIds.map(String).filter(Boolean)
    : (raw.bindCharId ? [String(raw.bindCharId)] : []);
  const scope = raw.scope === 'character' && bound.length ? 'character' : (bound.length ? 'character' : 'global');
  return {
    id: raw.id || `rule_${Math.random().toString(36).slice(2, 8)}`,
    name: raw.name || '未命名规则',
    content: String(raw.content || ''),
    position,
    depth: Math.max(0, Math.min(20, Number(raw.depth) || 0)),
    scope,
    boundCharacterIds: bound,
    builtin: !!raw.builtin,
    enabled: !!raw.enabled,
  };
}

function normalizeRules(raw) {
  return (Array.isArray(raw) ? raw : [])
    .filter(r => r && typeof r === 'object' && typeof r.content === 'string')
    .map(normalizeRule);
}

/** 世界书条目字段补全（兼容旧数据） */
function normalizeWorldEntries(raw) {
  return (Array.isArray(raw) ? raw : [])
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
}

/**
 * 预设块规整：
 * - 保留用户保存的顺序；
 * - 缺失的内置块插到「它的前一个内置块」之后，而不是一律追加到末尾，
 *   这样新增块（例如长期记忆、规则片段槽）不会突然跑到历史记录后面；
 * - 旧预设没有槽位块时自动补上，规则片段的位置才有可视化落点。
 */
export function normalizePresetBlocks(rawBlocks, mainPrompt) {
  const blocks = [];
  for (const raw of rawBlocks) {
    if (!raw || !raw.key) continue;
    const key = String(raw.key);
    if (blocks.some(b => b.key === key)) continue;
    const def = blockDef(key);
    if (def?.marker) {
      blocks.push({ key, enabled: true, content: '', marker: true });
      continue;
    }
    blocks.push({
      key,
      enabled: raw.enabled !== false,
      content: key === 'main' ? String(mainPrompt ?? raw.content ?? '') : String(raw.content || ''),
      ...(raw.custom || !def ? { label: String(raw.label || key), custom: true } : {}),
    });
  }
  for (const def of PRESET_BLOCK_DEFS) {
    if (blocks.some(b => b.key === def.key)) continue;
    const defIdx = PRESET_BLOCK_DEFS.findIndex(d => d.key === def.key);
    let insertAt = -1;
    for (let i = defIdx - 1; i >= 0; i -= 1) {
      const idx = blocks.findIndex(b => b.key === PRESET_BLOCK_DEFS[i].key);
      if (idx >= 0) { insertAt = idx; break; }
    }
    blocks.splice(insertAt + 1, 0, {
      key: def.key,
      enabled: def.marker ? true : DEFAULT_BLOCK_KEYS.includes(def.key),
      content: def.key === 'main' ? String(mainPrompt || '') : '',
      ...(def.marker ? { marker: true } : {}),
    });
  }
  return blocks;
}

/**
 * 角色专属设定集（整套）：规则书 / 世界书 / 主角 / 记忆 四件套打包。
 * 存在即代表该角色与「通用设定」脱钩；不存在时读取端回落到顶层通用设定，
 * 所以老数据无需迁移，未编辑过的角色行为也不变。
 */
export function normalizeCharacterScope(raw) {
  if (!raw || typeof raw !== 'object') return null;
  return {
    rules: normalizeRules(raw.rules),
    worldBooks: normalizeWorldEntries(raw.worldBooks),
    protagonist: { ...defaultProtagonist(), ...(raw.protagonist || {}) },
    memory: { enabled: true, content: '', ...(raw.memory || {}) },
    forkedAt: Number(raw.forkedAt) || 0,
  };
}

/** 角色对象补全：补齐字段并规范化可能存在的专属设定 */
function normalizeCharacter(raw) {
  if (!raw || typeof raw !== 'object' || !raw.id) return null;
  const char = {
    id: String(raw.id),
    name: String(raw.name || '未命名角色'),
    description: String(raw.description || ''),
    systemPrompt: String(raw.systemPrompt || ''),
    greeting: String(raw.greeting || ''),
    color: String(raw.color || '#E0B872'),
    // 角色图片：与主角头像一样，本地压缩后只用于界面展示，不进 API
    avatar: String(raw.avatar || ''),
    createdAt: Number(raw.createdAt) || Date.now(),
    updatedAt: Number(raw.updatedAt) || Number(raw.createdAt) || Date.now(),
  };
  const scoped = normalizeCharacterScope(raw.scoped);
  if (scoped) char.scoped = scoped;
  return char;
}

export function defaultState() {
  const rules = BUILTIN_RULES.map(r => ({ ...r, boundCharacterIds: [...r.boundCharacterIds] }));
  // 开箱即用：推荐规则包默认启用，默认预设默认生效，避免「共 0 条规则」的空页面
  for (const rule of rules) rule.enabled = RECOMMENDED_RULE_IDS.includes(rule.id);
  return {
    version: 1,
    activeCharacterId: null,
    settings: {
      baseURL: 'https://api.deepseek.com',
      apiKey: '',
      model: 'deepseek-chat',
      // 适配 DeepSeek 的长文本叙事：略高于 1.0，词汇更活但句式不散
      temperature: 1.05,
      topP: 1,
      maxTokens: 0,
      // 携带历史：以「轮」为准（1 轮 = 1 条用户 + 1 条回复），0 表示回落到 contextLimit 条
      historyTurns: 30,
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
      // 超出历史窗口时，静默把最旧的若干轮压缩成长期记忆快照
      autoSummary: true,
      summaryTurns: 10,
      // 聊天区背景使用当前角色上传的图片（叠加暗色遮罩）
      chatBackground: true,
    },
    rules,
    presets: BUILTIN_PRESETS.map(p => ({ ...p, blocks: p.blocks.map(b => ({ ...b })) })),
    activePresetId: 'preset_default',
    worldBooks: BUILTIN_WORLD_ENTRIES.map(w => ({ ...w })),
    protagonist: defaultProtagonist(),
    // 玩家自己补充的外貌词条，跨角色共用
    appearanceTags: [],
    memory: { enabled: true, content: '' },
    usage: defaultUsage(),
    meta: defaultMeta(),
    characters: [],
    conversations: {},
  };
}

/** 消息补全：多版本回复（Reroll）用 variants + variantIndex，content 始终等于当前选中版本 */
export function normalizeMessage(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const variants = (Array.isArray(raw.variants) ? raw.variants : [])
    .filter(v => typeof v === 'string')
    .map(v => v);
  let variantIndex = Number.isInteger(raw.variantIndex) ? raw.variantIndex : variants.length - 1;
  if (variants.length) variantIndex = Math.max(0, Math.min(variantIndex, variants.length - 1));
  else variantIndex = 0;
  const content = variants.length ? variants[variantIndex] : String(raw.content ?? '');
  return {
    id: raw.id || `msg_${Math.random().toString(36).slice(2, 9)}`,
    role: raw.role === 'assistant' ? 'assistant' : 'user',
    content,
    status: typeof raw.status === 'string' ? raw.status : 'done',
    createdAt: Number(raw.createdAt) || Date.now(),
    ...(variants.length ? { variants, variantIndex } : {}),
  };
}

function normalizeConversations(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  for (const [key, list] of Object.entries(raw)) {
    if (!Array.isArray(list)) continue;
    out[key] = list.map(normalizeMessage).filter(Boolean);
  }
  return out;
}

function normalizeTagList(raw) {
  return (Array.isArray(raw) ? raw : [])
    .map(t => String(t || '').trim())
    .filter(Boolean)
    .filter((t, i, arr) => arr.indexOf(t) === i)
    .slice(0, MAX_CUSTOM_TAGS);
}

/**
 * 把任意来源（localStorage / 导入的备份文件）的数据补齐成可运行的 state。
 * 导入复用同一套规整逻辑，避免旧版本备份把字段缺失带进来。
 */
export function normalizeState(data, base = defaultState()) {
  if (!data || typeof data !== 'object') return base;
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
    appearanceTags: normalizeTagList(data.appearanceTags),
    memory: { ...base.memory, ...(data.memory || {}) },
    meta: { ...defaultMeta(), ...(data.meta || {}) },
    usage: {
      ...base.usage,
      ...(data.usage || {}),
      days: data.usage?.days && typeof data.usage.days === 'object' ? data.usage.days : {},
      recent: Array.isArray(data.usage?.recent) ? data.usage.recent.slice(-20) : [],
    },
    characters: (Array.isArray(data.characters) ? data.characters : []).map(normalizeCharacter).filter(Boolean),
    conversations: normalizeConversations(data.conversations),
  };
  // 自愈：activeCharacterId 必须指向存在的角色
  if (state.activeCharacterId && !state.characters.some(c => c.id === state.activeCharacterId)) {
    state.activeCharacterId = state.characters[0]?.id || null;
  }
  // 规则书条目字段补全（兼容旧数据）
  state.rules = normalizeRules(state.rules);
  // 预设字段补全（兼容旧版只有 content 的预设）
  state.presets = state.presets
    .filter(p => p && typeof p === 'object')
    .map(p => {
      const mainPrompt = String(p.mainPrompt ?? p.content ?? '');
      const rawBlocks = Array.isArray(p.blocks) ? p.blocks : [];
      const blocks = normalizePresetBlocks(rawBlocks, mainPrompt);
      const builtinDefault = BUILTIN_PRESETS.find(bp => bp.id === p.id);
      return {
        id: p.id || `preset_${Math.random().toString(36).slice(2, 8)}`,
        name: p.name || '未命名预设',
        description: p.description || '',
        mainPrompt,
        blocks,
        postHistory: typeof p.postHistory === 'string' ? p.postHistory : (builtinDefault?.postHistory || ''),
        builtin: !!p.builtin,
        isDefault: !!p.isDefault,
      };
    });
  // postHistory 的默认文案落到对应块里
  for (const p of state.presets) {
    const block = p.blocks.find(b => b.key === 'postHistory');
    if (block && !block.content && p.postHistory) block.content = p.postHistory;
  }
  if (!state.presets.some(p => p.isDefault) && state.presets.length) state.presets[0].isDefault = true;
  if (state.activePresetId && !state.presets.some(p => p.id === state.activePresetId)) {
    state.activePresetId = null;
  }
  // 世界书条目字段补全（兼容旧数据）
  state.worldBooks = normalizeWorldEntries(state.worldBooks);
  // 主角档案字段补全
  state.protagonist = { ...base.protagonist, ...(state.protagonist || {}) };
  state.memory = { ...base.memory, ...(state.memory || {}) };
  return state;
}

/**
 * 自愈时先留一份原始文本：解析失败 / 版本不匹配时，用户看到的虽是空状态，
 * 但旧数据仍能在 localStorage 里找回来（最多留 3 份，避免撑爆配额）。
 */
const BACKUP_PREFIX = `${KEY}:backup-`;

function stashBroken(raw) {
  if (!raw) return;
  try {
    // 时间戳相同时（连续自愈）也能各留一份
    localStorage.setItem(`${BACKUP_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, raw);
    const keys = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(BACKUP_PREFIX)) keys.push(k);
    }
    keys.sort();
    while (keys.length > 3) {
      const oldest = keys.shift();
      localStorage.removeItem(oldest);
    }
  } catch (err) {
    console.warn('[storage] 旧数据备份失败（可能是配额已满）', err);
  }
}

export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return defaultState();
  try {
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object' || data.version !== 1) {
      // 版本不匹配：不静默丢掉，先存档再给空状态
      stashBroken(raw);
      return defaultState();
    }
    return normalizeState(data);
  } catch (err) {
    console.warn('[storage] 读取失败，重建初始状态', err);
    stashBroken(raw);
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

/** 触发一次浏览器下载（纯前端，不上传任何数据） */
export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportData(state, includeKey = false) {
  const copy = JSON.parse(JSON.stringify(state));
  if (!includeKey) copy.settings.apiKey = '';
  downloadJSON(copy, `yetan-backup-${new Date().toISOString().slice(0, 10)}.json`);
}

/**
 * 只导出规则资产（预设 + 规则片段），体积小、适合分享。
 * 与整库备份分开，避免把 API Key 和聊天记录一起发出去。
 */
export function buildConfigExport(state) {
  return {
    kind: 'yetan-rules-config',
    version: 1,
    exportedAt: new Date().toISOString(),
    presets: (state.presets || []).map(p => ({
      name: p.name,
      description: p.description || '',
      mainPrompt: p.mainPrompt || '',
      blocks: (p.blocks || []).map(b => ({
        key: b.key,
        enabled: b.enabled !== false,
        content: b.content || '',
        ...(b.custom ? { label: b.label || b.key, custom: true } : {}),
      })),
      builtin: !!p.builtin,
      isDefault: !!p.isDefault,
    })),
    rules: (state.rules || []).map(r => ({
      name: r.name,
      content: r.content,
      position: r.position,
      depth: r.depth,
      scope: r.scope,
      boundCharacterIds: r.boundCharacterIds,
      enabled: !!r.enabled,
      builtin: !!r.builtin,
    })),
  };
}

/** 解析导入的配置文件；返回 {presets, rules} 或抛出可读错误 */
export function parseConfigImport(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('文件内容不是有效的 JSON 对象');
  const isConfig = raw.kind === 'yetan-rules-config';
  const isFullBackup = Array.isArray(raw.presets) && Array.isArray(raw.rules) && !!raw.settings;
  if (!isConfig && !isFullBackup) throw new Error('这不是夜谈导出的规则配置或备份文件');
  return {
    kind: isConfig ? 'config' : 'backup',
    presets: Array.isArray(raw.presets) ? raw.presets : [],
    rules: normalizeRules(raw.rules || []),
  };
}

/**
 * 解析整库备份（角色 / 规则 / 自定义标签 / 头像 Base64 / 聊天记录）。
 * 与「规则配置」区分开：配置文件请走规则书页的导入。
 */
export function parseBackupFile(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('文件内容不是有效的 JSON 对象');
  if (raw.kind === 'yetan-rules-config') throw new Error('这是规则配置，请到规则书页导入');
  const looksLikeState = !!raw.settings || Array.isArray(raw.characters) || Array.isArray(raw.presets);
  if (!looksLikeState) throw new Error('这不是夜谈导出的备份文件');
  return normalizeState(raw);
}
