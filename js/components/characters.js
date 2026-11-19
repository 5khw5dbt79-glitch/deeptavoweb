// characters.js — 角色页与编辑弹层
import { ICONS } from '../icons.js';
import * as state from '../state.js';
import { navigate } from '../router.js';
import { processAvatarFile, isUsableAvatar, dataUrlBytes } from '../avatar.js';

const $ = (sel) => document.querySelector(sel);

function escapeHTML(str = '') {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function fmtDate(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let selectedColor = state.COLORS[0];
let confirmFn = null; // 由 app.js 注入的通用确认弹层
let charAvatarDraft = '';

function renderSwatches() {
  const box = $('#color-swatches');
  box.innerHTML = state.COLORS.map(c =>
    `<button type="button" class="color-swatch ${c === selectedColor ? 'selected' : ''}" style="background:${c}" data-color="${c}" aria-label="选择颜色 ${c}"></button>`
  ).join('');
}

export function renderCharacters() {
  const s = state.getState();
  $('#character-count').textContent = `共 ${s.characters.length} 个角色`;

  const grid = $('#character-grid');
  if (s.characters.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;min-height:300px;border:1px dashed var(--border);border-radius:var(--r-card)">
        <div class="empty-mark"><span class="icon">${ICONS.users}</span></div>
        <div class="empty-title">还没有角色</div>
        <div class="empty-desc">创建第一个角色，给它身份、性格和开场白。</div>
        <button class="primary-btn" data-action="new-character"><span class="icon">${ICONS.plus}</span><span>新建角色</span></button>
      </div>`;
    return;
  }

  grid.innerHTML = s.characters.map(c => {
    const isActive = c.id === s.activeCharacterId;
    const count = (s.conversations[c.id] || []).length;
    const hasImage = isUsableAvatar(c.avatar);
    return `
      <article class="character-card ${isActive ? 'active-card' : ''}" style="--card-color:${c.color}">
        <div class="card-head">
          <div class="card-avatar ${hasImage ? 'has-image' : ''}" style="background:${c.color}">${hasImage
            ? `<img src="${c.avatar}" alt="">`
            : escapeHTML(c.name.slice(0, 1))}</div>
          <div style="min-width:0;flex:1">
            <div class="card-name">${escapeHTML(c.name)}</div>
            <div class="card-desc">${escapeHTML(c.description || '暂无简介')}</div>
          </div>
        </div>
        <div class="card-prompt">${escapeHTML(c.systemPrompt)}</div>
        <div class="card-foot">
          <div class="card-meta">${isActive ? '<span class="active-tag">当前</span> ' : ''}${count} 条消息 · ${fmtDate(c.updatedAt)}</div>
          <div class="card-actions">
            <button class="icon-btn" data-action="chat-with" data-id="${c.id}" aria-label="与 ${escapeHTML(c.name)} 对话" title="对话"><span class="icon">${ICONS.chat}</span></button>
            <button class="icon-btn" data-action="edit-character" data-id="${c.id}" aria-label="编辑 ${escapeHTML(c.name)}" title="编辑"><span class="icon">${ICONS.edit}</span></button>
            <button class="icon-btn" data-action="delete-character" data-id="${c.id}" aria-label="删除 ${escapeHTML(c.name)}" title="删除"><span class="icon">${ICONS.trash}</span></button>
          </div>
        </div>
      </article>`;
  }).join('');
}

/** 角色图片预览：有图显示图片，没图显示名字首字 */
function renderCharAvatarPreview() {
  const box = $('#char-avatar-preview');
  if (!box) return;
  const note = $('#char-avatar-note');
  const removeBtn = $('#char-avatar-remove');
  const name = ($('#char-name')?.value || '').trim();
  if (isUsableAvatar(charAvatarDraft)) {
    box.classList.add('has-image');
    box.innerHTML = `<img src="${charAvatarDraft}" alt="角色图片预览">`;
    if (removeBtn) removeBtn.hidden = false;
    if (note) note.textContent = `已就绪 · ${(dataUrlBytes(charAvatarDraft) / 1024).toFixed(1)} KB · 仅存在本机`;
  } else {
    box.classList.remove('has-image');
    box.innerHTML = `<span class="avatar-initial">${escapeHTML((name || '角').slice(0, 1))}</span>`;
    if (removeBtn) removeBtn.hidden = true;
    if (note) note.textContent = '在本机裁剪成 240×240 WebP（≤25KB），用于角色卡片与对话气泡，不会发送给模型。';
  }
}

export function openCharacterModal(id = null) {
  const form = $('#character-form');
  form.reset();
  const char = id ? state.getState().characters.find(c => c.id === id) : null;
  $('#modal-title').textContent = char ? '编辑角色' : '新建角色';
  $('#char-id').value = char?.id || '';
  $('#char-name').value = char?.name || '';
  $('#char-desc').value = char?.description || '';
  $('#char-prompt').value = char?.systemPrompt || '';
  $('#char-greeting').value = char?.greeting || '';
  selectedColor = char?.color || state.COLORS[0];
  charAvatarDraft = isUsableAvatar(char?.avatar) ? char.avatar : '';
  renderSwatches();
  renderCharAvatarPreview();
  $('#character-modal').hidden = false;
  setTimeout(() => $('#char-name').focus(), 50);
}

export function closeCharacterModal() {
  $('#character-modal').hidden = true;
}

export function initCharacters(confirm) {
  confirmFn = confirm;
  $('#color-swatches').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-color]');
    if (!btn) return;
    selectedColor = btn.dataset.color;
    renderSwatches();
  });

  // 角色图片：本地读取 → canvas 压缩，不上传
  $('#char-avatar-file')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const box = $('#char-avatar-preview');
    const note = $('#char-avatar-note');
    box?.classList.add('is-loading');
    if (note) note.textContent = '正在压缩…';
    try {
      const result = await processAvatarFile(file);
      charAvatarDraft = result.dataUrl;
      renderCharAvatarPreview();
    } catch (err) {
      if (note) note.textContent = err?.message || '图片处理失败，换一张试试';
    } finally {
      box?.classList.remove('is-loading');
    }
  });

  $('#character-modal').addEventListener('click', (e) => {
    if (e.target.closest('[data-action="remove-char-avatar"]')) {
      charAvatarDraft = '';
      renderCharAvatarPreview();
    }
  });

  $('#char-name').addEventListener('input', () => {
    if (!isUsableAvatar(charAvatarDraft)) renderCharAvatarPreview();
  });

  $('#character-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const data = {
      name: fd.get('name'),
      description: fd.get('description'),
      systemPrompt: fd.get('systemPrompt'),
      greeting: fd.get('greeting'),
      color: selectedColor,
      avatar: charAvatarDraft,
    };
    const id = fd.get('id');
    if (id) state.updateCharacter(id, data);
    else state.addCharacter(data);
    closeCharacterModal();
  });
}

export function handleCharacterAction(action, id) {
  if (action === 'new-character') openCharacterModal();
  else if (action === 'edit-character') openCharacterModal(id);
  else if (action === 'chat-with') { state.selectCharacter(id); navigate('chat'); }
  else if (action === 'delete-character') {
    const char = state.getState().characters.find(c => c.id === id);
    if (!char) return;
    confirmFn?.(
      '删除角色',
      `确定删除「${char.name}」吗？该角色的所有对话记录也会一并删除，此操作无法撤销。`,
      () => state.deleteCharacter(id),
      '删除'
    );
  }
}
