// chat.js — 聊天页
import { ICONS } from '../icons.js';
import * as state from '../state.js';
import { streamChat, summarizeHistory, historyLimit, APIError } from '../api.js';
import { isUsableAvatar } from '../avatar.js';
import { navigate } from '../router.js';

let abortController = null;

const $ = (sel) => document.querySelector(sel);

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/**
 * 角色扮演排版高亮：台词「」与内心独白（）用不同颜色区分。
 * 先转义再上色，避免文本里的尖括号被当作标签。
 * 未闭合的括号在流式输出期间保持原样，闭合后才着色。
 */
function formatRich(text = '') {
  return escapeHTML(text)
    .replace(/「([^」\n]*)」/g, '<span class="rp-quote">「$1」</span>')
    .replace(/（([^）\n]*)）/g, '<span class="rp-inner">（$1）</span>');
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, 2600);
}

export function setStatus(kind, text) {
  const el = $('#connection-status');
  el.dataset.state = kind;
  el.querySelector('.status-text').textContent = text;
}

/** 主角头像（本地 dataURL），没有就用「你」字 */
function userAvatarHTML(char) {
  const p = state.scopeOf(char?.id || state.activeCharacterId).protagonist || {};
  if (isUsableAvatar(p.avatar)) {
    return `<div class="message-avatar user has-image"><img src="${p.avatar}" alt=""></div>`;
  }
  return '<div class="message-avatar user">你</div>';
}

function variantTools(msg) {
  if (msg.role !== 'assistant' || msg.status === 'streaming' || msg.status === 'error') return '';
  const total = msg.variants?.length || 0;
  const idx = (msg.variantIndex ?? 0) + 1;
  return `
    <div class="message-tools">
      <button class="icon-btn xs" data-action="reroll" data-id="${msg.id}" title="重新生成这条回复" aria-label="重新生成这条回复"><span class="icon">${ICONS.refresh}</span></button>
      ${total > 1 ? `<span class="variant-nav">
        <button class="icon-btn xs" data-action="variant-prev" data-id="${msg.id}" aria-label="上一个版本"><span class="icon">${ICONS.left}</span></button>
        <span class="variant-label">${idx} / ${total}</span>
        <button class="icon-btn xs" data-action="variant-next" data-id="${msg.id}" aria-label="下一个版本"><span class="icon">${ICONS.right}</span></button>
      </span>` : ''}
    </div>`;
}

function renderMessage(msg, char) {
  const isUser = msg.role === 'user';
  const author = isUser ? '你' : (char?.name || '角色');
  const color = isUser ? '#3a3a40' : (char?.color || '#E0B872');
  let cls = `message ${msg.role}`;
  if (msg.status === 'error') cls += ' error';
  const statusLine = msg.status === 'stopped' ? '<div class="message-status">已停止</div>'
    : msg.status === 'error' ? '<div class="message-status"><button class="link-btn" data-action="retry">重试</button></div>' : '';
  const textCls = msg.status === 'streaming' ? 'message-text streaming' : 'message-text';
  const charHasImage = !isUser && isUsableAvatar(char?.avatar);
  const avatar = isUser
    ? userAvatarHTML(char)
    : `<div class="message-avatar ${charHasImage ? 'has-image' : ''}" style="background:${color}">${charHasImage
      ? `<img src="${char.avatar}" alt="">`
      : escapeHTML(author.slice(0, 1))}</div>`;
  return `
    <div class="${cls}" data-msg-id="${msg.id}" style="--msg-color:${color}">
      ${avatar}
      <div class="message-body">
        <div class="message-meta"><span class="message-author">${escapeHTML(author)}</span><span class="message-time">${fmtTime(msg.createdAt)}</span></div>
        <div class="${textCls}">${formatRich(msg.content)}</div>
        ${statusLine}
        ${variantTools(msg)}
      </div>
    </div>`;
}

