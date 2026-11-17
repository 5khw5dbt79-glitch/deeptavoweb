# Tavo APP 整体分析

> 分析对象：`E:\works\talk\Tavo 1.6.2.apk`（54 MB，MD5 `82cc96d7d73a79b2eadcadb6dc6f4df2`）
> 分析方式：静态解析 APK 压缩包结构、资源文件、主题配置、打包 JS 与原生库字符串；结合官方文档 `docs.tavoai.dev`。
> 分析日期：2026-11-18

## 1. 结论摘要

Tavo 是一款 **AI 角色对话（角色扮演）App**。它采用 **Flutter 原生外壳 + WebView 内嵌网页聊天界面** 的混合架构。核心对话界面本身就是一个完整的 Web 应用（HTML/CSS/JS），运行在 WebView 中；Flutter 侧负责角色库、会话存储、模型/API 配置、设置与原生能力（TTS/ASR、文件、通知）。

这一架构使得"提取对话体验并重实现为独立 Web 应用"高度可行：聊天界面的视觉与交互可直接参考其自带的前端资源，API 层为公开标准（OpenAI 兼容多供应商），无需逆向私有协议、无需触碰账号/付费/DRM。

## 2. 技术栈判定

| 层 | 技术 | 证据 |
|---|---|---|
| 外壳 | Flutter（Dart AOT） | `lib/arm64-v8a/libflutter.so`、`libapp.so`（25 MB）、`lib/arm64-v8a/libdartjni.so` |
| 对话界面 | WebView + 原生 JS/CSS | `assets/flutter_assets/assets/dist/index.html`、`bundle.min.js`（约 800 KB）、`bundle.min.css`（约 65 KB） |
| JS 运行时 | QuickJS（Flutter 内嵌） | `libfastdev_quickjs_runtime.so`、`packages/flutter_js/assets/js/fetch.js` |
| 本地数据库 | ObjectBox | `libobjectbox-jni.so` |
| 媒体播放 | media_kit（HLS） | `packages/media_kit/assets/web/hls1.4.10.js` |
| 录音 | record_web | `packages/record_web/assets/js/record.*.js` |

## 3. 页面与功能观察（静态可得部分）

- 聊天界面 DOM 根节点 `.tav-chat-container`，包含：
  - 输入区 `.tav-chat-composer`（加号附件按钮、文本域 `textarea[data-tav-role=input]`、尾部发送按钮、语音覆盖层、快捷栏）
  - 消息滚动区、回到底部/顶部按钮、选区操作按钮
  - 消息气泡右键菜单图标资源（复制/编辑/撤回/删除/隐藏/显隐/多选/展开/收起/播放）
- 主题系统：`themes/arcana/theme.json` + `style.css` + `assets.json`，支持按主题定制气泡、字体颜色、背景图、状态栏等
- 数学公式渲染：内置 KaTeX 字体（16 个 woff2）
- 动效：`lotties/tav_loading_lottie.json`、`tts_playing_lottie.json`
- 模型注册表：`registry/models.json`（32 KB），按供应商列出模型 id、上下文长度、定价（Claude/Gemini/GPT/DeepSeek 等）
- EJS 模板引擎：角色卡字段支持 `<% %>` 逻辑、`getvar/setvar/incvar` 变量函数（官方文档 Since v0.87.0）

## 4. API 接入层

从 `libapp.so` 字符串与官方文档确认：

- **协议**：OpenAI 兼容 `/v1/chat/completions`，`Authorization: Bearer`，支持 `stream` 流式、`temperature`、`messages`
- **支持的供应商**（字符串证据）：OpenAI、Anthropic/Claude、DeepSeek、Gemini（含 Google AI Studio / Vertex）、OpenRouter、xAI、MiniMax、Moonshot 等
- **DeepSeek 浏览器直连验证**：对 `https://api.deepseek.com/v1/chat/completions` 发起 OPTIONS 预检，返回 `access-control-allow-origin: http://localhost:8080`、`access-control-allow-methods: POST`、`access-control-allow-headers: authorization,content-type` → **浏览器可直连，无需本地代理**
- **模型**：`deepseek-chat`、`deepseek-reasoner`（官方 OpenAI 兼容端点 `https://api.deepseek.com`）

## 5. 复刻范围界定

**纳入（核心）**
- 聊天页：消息列表、气泡、流式输出、输入框、发送、滚动控制
- 角色管理：新建/编辑/删除/切换角色，角色卡字段（名称、简介、系统提示词、开场白、头像色）
- API 设置：供应商固定 DeepSeek，可填 API Key、Base URL、模型名、温度
- 本地持久化：角色、会话、消息、设置（localStorage）
- 响应式：手机竖屏 + 桌面

**不纳入（明确排除）**
- 账号登录、会员付费、DRM、`tavo.cc` 中继服务（无必要且不合规）
- 世界书、正则脚本、EJS 模板、群聊、TTS/ASR、图片生成、MCP、第三方角色卡导入
- 以上属于完整 Tavo 的高级功能，本复刻聚焦"对话 + 接入 API"最小闭环

## 6. 待验证项

- APK 未实际安装运行，页面跳转/动画细节未经真机录屏确认 → 标注 **待验证**
- Flutter 外壳的角色库/设置页具体视觉未在静态资源中完整体现 → 本复刻按通用设置页设计
- 部分原生字符串（如 `https://ag.tavo.cc/`）为官方中继/统计服务，用途 **待验证**，不纳入复刻
