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

## 11. 连通性测试（2026-11-18）

- 参考 Tavo APP 的 API 设置（原生库中提取到「正在测试连接...」「API 基础 URL 不正确」「网络错误，请检查当前网络环境能否访问 API」，以及 `GET /v1/models` 加载模型列表的逻辑）。
- `api.js` 新增 `testConnection`：先校验地址与 Key（含「把网址填进 Key」「把 Key 填进地址」），再 `GET {base}/v1/models` 拉取模型；404/405 回退到 `max_tokens:1` 的最小聊天请求；401/402 直接判失败不回退。返回成功/失败类型、耗时、模型列表。
- 设置页新增「连通性测试」区块：用当前表单值测试（无需先保存），成功显示模型 chip（点击填入模型框）、验证方式与延迟；失败按类型给出排查建议。
- `e2e-connection.mjs`：**30/30 通过**。覆盖 URL/Key 校验不发请求、模型列表成功与空列表、chip 填入、404 回退且 max_tokens=1、401/402 不回退、网络错误提示、按钮状态恢复、无控制台错误。
- **测试稳定性修复**：`e2e-test.mjs` 原本用假 Key 发真实请求期望 401，环境代理不通时变成网络错误导致误报；现改为 mock 401，保持验证意图且不再依赖外网。
- 回归：23/23、23/23、32/32、31/31、49/49、25/25 全部通过。
- 截图：`screenshots/connection-idle-mobile.png`、`screenshots/connection-success-mobile.png`、`screenshots/connection-fail-mobile.png`、`screenshots/connection-desktop.png`。

## 12. 代码审查后的两个真实缺陷修复（2026-11-18）

**缺陷 1：预设模式下，提示词预算把「块顺序」打乱。**
原实现把所有 `budgeted` 块（世界书、主角、角色描述、场景、规则书等）拼成一个大字符串，整段裁剪后再插到**第一个**预算块的位置，其余预算块位置被清空。结果是：用户把世界书块拖到 Main 前面之后，角色描述 / 场景 / 规则书也跟着一起被搬到 Main 前面，编辑器里调好的顺序在发送时失效。
修复：`api.js` 新增导出的 `composePlanParts(plan, promptCharLimit)`，**逐块就地裁剪**——每块按「剩余预算」裁剪，位置保持不变，相邻预算块之间的 `\n\n` 也计入预算；非预算块（Main、角色性格、前后缀）不参与裁剪。`buildMessages` 与设置页估算都改为调用它，保证「显示的数字」与「实际发送」一致。

**缺陷 2：连通性测试的 `AbortController` 从未被中止。**
原实现创建了 `AbortController` 并把它传给 `testConnection`，但没有任何地方调用 `abort()`。服务端挂住不响应（或被墙、被代理吞包）时，请求可以一直挂着，按钮永远停在「测试中…」，因为 `connController` 非空，连再点一次都不会响应。
修复：加 10s 硬超时 `setTimeout(() => controller.abort(), CONN_TIMEOUT_MS)`，`finally` 里 `clearTimeout` 并按引用比对重置 `connController`；`AbortError` 归类为 `timeout`，给出「连接超时，请检查网络或代理」。

- 新增回归断言：`e2e-presets.mjs` 加 7 条（预算裁剪后 Main 仍在角色描述之前、世界书仍在 Main 之前、角色描述未被误删、估算字符数与实际发送一致、超限仍截断、有省略提示、非预算块不受影响）；`e2e-connection.mjs` 加 3 条（测试中按钮禁用、挂住约 10s 自动中止并提示超时、超时后按钮恢复）。
- 实测超时触发耗时 **10001 ms**，与 10s 阈值一致。
- 全量回归（7 个套件，共 223 条）：**23/23、23/23、32/32、31/31、56/56、25/25、33/33 全部通过**。

## 13. 角色独立设定：规则书 / 世界书 / 主角 / 记忆按角色整套隔离（2026-11-18）

- 背景：此前 `rules` / `worldBooks` / `protagonist` / `memory` 都是顶层全局单例，所有角色共用一套，切换角色只切 `conversations[characterId]`。后果是修仙角色与都市角色的世界书互相串台、同一个玩家无法在不同角色里拥有不同身份、剧情记忆会「想起」别的角色的事。
- 数据模型：`character.scoped = { rules, worldBooks, protagonist, memory, forkedAt }`。存在即代表该角色与通用设定脱钩；不存在时读取端回落到顶层通用设定（老数据零迁移）。`storage.js` 新增 `normalizeCharacterScope` / `normalizeCharacter`，加载时自愈补齐。
- 作用域解析（`state.js`）：`scopeOf(charId)` 用于注入（只认当前对话角色）、`viewScope()` 用于页面渲染、`editingScope()` 用于写入（目标角色未独立时整套 fork）、`forkScope()` / `resetScope()` 供 UI 显式切换。`globalScope()` 用 getter/setter 固定引用，写入既能 `push` 也能整体替换。
- 新建角色即 fork：`addCharacter()` 直接复制当前通用设定，避免多个新角色共享同一套模板。切换角色时 `editScopeId` 重置，设定页自动跟随新角色。
- 注入链路：`activeRulesText(charId)`、`activeWorldParts(history, input, limit, charId)`、`expandMacros()`（`{{user}}` 取该角色的主角名）、`buildPresetPlan()` 全部按角色取设定；`chat.js` / `settings.js` 估算显式传 `char.id`。
- UI：新增 `js/components/scope.js`，规则书页与世界书页顶部各有「设定范围」下拉（通用模板 / 各角色，独立角色标 `· 独立`）+「改为独立」/「恢复跟随通用」（后者有二次确认）。切换后经 `hint === 'scope'` 重渲染当前页。
- **顺带修复**：`world.js` 长期记忆开关调用 `state.toggleMemory()`，但该函数从未定义（点了会抛错），本次补齐。
- `e2e-scope.mjs`：**37/37 通过**。覆盖默认跟随当前角色、切换角色、编辑即整套独立、fork 继承通用条目、两个角色的世界书/规则书/主角/记忆四类注入互不串台、恢复跟随通用后不再注入旧专属内容、新建角色自带独立设定、无控制台错误。
- 全量回归（8 套，共 260 条）：**23/23、23/23、32/32、31/31、56/56、25/25、33/33、37/37 全部通过**。
- 截图：`screenshots/scope-world-mobile.png`、`screenshots/scope-rules-mobile.png`、`screenshots/scope-world-desktop.png`、`screenshots/scope-rules-desktop.png`。
- 未验证项：没有做多角色大规模数据压力测试（例如 20 个角色各带长世界书的 localStorage 体积），当前数据量级下不是瓶颈。