function scrollToBottom(force = false) {
  const box = $('#messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 120;
  if (force || nearBottom) box.scrollTop = box.scrollHeight;
  updateScrollBtn();
}

function updateScrollBtn() {
  const box = $('#messages');
  const show = box.scrollHeight - box.scrollTop - box.clientHeight > 160;
  $('#scroll-bottom-btn').classList.toggle('show', show);
}

/** 聊天背景：当前角色上传的图片 + 暗色遮罩；没图或关掉开关就清空 */
function applyChatBackground(char) {
  const bg = $('#chat-bg');
  if (!bg) return;
  const enabled = state.getState().settings.chatBackground !== false;
  const url = enabled && isUsableAvatar(char?.avatar) ? char.avatar : '';
  if (url) {
    bg.style.backgroundImage = `url("${url}")`;
    bg.classList.add('is-on');
  } else {
    bg.classList.remove('is-on');
    bg.style.backgroundImage = '';
  }
}

/** 设置页改了「聊天背景」开关后，聊天页即时生效（不重排消息） */
export function refreshChatBackground() {
  applyChatBackground(state.activeCharacter());
}

export function renderChat() {
  const s = state.getState();
  const char = state.activeCharacter();
  const msgs = state.activeMessages();

  applyChatBackground(char);

  $('#chat-character-name').textContent = char ? char.name : '未选择角色';
  $('#chat-model-name').textContent = char ? (s.settings.model || 'deepseek-chat') : '未配置模型';

  const box = $('#messages');
  if (!char) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-mark"><span class="icon">${ICONS.chat}</span></div>
        <div class="empty-title">还没有角色</div>
        <div class="empty-desc">先创建一个角色，设定它的身份与说话方式，然后开始对话。</div>
        <button class="primary-btn" data-action="goto-characters"><span class="icon">${ICONS.plus}</span><span>新建角色</span></button>
      </div>`;
  } else if (msgs.length === 0) {
    box.innerHTML = `
      <div class="empty-state">
        <div class="empty-mark" style="color:${char.color}"><span class="icon">${ICONS.chat}</span></div>
        <div class="empty-title">与 ${escapeHTML(char.name)} 的对话</div>
        <div class="empty-desc">${escapeHTML(char.description || char.systemPrompt)}</div>
        <div class="empty-desc">在下方输入第一句话开始。</div>
      </div>`;
  } else {
    box.innerHTML = `<div class="messages-inner">${msgs.map(m => renderMessage(m, char)).join('')}</div>`;
  }
  $('#composer-input').disabled = !char;
  $('#send-btn').disabled = !char;
  requestAnimationFrame(() => scrollToBottom(true));
}

function autoGrow() {
  const ta = $('#composer-input');
  ta.style.height = 'auto';
  // scrollHeight 在个别浏览器里会返回 0（尤其是刚清空时），兜一个最小行高，
  // 否则 textarea 会被压成 0px，看起来像「输入框消失」
  const next = Math.max(24, Math.min(ta.scrollHeight || 0, 120));
  ta.style.height = `${next}px`;
}

/** 局部更新一条消息的正文（流式 / 切换版本都走这里，不整页重渲染） */
function paintMessageText(id, text, streaming = false) {
  const el = document.querySelector(`.message[data-msg-id="${id}"] .message-text`);
  if (!el) return;
  el.innerHTML = formatRich(text);
  el.classList.toggle('streaming', !!streaming);
}

/**
 * 早期剧情归档：历史超过窗口时，把最旧的若干轮压成长期记忆快照并剔除原文。
 * 失败不阻塞本次发送：宁可多带一点历史，也不能让对话发不出去。
 */
async function archiveIfNeeded(char, settings) {
  if (settings.autoSummary === false) return null;
  const msgs = state.activeMessages();
  const limit = historyLimit(settings);
  const turns = Math.max(2, Math.min(30, Number(settings.summaryTurns) || 10));
  const batchSize = turns * 2;
  // 超出窗口才归档：一次只归档最旧的一批，剩余历史仍在窗口内
  if (msgs.length <= limit) return null;

  let start = 0;
  while (start < msgs.length && msgs[start].role !== 'user') start += 1;
  const batch = msgs.slice(start, start + batchSize);
  if (batch.length < 4) return null;

  const scope = state.scopeOf(char.id);
  setStatus('busy', '归档早期剧情');
  try {
    const result = await summarizeHistory({
      settings,
      memory: scope.memory?.content || '',
      messages: batch,
    });
    state.setScopeMemory(char.id, result.text);
    state.dropMessages(char.id, start + batch.length);
    toast(`已把最早 ${batch.length} 条对话归档进长期记忆`);
    return { archived: batch.length, usage: result.usage };
  } catch (err) {
    console.warn('[chat] 归档失败，继续使用完整历史', err);
    if (err instanceof APIError && err.kind === 'no_key') return null;
    toast('早期剧情归档失败，本次仍携带完整历史');
    return null;
  } finally {
    setStatus('ready', '已连接');
  }
}

export async function sendMessage() {
  if (abortController) return; // 生成中，按钮为停止
  const input = $('#composer-input');
  const text = input.value.trim();
  if (!text) return;
  const s = state.getState();
  const char = state.activeCharacter();
  if (!char) return;

  if (!s.settings.apiKey.trim()) {
    toast('请先配置 API Key');
    navigate('settings');
    return;
  }

  input.value = '';
  autoGrow();

  // 先归档（可能调用一次低温摘要请求），再取历史快照
  await archiveIfNeeded(char, s.settings);

  // 必须是快照：appendMessage 会修改 conversations 里的同一个数组，
  // 若直接传引用，本次输入会被重复塞进 history（等于同一句话发两次）
  const history = [...state.activeMessages()];
  state.appendMessage(char.id, { role: 'user', content: text });
  const placeholder = state.appendMessage(char.id, { role: 'assistant', content: '', status: 'streaming' });
  renderChat();
  setStatus('busy', '生成中');

  abortController = new AbortController();
  updateSendButton();

  try {
    const full = await streamChat({
      settings: s.settings,
      character: char,
      rulesText: state.activeRuleBuckets(char.id),
      worldText: state.activeWorldText(history, text, s.settings.worldEntryLimit, char.id).text,
      presetText: state.activePresetText(char),
      plan: state.buildPresetPlan(char, history, text, s.settings),
      history,
      userInput: text,
      signal: abortController.signal,
      onUsage: (usage) => state.recordUsage(usage, {
        characterId: char.id,
        characterName: char.name,
        model: s.settings.model,
      }),
      onDelta: (fullText) => {
        state.patchMessage(char.id, placeholder.id, { content: fullText });
        paintMessageText(placeholder.id, fullText, true);
        scrollToBottom();
      },
    });
    state.addMessageVariant(char.id, placeholder.id, full);
    setStatus('ready', '已连接');
    // 生成完再渲染一次，让 Reroll / 版本切换控件出现
    renderChat();
  } catch (err) {
    if (err.name === 'AbortError') {
      const partial = state.activeMessages().find(m => m.id === placeholder.id)?.content || '';
      if (partial.trim()) state.addMessageVariant(char.id, placeholder.id, partial);
      else state.patchMessage(char.id, placeholder.id, { status: 'stopped' });
      paintMessageText(placeholder.id, partial, false);
      toast('已停止生成');
      setStatus('ready', '已连接');
    } else {
      const msg = err instanceof APIError ? err.message : '发送失败';
      state.patchMessage(char.id, placeholder.id, { content: msg, status: 'error' });
      paintMessageText(placeholder.id, msg, false);
      const el = document.querySelector(`.message[data-msg-id="${placeholder.id}"] .message-text`);
      if (el) el.classList.remove('streaming');
      setStatus('error', '请求失败');
    }
    renderChat();
  } finally {
    abortController = null;
    updateSendButton();
  }
}

/** 重新生成：用这条回复之前的上下文再要一版，旧版本保留在 variants 里 */
async function rerollMessage(messageId) {
  if (abortController) return;
  const s = state.getState();
  const char = state.activeCharacter();
  if (!char) return;
  const msgs = state.activeMessages();
  const idx = msgs.findIndex(m => m.id === messageId);
  if (idx < 0 || msgs[idx].role !== 'assistant') return;

  let userIdx = idx - 1;
  while (userIdx >= 0 && msgs[userIdx].role !== 'user') userIdx -= 1;
  if (userIdx < 0) return;

  const userInput = msgs[userIdx].content;
  const history = msgs.slice(0, userIdx);
  const previous = msgs[idx].content;

  if (!s.settings.apiKey.trim()) {
    toast('请先配置 API Key');
    navigate('settings');
    return;
  }

  state.patchMessage(char.id, messageId, { content: '', status: 'streaming' });
  paintMessageText(messageId, '', true);
  setStatus('busy', '重新生成');
  abortController = new AbortController();
  updateSendButton();

  try {
    const full = await streamChat({
      settings: s.settings,
      character: char,
      rulesText: state.activeRuleBuckets(char.id),
      worldText: state.activeWorldText(history, userInput, s.settings.worldEntryLimit, char.id).text,
      presetText: state.activePresetText(char),
      plan: state.buildPresetPlan(char, history, userInput, s.settings),
      history,
      userInput,
      signal: abortController.signal,
      onUsage: (usage) => state.recordUsage(usage, {
        characterId: char.id,
        characterName: char.name,
        model: s.settings.model,
      }),
      onDelta: (fullText) => {
        state.patchMessage(char.id, messageId, { content: fullText });
        paintMessageText(messageId, fullText, true);
        scrollToBottom();
      },
    });
    state.addMessageVariant(char.id, messageId, full);
    setStatus('ready', '已连接');
    renderChat();
  } catch (err) {
    // 失败就把原来那版放回去，不留空白
    state.patchMessage(char.id, messageId, { content: previous, status: 'done' });
    paintMessageText(messageId, previous, false);
    setStatus('ready', '已连接');
    toast(err.name === 'AbortError' ? '已停止重新生成' : (err?.message || '重新生成失败'));
    renderChat();
  } finally {
    abortController = null;
    updateSendButton();
  }
}

function switchVariant(messageId, delta) {
  const char = state.activeCharacter();
  if (!char) return;
  const msg = state.activeMessages().find(m => m.id === messageId);
  if (!msg?.variants?.length) return;
  const next = Math.max(0, Math.min((msg.variantIndex || 0) + delta, msg.variants.length - 1));
  if (next === msg.variantIndex) return;
  state.setMessageVariant(char.id, messageId, next);
  paintMessageText(messageId, msg.variants[next], false);
  const el = document.querySelector(`.message[data-msg-id="${messageId}"]`);
  const label = el?.querySelector('.variant-label');
  if (label) label.textContent = `${next + 1} / ${msg.variants.length}`;
}

/** 快捷输入：插入成对符号并把光标放到中间 */
function insertPair(pair) {
  const ta = $('#composer-input');
  if (!ta || ta.disabled) return;
  const start = ta.selectionStart ?? ta.value.length;
  const end = ta.selectionEnd ?? start;
  const selected = ta.value.slice(start, end);
  let insert = '';
  let caret = start;
  if (pair === '「」') { insert = `「${selected}」`; caret = start + 1 + selected.length; }
  else if (pair === '（）') { insert = `（${selected}）`; caret = start + 1 + selected.length; }
  else { insert = '……'; caret = start + insert.length; }
  ta.value = ta.value.slice(0, start) + insert + ta.value.slice(end);
  ta.focus();
  ta.setSelectionRange(caret, caret);
  autoGrow();
}

function stopGeneration() {
  if (abortController) { abortController.abort(); }
}

function updateSendButton() {
  const btn = $('#send-btn');
  if (abortController) {
    btn.classList.add('is-stop');
    btn.innerHTML = `<span class="icon">${ICONS.stop}</span>`;
    btn.setAttribute('aria-label', '停止生成');
  } else {
    btn.classList.remove('is-stop');
    btn.innerHTML = `<span class="icon">${ICONS.send}</span>`;
    btn.setAttribute('aria-label', '发送');
  }
}

/**
 * 视口同步：以 visualViewport.height 作为 app 高度的唯一来源。
 * 旧实现用「100dvh - 键盘高度」二次扣减，iOS 上 dvh 本身已经随键盘变化，
 * 结果是输入区被压扁或跳动；现在只认可视高度，不再做减法。
 */
let viewportBaseline = 0;

function isEditingField() {
  const el = document.activeElement;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT');
}

function syncViewport() {
  const vv = window.visualViewport;
  const height = Math.round(vv ? vv.height : window.innerHeight);
  const offset = Math.round(vv?.offsetTop || 0);
  document.documentElement.style.setProperty('--app-height', `${height}px`);

  // 记录「没有键盘时的最大可见高度」，用来判断键盘是否弹起
  if (!isEditingField() && offset === 0) viewportBaseline = Math.max(viewportBaseline, height);
  const deficit = viewportBaseline - (height + offset);
  const mobile = window.matchMedia('(max-width: 719px)').matches;
  // 仅在「可视高度确实变小」时判定为键盘态；
  // 不能只看焦点，否则收起键盘但焦点还在时会一直压着底栏
  const open = mobile && (deficit > 80 || (isEditingField() && deficit > 20));

  const wasOpen = document.body.classList.contains('kb-open');
  document.body.classList.toggle('kb-open', open);
  if (open && !wasOpen) {
    requestAnimationFrame(() => {
      scrollToBottom(true);
      $('#composer')?.scrollIntoView({ block: 'nearest' });
    });
  }
}

function bindVisualViewport() {
  const vv = window.visualViewport;
  if (vv) {
    vv.addEventListener('resize', syncViewport, { passive: true });
    vv.addEventListener('scroll', syncViewport, { passive: true });
  }
  window.addEventListener('resize', syncViewport, { passive: true });
  window.addEventListener('orientationchange', () => {
    viewportBaseline = 0;
    setTimeout(syncViewport, 250);
  });
  // 输入框获得 / 失去焦点时，键盘高度可能滞后一两帧才更新
  document.addEventListener('focusin', () => {
    setTimeout(() => {
      syncViewport();
      // iOS 聚焦输入框时会把整个 visual viewport 上推，导致底部被截；
      // 页面本身不滚动，复位一次即可，不影响输入框位置
      if (document.body.classList.contains('kb-open')) window.scrollTo(0, 0);
    }, 90);
  });
  document.addEventListener('focusout', () => setTimeout(syncViewport, 140));
  syncViewport();
}

export function initChat() {
  const input = $('#composer-input');
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      e.preventDefault();
      sendMessage();
    }
  });
  $('#messages').addEventListener('scroll', updateScrollBtn);
  updateSendButton();
  bindVisualViewport();

  // 根据 API Key 状态初始化状态点
  const s = state.getState();
  if (s.settings.apiKey.trim()) setStatus('ready', '已连接');
  else setStatus('idle', '未配置');
}

export function handleChatAction(action, id, el) {
  if (action === 'send') {
    if (abortController) stopGeneration(); else sendMessage();
  } else if (action === 'scroll-bottom') {
    scrollToBottom(true);
  } else if (action === 'goto-characters') {
    navigate('characters');
  } else if (action === 'reroll') {
    rerollMessage(id);
  } else if (action === 'variant-prev') {
    switchVariant(id, -1);
  } else if (action === 'variant-next') {
    switchVariant(id, 1);
  } else if (action === 'insert-pair') {
    insertPair(el?.dataset.pair || '「」');
  }
}
