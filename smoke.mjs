// smoke.mjs — 规则书页改造的冒烟检查（桌面 + 手机）
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
};

const browser = await chromium.launch({ headless: true, channel: 'msedge' });

// ---- 桌面 ----
const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await desktop.newPage();
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));

await page.goto(BASE + '#/rules', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);

// 先建一个角色，预览才有内容可拼
await page.goto(BASE + '#/characters', { waitUntil: 'networkidle' });
await page.locator('[data-action="new-character"]').first().click();
await page.waitForTimeout(200);
await page.fill('#char-name', '沈砚');
await page.fill('#char-desc', '夜班图书管理员');
await page.fill('#char-prompt', '话不多，观察力强，说话带一点沙哑。');
await page.locator('#character-form button[type="submit"]').click();
await page.waitForTimeout(300);
await page.goto(BASE + '#/rules', { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

check('规则书页激活', await page.locator('#page-rules.is-active').count() === 1);
check('双栏布局', await page.locator('.rules-workbench .wb-col').count() === 2);
check('预设下拉有 4 套内置预设', await page.locator('#preset-select option').count() === 4,
  (await page.locator('#preset-select option').allTextContents()).join(' | '));
check('开箱有默认预设启用', (await page.locator('#preset-count').textContent())?.includes('启用中'));
check('块列表渲染', await page.locator('#block-list .block-row').count() >= 8);
check('两个规则槽位', await page.locator('#block-list .block-slot').count() === 2);
check('槽位显示流入规则数', (await page.locator('#block-list .block-slot').first().textContent())?.includes('条规则流入'));
check('规则库有 4 条内置规则', await page.locator('.rule-card').count() === 4);
check('规则生效标记', await page.locator('.rule-card.rule-on').count() === 4);
check('规则卡显示注入位置', (await page.locator('.rule-card').first().textContent())?.includes('角色设定后'));
check('页面顶部计数', (await page.locator('#rule-count').textContent())?.includes('已启用 4'));

// 展开块编辑
await page.locator('#block-list [data-action="block-edit"]').first().click();
await page.waitForTimeout(150);
check('块编辑展开', await page.locator('#block-list .block-editor:not([hidden])').count() === 1);
const openEditor = page.locator('#block-list .block-editor:not([hidden]) textarea');
await openEditor.fill('测试主提示词');
await openEditor.blur();
await page.waitForTimeout(200);

// 拖拽排序：把第 3 块拖到第 1 块前
const rows = page.locator('#block-list .block-row');
const firstKey = await rows.first().getAttribute('data-block-key');
await rows.nth(3).dragTo(rows.first(), { targetPosition: { x: 40, y: 4 } });
await page.waitForTimeout(250);
const newFirstKey = await page.locator('#block-list .block-row').first().getAttribute('data-block-key');
check('拖拽调整块顺序', firstKey !== newFirstKey, `${firstKey} → ${newFirstKey}`);

// 预览
await page.locator('[data-action="open-preview"]').first().click();
await page.waitForTimeout(300);
check('预览浮层打开', await page.locator('#prompt-preview:not([hidden])').count() === 1);
check('预览有消息', await page.locator('.prev-msg').count() >= 2, String(await page.locator('.prev-msg').count()));
check('预览统计 token', (await page.locator('#preview-summary').textContent())?.includes('token'));
check('预览含历史底部规则', (await page.locator('#preview-warnings').textContent())?.includes('历史底部'));
await page.screenshot({ path: 'screenshots/rules-preview.png' });
await page.locator('.preview-head [data-action="close-preview"]').click();
await page.waitForTimeout(200);
check('预览可关闭', await page.locator('#prompt-preview[hidden]').count() === 1);

// 新建规则 + 注入位置
await page.locator('#col-rules [data-action="new-rule"]').click();
await page.waitForTimeout(200);
await page.fill('#rule-name', '第三人称叙事');
await page.fill('#rule-content', '始终用第三人称叙述。');
await page.selectOption('#rule-position', 'chat_history_bottom');
await page.waitForTimeout(100);
check('选历史底部时出现深度滑块', await page.locator('#rule-depth-group:not([hidden])').count() === 1);
await page.locator('#rule-form button[type="submit"]').click();
await page.waitForTimeout(300);
check('新建规则成功', await page.locator('.rule-card').count() === 5);
check('新规则显示 Depth 标记', (await page.locator('#rule-list').textContent())?.includes('D0'));

// 作用域绑定
await page.locator('.rule-card').filter({ hasText: '第三人称叙事' }).locator('[data-action="edit-rule"]').click();
await page.waitForTimeout(200);
await page.selectOption('#rule-scope', 'character');
await page.waitForTimeout(100);
check('选仅指定角色时出现角色选择', await page.locator('#rule-chars-group:not([hidden])').count() === 1);
await page.locator('#rule-form button[type="submit"]').click();
await page.waitForTimeout(250);

// 页面截图
await page.locator('#col-rules').scrollIntoViewIfNeeded();
await page.screenshot({ path: 'screenshots/rules-desktop.png', fullPage: true });

// 导出配置（拦截下载）
let downloadName = '';
const [download] = await Promise.all([
  page.waitForEvent('download', { timeout: 4000 }).catch(() => null),
  page.locator('.page-header-actions [data-action="export-config"]').click(),
]);
if (download) downloadName = download.suggestedFilename();
check('导出配置触发下载', downloadName.startsWith('yetan-rules'), downloadName);

// 无障碍：非激活页 inert
check('非激活页面 inert', await page.locator('#page-chat[inert]').count() === 1);
check('非激活页面 aria-hidden', await page.locator('#page-chat[aria-hidden="true"]').count() === 1);

check('无控制台报错（桌面）', errors.length === 0, errors.slice(0, 3).join(' | '));
await desktop.close();

// ---- 手机 ----
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mobile.newPage();
const mErrors = [];
mp.on('pageerror', e => mErrors.push(e.message));
mp.on('console', m => { if (m.type() === 'error') mErrors.push(m.text()); });
await mp.goto(BASE + '#/rules', { waitUntil: 'networkidle' });
await mp.waitForTimeout(400);
check('手机显示 Tab 切换', await mp.locator('.wb-tab').first().isVisible());
check('手机默认显示预设栏', await mp.locator('#col-presets').isVisible() && !(await mp.locator('#col-rules').isVisible()));
await mp.locator('.wb-tab[data-tab="rules"]').click();
await mp.waitForTimeout(250);
check('切到规则库', await mp.locator('#col-rules').isVisible() && !(await mp.locator('#col-presets').isVisible()));
await mp.screenshot({ path: 'screenshots/rules-mobile.png', fullPage: true });
check('无控制台报错（手机）', mErrors.length === 0, mErrors.slice(0, 3).join(' | '));
await mobile.close();

await browser.close();

const failed = results.filter(r => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
