# 测试报告

> 测试日期：2026-11-18
> 环境：Windows / Microsoft Edge（Playwright 驱动）/ 本地 HTTP 服务 `http://localhost:8080`
> 方法：自动化端到端测试（`e2e-test.mjs`）+ 人工查看截图 + 真实 API CORS 预检

## 1. 端到端测试结果（23/23 通过）

| # | 测试项 | 结果 |
|---|---|---|
| 1 | 页面加载无控制台错误 / 无 404 | PASS |
| 2 | 默认进入聊天页 | PASS |
| 3 | 无角色时显示空态引导 | PASS |
| 4 | 跳转到角色页 | PASS |
| 5 | 角色编辑弹层打开 | PASS |
| 6 | 新建角色成功 | PASS |
| 7 | 保存后弹层关闭 | PASS |
| 8 | 从角色卡进入对话 | PASS |
| 9 | 聊天头部显示当前角色名 | PASS |
| 10 | 开场白自动生成首条消息 | PASS |
| 11 | 侧栏抽屉可打开 | PASS |
| 12 | 创建第二个角色 | PASS |
| 13 | 角色切换成功 | PASS |
| 14 | 进入设置页 | PASS |
| 15 | 设置默认值正确（DeepSeek） | PASS |
| 16 | 设置保存提示 | PASS |
| 17 | 刷新后仍在设置页 | PASS |
| 18 | 刷新后 API Key 保持 | PASS |
| 19 | 刷新后角色列表保持 | PASS |
| 20 | 假 Key 请求返回 401 且错误有呈现 | PASS |
| 21 | 删除确认弹层打开 | PASS |
| 22 | 角色删除成功 | PASS |
| 23 | 无意外控制台错误 | PASS |

## 2. 逻辑单元测试（12/12 通过）

覆盖：初始状态、角色增删改查、角色切换、开场白生成、消息追加、localStorage 持久化、重载恢复、无效 activeId 自愈、损坏 JSON 自愈。

## 3. API 接入验证

- **CORS 预检**：对 `https://api.deepseek.com/v1/chat/completions` 发起 OPTIONS，服务端返回 `access-control-allow-origin` 回显来源、`access-control-allow-methods: POST`、允许 `authorization,content-type` 头 → **浏览器可直连，无需代理**
- **流式解析**：用 mock SSE 数据（4 个增量 chunk + `[DONE]`）验证 `ReadableStream` 解析，逐字追加正确，最终文本完整拼合
- **错误处理**：真实请求假 Key 返回 "API Key 无效或已过期"，错误呈现在消息位置，状态点变红

## 4. 视觉与响应式验收（人工查看截图）

| 截图 | 结论 |
|---|---|
| `desktop-chat.png` | 侧栏 264px + 聊天区，空态层次清晰，暖色强调点克制 |
| `mobile-chat.png` | 390px 宽，输入框未被 tabbar 遮挡，无横向溢出 |
| `desktop-characters.png` | 角色卡片标识色条、头像、图标对齐，无视觉噪声 |
| `desktop-conversation.png` | 消息气泡与竖线标识清晰，用户/角色消息区分明确 |
| `desktop-settings.png` | 表单分区清楚 |

**unslop 检查**：无渐变文字、无发光阴影、无 emoji 图标（全为内联 SVG）、无彩色背景块、间距统一 4px 网格、一种强调色（暖琥珀）、动效仅保留必要项。

## 5. 修复记录

开发中发现并修复的问题：

1. 组件模块导入路径错误（`./icons.js` → `../icons.js`），导致白屏
2. 数据变化后视图不刷新（引入带 hint 的状态订阅，`messages` 变化走局部更新避免打断流式）
3. 手机端输入区被底部 tabbar 遮挡（增加底部 padding）
4. 弹层 `stopPropagation` 阻断确认按钮点击（移除多余阻止）
5. 404 favicon（内联 SVG favicon）

## 6. 已知限制

- 未用真实 DeepSeek Key 做端到端实跑（无有效 Key），流式链路以 mock SSE 验证，CORS 以真实预检验证
- 原 APP 的 EJS、正则、群聊、TTS/ASR 等功能不在复刻范围（设计如此）；世界书与记忆已在后续迭代中实装，见第 7 节
- 测试使用 Edge 浏览器；Safari/iOS 真机未实测（**待验证**）

## 7. 世界书 / 主角 / 记忆迭代验收（2026-11-18）

