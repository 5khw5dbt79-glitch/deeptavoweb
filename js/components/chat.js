// chat.js — 聊天页
import { ICONS } from '../icons.js';
import * as state from '../state.js';
import { streamChat, APIError } from '../api.js';
import { navigate } from '../router.js';

let abortController = null;

const $ = (sel) => document.querySelector(sel);

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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

function renderMessage(msg, char) {
  const isUser = msg.role === 'user';
  const author = isUser ? '你' : (char?.name || '角色');
  const color = isUser ? '#3a3a40' : (char?.color || '#E0B872');
  const initial = escapeHTML(author.slice(0, 1));
  let cls = `message ${msg.role}`;
  if (msg.status === 'error') cls += ' error';
  const statusLine = msg.status === 'stopped' ? '<div class="message-status">已停止</div>'
    : msg.status === 'error' ? '<div class="message-status"><button class="link-btn" data-action="retry">重试</button></div>' : '';
  const textCls = msg.status === 'streaming' ? 'message-text streaming' : 'message-text';
  return `
    <div class="${cls}" data-msg-id="${msg.id}" style="--msg-color:${color}">
      <div class="message-avatar ${isUser ? 'user' : ''}" style="background:${color}">${initial}</div>
      <div class="message-body">
        <div class="message-meta"><span class="message-author">${escapeHTML(author)}</span><span class="message-time">${fmtTime(msg.createdAt)}</span></div>
        <div class="${textCls}">${escapeHTML(msg.content)}</div>
        ${statusLine}
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

export function renderChat() {
  const s = state.getState();
  const char = state.activeCharacter();
  const msgs = state.activeMessages();

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
  ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
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
      rulesText: state.activeRulesText(char.id),
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
        const el = document.querySelector(`.message[data-msg-id="${placeholder.id}"] .message-text`);
        if (el) { el.textContent = fullText; el.classList.add('streaming'); }
        scrollToBottom();
      },
    });
    state.patchMessage(char.id, placeholder.id, { content: full, status: 'done' });
    setStatus('ready', '已连接');
  } catch (err) {
    if (err.name === 'AbortError') {
      const el = document.querySelector(`.message[data-msg-id="${placeholder.id}"] .message-text`);
      state.patchMessage(char.id, placeholder.id, { status: 'stopped' });
      if (el) el.classList.remove('streaming');
      toast('已停止生成');
      setStatus('ready', '已连接');
    } else {
      const msg = err instanceof APIError ? err.message : '发送失败';
      const el = document.querySelector(`.message[data-msg-id="${placeholder.id}"] .message-text`);
      state.patchMessage(char.id, placeholder.id, { content: msg, status: 'error' });
      if (el) { el.textContent = msg; el.classList.remove('streaming'); }
      setStatus('error', '请求失败');
    }
    renderChat();
  } finally {
    abortController = null;
    updateSendButton();
  }
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

  // 根据 API Key 状态初始化状态点
  const s = state.getState();
  if (s.settings.apiKey.trim()) setStatus('ready', '已连接');
  else setStatus('idle', '未配置');
}

export function handleChatAction(action) {
  if (action === 'send') {
    if (abortController) stopGeneration(); else sendMessage();
  } else if (action === 'scroll-bottom') {
    scrollToBottom(true);
  } else if (action === 'goto-characters') {
    navigate('characters');
  }
}
