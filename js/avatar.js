// avatar.js — 纯本地头像处理：居中裁剪 → 等比缩放 → WebP 压缩
// 结果只作为 dataURL 存在 localStorage，用于界面展示，绝不进入 API 请求。

export const AVATAR_SIZE = 240;
export const AVATAR_MAX_BYTES = 25 * 1024;
const QUALITY_STEPS = [0.8, 0.72, 0.64, 0.56, 0.5];
const SIZE_STEPS = [240, 216, 192, 168];

/** dataURL 的近似字节数（base64 膨胀 4/3） */
export function dataUrlBytes(dataUrl = '') {
  const comma = String(dataUrl).indexOf(',');
  if (comma < 0) return 0;
  const body = String(dataUrl).slice(comma + 1);
  return Math.round((body.length * 3) / 4);
}

/** 浏览器解码能力：优先 createImageBitmap，失败再回退 <img>；两者都失败才算真的不支持 */
function loadBitmap(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file).catch(() => loadViaImage(file));
  }
  return loadViaImage(file);
}

function loadViaImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      const err = new Error('DECODE_FAILED');
      err.code = 'decode_failed';
      reject(err);
    };
    img.src = url;
  });
}

/**
 * 检测浏览器是否具备 HEIC 解码能力（WebCodecs 的 ImageDecoder 标准接口）。
 * 注意：这只是「声称支持」，最终仍以实际解码结果为准；检测不到就按不支持处理。
 * @returns {Promise<boolean>}
 */
let heicSupport = null;
export async function detectHeicSupport() {
  if (heicSupport !== null) return heicSupport;
  try {
    if (typeof ImageDecoder !== 'undefined' && typeof ImageDecoder.isTypeSupported === 'function') {
      heicSupport = await ImageDecoder.isTypeSupported('image/heic');
      // 部分浏览器只认 image/heif 写法
      if (!heicSupport) heicSupport = await ImageDecoder.isTypeSupported('image/heif');
    } else {
      heicSupport = false;
    }
  } catch (_) {
    heicSupport = false;
  }
  return heicSupport;
}

/** 把解码失败翻译成用户能照做的提示 */
async function decodeError(file) {
  const type = String(file?.type || '').toLowerCase();
  const isHeic = /heic|heif/.test(type) || /\.hei[cf]$/i.test(file?.name || '');
  const supported = await detectHeicSupport();
  if (isHeic) {
    if (supported) {
      return new Error('这张 HEIC 解码失败，可能是苹果的 10-bit / 连拍格式；换一张，或在相册里另存为 JPG 再上传');
    }
    return new Error('当前浏览器不支持直接读取 HEIC，请在相册里另存为 JPG / PNG 后再上传');
  }
  return new Error('图片读取失败，换一张试试，或先转成 JPG / PNG');
}

function drawSquare(source, size) {
  const sw = source.width || source.naturalWidth;
  const sh = source.height || source.naturalHeight;
  if (!sw || !sh) throw new Error('这张图片没有可用的像素数据');
  const side = Math.min(sw, sh);
  const sx = Math.round((sw - side) / 2);
  const sy = Math.round((sh - side) / 2);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, side, side, 0, 0, size, size);
  return canvas;
}

function encode(canvas, quality) {
  // 优先 WebP；个别浏览器不支持时 toDataURL 会回落到 PNG，体积会大一些
  const webp = canvas.toDataURL('image/webp', quality);
  if (webp.startsWith('data:image/webp')) return webp;
  return canvas.toDataURL('image/jpeg', quality);
}

/**
 * 把用户选的照片压成 240×240 的 WebP（≤25KB）。
 * @param {File} file
 * @returns {Promise<{dataUrl:string, bytes:number, width:number, height:number}>}
 */
export async function processAvatarFile(file) {
  if (!file) throw new Error('没有选择图片');
  if (file.type && !/^image\//i.test(file.type)) {
    throw new Error('请选择图片文件（iPhone 的 HEIC 请先在相册里转存为 JPG）');
  }
  if (file.size > 20 * 1024 * 1024) throw new Error('图片太大（超过 20MB），请先压缩后再选');

  let source;
  try {
    source = await loadBitmap(file);
  } catch (err) {
    throw await decodeError(file);
  }
  let best = null;

  for (const size of SIZE_STEPS) {
    const canvas = drawSquare(source, size);
    for (const quality of QUALITY_STEPS) {
      const dataUrl = encode(canvas, quality);
      const bytes = dataUrlBytes(dataUrl);
      if (!best || bytes < best.bytes) best = { dataUrl, bytes, width: size, height: size };
      if (bytes <= AVATAR_MAX_BYTES) {
        if (source.close) source.close();
        return { dataUrl, bytes, width: size, height: size };
      }
    }
  }

  if (source.close) source.close();
  if (!best) throw new Error('头像处理失败，换一张图片试试');
  // 仍然超标就返回最小的一版，至少不会把存储写爆
  return best;
}

/** 头像 dataURL 是否可用（用于模板里决定显示图片还是首字母） */
export function isUsableAvatar(value) {
  return typeof value === 'string' && /^data:image\/(?:webp|jpeg|png);base64,/i.test(value);
}