- 新增页面 `#/world`，桌面侧栏与手机 tabbar（5 项）均可进入
- `e2e-world.mjs`：**32/32 通过**。覆盖条目 CRUD、常驻/关键词触发、开关、主角档案、长期记忆、刷新持久化、system 注入内容与顺序、停用后不再注入、删除确认、控制台无错误
- 回归：`e2e-test.mjs` 23/23、`e2e-rules.mjs` 23/23 均通过
- 截图：`screenshots/world-mobile.png`（390px）、`screenshots/world-desktop.png`（1280px），无溢出、无遮挡
- 注入顺序验证：角色设定 → 主角设定 → 长期记忆 → 常驻条目 → 关键词触发条目 → 规则书
- 关键词触发扫描最近 10 条历史消息 + 本次输入，逗号/中文逗号/竖线/换行分隔，大小写不敏感

## 8. 用量调节验收（2026-11-18）

- 设置页新增「用量与节省」：省流 / 均衡 / 完整三档预设，以及历史字符上限、世界书条目上限、提示词字符预算三个独立调节项；下方显示与真实请求同源的字符数估算。
- `e2e-usage.mjs`：**31/31 通过**。覆盖预设切换与持久化、手动调整取消高亮、历史字符裁剪（含至少保留一条）、世界书条目上限（常驻优先）、提示词分段裁剪（角色设定与前后缀保留）、预算为 0 时不裁剪、无控制台错误。
- 回归：23/23、23/23、32/32 全部通过。
- 截图：`screenshots/settings-usage-mobile.png`、`screenshots/settings-usage-desktop.png`。
- **修复真实缺陷**：`chat.js` 中 `history` 直接引用 `conversations` 数组，随后 `appendMessage` 向同一数组追加消息，导致本次输入在请求中被重复发送。改为发送前快照，并由测试断言「本次输入不重复进入历史」。

## 9. APP 风格预设管理器（2026-11-18）

- 用户提供的三张 APP 截图显示：预设列表（搜索 / 新建 / 默认标记 / ⋯ 菜单）与新建预设页（名字、基础提示词、12 个可开关排序的提示词块、未激活区）。据此在 Web 版完整复刻。
- 内置「默认」与「轻缩」两份预设，对应 APP 列表；「默认」的主提示词取自 APK `libapp.so` 提取的官方深度扮演提示词。
- `e2e-presets.mjs`：**49/49 通过**。覆盖列表搜索/新建、启用/切换/取消与刷新持久化、编辑器 12 块渲染、停用移入未激活区并恢复、↑↓ 排序、自定义块添加与持久化、设为默认、删除确认；请求体验证宏替换、默认/轻缩/自定义三套预设的块注入差异、排序生效、未启用时退回经典拼接。
- **修复真实缺陷**：`storage.js` 加载时会把预设块重排成内置定义的固定顺序，导致用户在编辑器里调整的块顺序在刷新后丢失；现改为按保存顺序还原，仅补齐缺失的内置块。
- 回归：23/23、23/23、32/32、31/31 全部通过。
- 截图：`screenshots/presets-list-mobile.png`、`screenshots/presets-editor-mobile.png`、`screenshots/presets-list-desktop.png`、`screenshots/presets-editor-desktop.png`。
- 启用预设时消息按块顺序组装：全局前缀 → 各提示词块（世界书 / 主角 / 角色 / 自定义等）→ 规则书 → 全局后缀；Chat Examples 与 Post-History Instructions 作为独立消息，Chat History 块关闭时不带历史。未启用预设时沿用原有拼接顺序。

## 10. Token 用量检测（2026-11-18）

- 设置页新增「Token 用量统计」：请求次数、输入 token、输出 token、合计 token 四项累计，加最近 7 天按日明细；数据来自 API 实际返回的 `usage`，不是本地估算。
- `api.js`：流式请求默认带 `stream_options: { include_usage: true }`，解析最后一帧的 `usage`；非流式直接读 `data.usage`；`normalizeUsage` 兼容 `prompt_tokens/promptTokens/input_tokens` 等字段命名。`onUsage` 每次请求只上报一次。
- `estimateTokens` 用于发送前粗估（CJK 按 1、其他按 0.3），与真实 usage 分开展示；设置页「高级」可关闭用量请求以兼容不支持 `stream_options` 的中转服务。
- `state.js` 增 `recordUsage` / `resetUsage`，统计含总量、按日、最近 20 条明细，随 localStorage 持久化；导出备份会带上（API Key 仍脱敏）。
- `e2e-tokens.mjs`：**25/25 通过**。覆盖流式末帧 usage 采集与 `include_usage` 请求参数、非流式 usage 累加、关闭开关后不发送 `stream_options`、刷新持久化、按日明细、清零确认与归零、本地估算显示、无控制台错误。
- 回归：23/23、23/23、32/32、31/31、49/49 全部通过。
- 截图：`screenshots/tokens-mobile.png`、`screenshots/tokens-desktop.png`。
- 未验证项：没有真实 DeepSeek Key，流式 usage 由模拟 SSE 断言；实际服务端是否返回 usage 取决于账号与服务实现。