---

## #/rules 重构后的回归（2026-11-20）

结构从「预设卡片 + 全屏编辑器 + 规则卡片」改为「左预设编排器 + 右规则片段库」，并新增注入位置与作用域，因此重写了受影响的用例：

| 脚本 | 结果 |
| --- | --- |
| e2e-test.mjs（角色 / 对话 / 设置） | 23/23 |
| e2e-rules.mjs（规则片段 CRUD、停用启用、注入） | 24/24 |
| e2e-presets.mjs（预设切换、内联块编辑、顺序、预算裁剪、估算一致） | 33/33 |
| e2e-world.mjs（世界书 / 主角 / 记忆，顺序改为「常驻世界书 → 角色 → 主角 → 记忆 → 触发条目」） | 32/32 |
| e2e-usage.mjs（用量调节、历史裁剪） | 31/31 |
| e2e-tokens.mjs | 25/25 |
| e2e-connection.mjs | 33/33 |
| e2e-scope.mjs（角色独立设定） | 37/37 |
| smoke.mjs（双栏 / Tab / 拖拽 / 预览 / 导出 / inert） | 30/30 |
| assert-injection.mjs（三种注入位置 + 作用域，直接断言请求体） | 8/8 |

修复的实际缺陷：`buildSystem` 收到分桶数组时把数组当字符串调用 `.trim()`，导致「未启用预设 + 启用规则」时发送直接失败（旧测试未覆盖该组合，本轮新增 assert-injection 与 e2e-scope 的 legacy 路径覆盖到）。

---

## 纯前端四模块升级后的回归（2026-11-20 第二轮）

新增：主角本地头像与外貌标签、RP 快捷输入与正文高亮、Reroll 多版本、历史轮数与自动归档、请求清洗、全量备份导入、iOS 安全区与键盘适配。

| 脚本 | 结果 | 覆盖点 |
| --- | --- | --- |
| e2e-test.mjs | 23/23 | 角色 / 对话 / 设置基础流程 |
| e2e-rules.mjs | 24/24 | 规则片段 CRUD、停用启用、注入、推荐规则包 |
| e2e-presets.mjs | 33/33 | 预设切换、块顺序、预算裁剪、估算一致性 |
| e2e-world.mjs | 32/32 | 世界书 / 主角 / 记忆与注入顺序 |
| e2e-usage.mjs | 31/31 | 用量档位、历史裁剪、提示词预算 |
| e2e-tokens.mjs | 25/25 | token 统计 |
| e2e-connection.mjs | 33/33 | 连通性测试与超时中止 |
| e2e-scope.mjs | 37/37 | 角色独立设定 |
| **e2e-rp.mjs（新增）** | **35/35** | 标签拼句与追加模式、自定义标签、头像 WebP 压缩 ≤25KB、快捷输入光标、台词/心理高亮、Reroll 版本切换、2 轮=4 条历史、发送前清洗、自动归档（0.2 温度 / 剔除 20 条 / 写入记忆 / 注入新请求）、备份含头像与标签 |
| smoke.mjs | 30/30 | 规则书页 UI 冒烟 |
| assert-injection.mjs | 8/8 | 三种注入位置与作用域的实际请求体 |

累计 **273 条 e2e + 30 条 UI 冒烟 + 8 条注入断言**全部通过。

本轮修掉的问题：
1. `addMessageVariant` 在首轮回复时会把同一段文本入列两次（版本显示 `2 / 2` 变成 `3 / 3`），改为「与上一版相同则不重复入列」。
2. 自动归档的触发条件原本是 `超出窗口 + 一批`，实际要不回落到 `超出窗口` 才符合「超限即归档」的语义，已调整并补测（61 条 → 归档 20 条 → 43 条）。
3. 快捷输入键最初只放符号（`「」` `（）`），在 390px 下几乎看不清，改为「台词」「心理」「……」带字版本。

### 追加：角色图片（2026-11-20）

`e2e-rp.mjs` 扩到 **41 项**，新增 6 条覆盖：角色弹层上传入口、WebP 压缩与体积、角色卡片显示、侧栏小圆图、对话气泡头像，以及无图时回落首字。全量 **279 条 e2e + 30 条 UI 冒烟**通过。

### 追加：聊天背景与图片解码检测（2026-11-20）

`e2e-rp.mjs` 扩到 **46 项**，新增 5 条：聊天背景启用（`#chat-bg.is-on` + dataURL）、遮罩存在、设置开关即时关闭、`detectHeicSupport()` 返回布尔、角色无图时背景清空。全量 **284 条 e2e + 30 条 UI 冒烟**通过。

同时修掉一个真实问题：切换「聊天背景」开关只写了设置、页面不重绘，背景要等下次渲染才变——现在 `settings` 变更会在聊天页调用 `refreshChatBackground()` 即时生效。
