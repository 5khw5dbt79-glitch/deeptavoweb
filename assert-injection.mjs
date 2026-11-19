// assert-injection.mjs — 验证规则片段真的落到了正确位置（拦截请求体）
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:8080';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(BASE + '/#/chat', { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(300);

const setup = await page.evaluate(async () => {
  const state = await import('/js/state.js');
  state.updateSettings({ apiKey: 'sk-test', baseURL: 'https://api.deepseek.com', model: 'deepseek-chat' });

  const a = state.addCharacter({ name: '沈砚', description: '夜班图书管理员', systemPrompt: 'CHAR_PROMPT_MARK' });
  const b = state.addCharacter({ name: '林照', description: '另一个人', systemPrompt: 'OTHER' });
  state.selectCharacter(a.id);

  state.addRule({ name: '顶部规则', content: 'TOPRULE_MARK', position: 'before_main_prompt', enabled: true });
  state.addRule({ name: '角色后规则', content: 'AFTERRULE_MARK', position: 'after_char_desc', enabled: true });
  state.addRule({ name: '底部规则', content: 'DEPTHRULE_MARK', position: 'chat_history_bottom', depth: 0, enabled: true });
  state.addRule({
    name: '其他角色专用', content: 'SCOPEDRULE_MARK', position: 'after_char_desc',
    scope: 'character', boundCharacterIds: [b.id], enabled: true,
  });
  return { char: a.name, activePreset: state.getState().activePresetId };
});
console.log('setup', setup);

let body = null;
await page.route('**/chat/completions', async (route) => {
  body = JSON.parse(route.request().postData() || '{}');
  await route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    body: 'data: {"choices":[{"delta":{"content":"好"}}]}\n\ndata: [DONE]\n\n',
  });
});

await page.goto(BASE + '/#/chat', { waitUntil: 'networkidle' });
await page.waitForTimeout(300);
await page.fill('#composer-input', '在吗');
await page.press('#composer-input', 'Enter');
await page.waitForTimeout(1200);

const check = (name, pass, detail = '') => console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
if (!body) {
  console.log('FAIL  没有捕获到请求体');
  process.exit(1);
}

const msgs = body.messages;
const firstSystem = msgs[0];
const idx = (s) => msgs.findIndex(m => m.content.includes(s));
const systemText = msgs.filter(m => m.role === 'system').map(m => m.content).join('\n---\n');

check('系统提示词以顶部规则开头', firstSystem.role === 'system' && firstSystem.content.startsWith('TOPRULE_MARK'));
check('角色后规则在角色描述之后', systemText.indexOf('CHAR_PROMPT_MARK') < systemText.indexOf('AFTERRULE_MARK'));
check('角色后规则在主提示词之后', systemText.indexOf('TOPRULE_MARK') < systemText.indexOf('AFTERRULE_MARK'));
check('底部规则是独立 system 消息', msgs.filter(m => m.content.includes('DEPTHRULE_MARK')).every(m => m.role === 'system'));
check('底部规则紧贴最新输入之前', msgs[msgs.length - 2]?.content.includes('DEPTHRULE_MARK'), `index=${msgs.findIndex(m => m.content.includes('DEPTHRULE_MARK'))}/${msgs.length}`);
check('绑定其他角色的规则未注入', !systemText.includes('SCOPEDRULE_MARK'));
check('顺序：设定 → 历史 → 底部规则 → 本次输入', idx('DEPTHRULE_MARK') === msgs.length - 2);
check('无页面报错', errors.length === 0, errors.slice(0, 2).join(' | '));

console.log('\n消息结构：');
msgs.forEach((m, i) => console.log(`  #${i} ${m.role.padEnd(9)} ${m.content.replace(/\n/g, ' ').slice(0, 46)}…`));

await browser.close();
