// preset-io.js — 与 SillyTavern 预设（.json）互转
// 只做字段映射，不联网、不执行任何脚本；无法识别的条目会降级保存为自定义块，避免丢内容。
import { blockDef, normalizePresetBlocks } from './storage.js';

/** 我们的块 key → SillyTavern 的 prompt identifier */
const KEY_TO_ST = {
  main: 'main',
  lorebookBefore: 'worldInfoBefore',
  lorebookAfter: 'worldInfoAfter',
  charDescription: 'charDescription',
  charPersonality: 'charPersonality',
  scenario: 'scenario',
  persona: 'personaDescription',
  chatHistory: 'chatHistory',
  chatExamples: 'dialogueExamples',
  enhanceDefinitions: 'enhanceDefinitions',
  auxiliaryPrompt: 'auxilaryPrompt',
  postHistory: 'postHistoryInstructions',
};

/** SillyTavern identifier → 我们的块 key */
const ST_TO_KEY = Object.entries(KEY_TO_ST).reduce((acc, [key, id]) => {
  acc[id] = key;
  return acc;
}, { jailbreak: 'postHistory' });

const ST_LABELS = {
  main: 'Main Prompt',
  worldInfoBefore: 'World Info (before)',
  worldInfoAfter: 'World Info (after)',
  charDescription: 'Char Description',
  charPersonality: 'Char Personality',
  scenario: 'Scenario',
  personaDescription: 'Persona Description',
  chatHistory: 'Chat History',
  dialogueExamples: 'Chat Examples',
  enhanceDefinitions: 'Enhance Definitions',
  auxilaryPrompt: 'Auxiliary Prompt',
  postHistoryInstructions: 'Post-History Instructions',
};

/** 这些是 ST 的 UI 提示语，不是真正注入的内容，导入时直接忽略 */
const SKIP_IDENTIFIERS = new Set([
  'newChat', 'newGroupChat', 'newExampleChat', 'continueNudge', 'impersonation',
  'groupNudge', 'worldInfoFormat', 'scenarioFormat', 'personalityFormat', 'charPrompt',
]);

function toText(value) {
  return typeof value === 'string' ? value : '';
}

/**
 * 解析 SillyTavern 预设或夜谈导出的预设。
 * @returns {{name:string, description:string, mainPrompt:string, blocks:Array, warnings:string[], source:string}}
 */
export function parsePresetFile(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('文件内容不是有效的 JSON 对象');
  const warnings = [];

  // 1) 夜谈自己导出的（extensions.yetan 或 kind）
  const yetan = raw.extensions?.yetan || (raw.kind === 'yetan-preset' ? raw : null);
  if (yetan && Array.isArray(yetan.blocks) && yetan.blocks.length) {
    const mainPrompt = toText(raw.main_prompt ?? raw.mainPrompt ?? yetan.mainPrompt);
    const blocks = normalizePresetBlocks(yetan.blocks, mainPrompt);
    return {
      name: toText(raw.name) || '导入的预设',
      description: toText(raw.description) || '',
      mainPrompt,
      blocks,
      warnings,
      source: 'yetan',
    };
  }

  // 2) SillyTavern：prompts + prompt_order
  if (Array.isArray(raw.prompts)) {
    const byIdentifier = new Map();
    for (const prompt of raw.prompts) {
      if (!prompt || typeof prompt !== 'object') continue;
      const identifier = toText(prompt.identifier) || toText(prompt.name);
      if (!identifier || byIdentifier.has(identifier)) continue;
      byIdentifier.set(identifier, prompt);
    }

    // prompt_order 决定顺序与启用状态；有的文件有多个角色条目的顺序表，取第一个非空
    let order = [];
    if (Array.isArray(raw.prompt_order)) {
      const first = raw.prompt_order.find(o => Array.isArray(o?.order) && o.order.length);
      order = first ? first.order : [];
    } else if (raw.prompt_order && typeof raw.prompt_order === 'object' && Array.isArray(raw.prompt_order.order)) {
      order = raw.prompt_order.order;
    }

    const entries = [];
    const seen = new Set();
    for (const item of order) {
      const identifier = toText(item?.identifier);
      if (!identifier || seen.has(identifier)) continue;
      seen.add(identifier);
      entries.push({ identifier, enabled: item?.enabled !== false, prompt: byIdentifier.get(identifier) || null });
    }
    // prompt_order 里没有的条目按 prompts 原顺序补上（默认启用）
    for (const [identifier, prompt] of byIdentifier) {
      if (seen.has(identifier)) continue;
      seen.add(identifier);
      entries.push({ identifier, enabled: prompt.enabled !== false, prompt });
    }

    const blocks = [];
    let mainPrompt = '';
    let postHistoryExtra = '';
    for (const { identifier, enabled, prompt } of entries) {
      const content = toText(prompt?.content);
      const key = ST_TO_KEY[identifier];
      if (SKIP_IDENTIFIERS.has(identifier)) continue;

      if (!key) {
        // 未知条目：有内容就留着，当自定义块，避免用户设置被吞掉
        if (!content.trim()) continue;
        if (blocks.some(b => b.key === `st_${identifier}`)) continue;
        blocks.push({
          key: `st_${identifier}`,
          enabled,
          content,
          custom: true,
          label: toText(prompt?.name) || ST_LABELS[identifier] || identifier,
        });
        continue;
      }

      if (key === 'main') mainPrompt = content;
      if (key === 'postHistory') {
        if (blocks.some(b => b.key === 'postHistory')) {
          postHistoryExtra = content;
        } else {
          blocks.push({ key, enabled, content });
        }
        continue;
      }
      if (blocks.some(b => b.key === key)) continue;
      blocks.push({ key, enabled, content });
    }

    if (postHistoryExtra) {
      const block = blocks.find(b => b.key === 'postHistory');
      if (block) block.content = [block.content, postHistoryExtra].filter(Boolean).join('\n\n');
    }

    if (!mainPrompt) {
      const main = blocks.find(b => b.key === 'main');
      mainPrompt = main?.content || '';
    }
    if (!blocks.length) throw new Error('预设里没有可用的提示词块');

    const customCount = blocks.filter(b => b.custom).length;
    if (customCount) {
      warnings.push(`${customCount} 个无法对应到内置位置的条目，已作为自定义提示词块保留`);
    }

    return {
      name: toText(raw.name) || toText(raw.preset_name) || '导入的预设',
      description: toText(raw.description) || '从 SillyTavern 预设导入',
      mainPrompt,
      blocks: normalizePresetBlocks(blocks, mainPrompt),
      warnings,
      source: 'sillytavern',
    };
  }

  throw new Error('无法识别的预设格式：既没有 prompts，也没有夜谈的 blocks');
}

/**
 * 导出为 SillyTavern 可读的预设 JSON（同时带上 yetan 扩展，便于夜谈无损回导）。
 * 温度等采样参数不写入，避免与设置页的配置互相覆盖。
 */
export function serializePreset(preset) {
  const blocks = Array.isArray(preset.blocks) ? preset.blocks : [];
  const prompts = [];
  const order = [];

  for (const block of blocks) {
    // 注入槽在 SillyTavern 里没有对应概念，只写进 yetan 扩展
    if (block.marker || blockDef(block.key)?.marker) continue;
    const identifier = KEY_TO_ST[block.key] || block.key;
    prompts.push({
      identifier,
      name: block.custom ? (block.label || block.key) : (ST_LABELS[identifier] || blockDef(block.key)?.label || block.key),
      system_prompt: block.key !== 'chatHistory' && block.key !== 'chatExamples',
      role: 'system',
      content: block.content || '',
      marker: ['chatHistory', 'chatExamples', 'lorebookBefore', 'lorebookAfter', 'charDescription', 'charPersonality', 'persona', 'scenario'].includes(block.key),
    });
    order.push({ identifier, enabled: block.enabled !== false });
  }

  return {
    name: preset.name || '未命名预设',
    description: preset.description || '',
    prompts,
    prompt_order: [{ character_id: 100001, order }],
    extensions: {
      yetan: {
        version: 1,
        mainPrompt: preset.mainPrompt || '',
        blocks: blocks.map(b => ({
          key: b.key,
          enabled: b.enabled !== false,
          content: b.content || '',
          ...(b.custom ? { label: b.label || b.key, custom: true } : {}),
        })),
      },
    },
  };
}

/** 预设顺序的可读摘要，用于卡片上的「注入顺序」小条 */
export function presetOrderSummary(preset, limit = 6) {
  const blocks = (preset?.blocks || []).filter(b => b.enabled !== false && !b.marker && !blockDef(b.key)?.marker);
  const names = blocks.map(b => {
    if (b.custom) return b.label || '自定义';
    return blockDef(b.key)?.cn || b.key;
  });
  if (names.length <= limit) return names;
  return [...names.slice(0, limit - 1), `…+${names.length - limit + 1}`];
}
