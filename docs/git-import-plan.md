# 把「夜谈」导入 Git 并发布到 GitHub Pages：Agent 执行方案

> 面向编码 Agent（Cursor / Claude Code / Codex / WorkBuddy 等）的可执行 runbook。
> 目标：把当前工作区这批改动**安全入库 → 推送 → 触发 Pages 部署 → 验收**，全程不泄露 API Key、不覆盖远端历史。

---

## 0. 现状（2026-11-20 实测）

| 项 | 实际值 |
| --- | --- |
| 工作目录 | `E:/game/job/2026-11-16-21-50-41/tavo-web` |
| 是否已是 Git 仓库 | 是（`main` 跟踪 `origin/main`，本地与远端 **0/0 无差距**） |
| 远端 | `https://github.com/5khw5dbt79-glitch/deeptavoweb.git` |
| 部署方式 | 已提交 `.github/workflows/deploy.yml`，**push 到 main 即触发** Actions 发布 Pages |
| 未提交改动 | 16 个已跟踪文件修改（+2937 / −663），9 个未跟踪文件 |
| 未跟踪且**需要入库** | `manifest.json`、`icon-180/192/512.png`、`js/avatar.js`、`js/components/preview.js`、`js/preset-io.js` |
| 未跟踪但**按策略决定** | `smoke.mjs`、`assert-injection.mjs`（见 §3.2） |
| 不应入库 | `node_modules/`、`screenshots/`、`e2e-*.mjs`（已在 `.gitignore`） |
| 密钥扫描 | 产品代码与文档中**未发现** `sk-…` 形式的真实 Key（Key 只存在于浏览器 localStorage） |
| 环境注意 | `gh` 未安装；`core.autocrlf=true`（提交时会出现 LF→CRLF 警告，属正常） |

**Pages 预期地址**：`https://5khw5dbt79-glitch.github.io/deeptavoweb/`（以 Actions 运行结果里的 `page_url` 为准）。
项目全部用相对路径（`./css/…`、`./js/…`），无需构建、无需改 `base`。

---

## 1. 目标与不可逾越的边界

必须做到：

1. 产品代码、PWA 资源、文档入库，`main` 可正常发布。
2. **不提交**任何真实 API Key、聊天记录、`node_modules`、截图。
3. **不 force push**、不改写远端历史；失败只做增量提交或 `git revert`。
4. 提交前先打一个本地 tag，任何异常都能回到原状。

---

## 2. 预检（Agent 必须先跑，逐条确认再动）

```bash
cd "E:/game/job/2026-11-16-21-50-41/tavo-web"

git rev-parse --is-inside-work-tree          # 必须是 true
git branch --show-current                    # 必须是 main
git remote -v                               # 必须指向 deeptavoweb.git
git fetch origin                            # 先同步，避免基于过期历史
git rev-list --left-right --count origin/main...main   # 期望 0  0

# 密钥 / 隐私扫描：命中即停下报告，不要提交
grep -rIn "sk-[A-Za-z0-9]\{16,\}" --include=*.js --include=*.html --include=*.json --include=*.md . \
  | grep -v node_modules | grep -v "sk-…"

# 确认忽略规则仍然有效
git check-ignore -v node_modules screenshots e2e-rp.mjs
```

预检判定：

- 若 `origin/main...main` 不是 `0 0` → 说明本地有未推送提交或远端有新提交，**先 `git pull --rebase` 或报告给用户**，不要直接提交。
- 若密钥扫描有命中 → 停止，交给用户处理（改历史要用 `git filter-repo`，不在本方案范围）。

---

## 3. 提交分组方案

### 3.1 安全动作先行：打 tag

```bash
git tag "pre-pwa-$(date +%Y%m%d-%H%M)"   # 出错时 git reset --hard <tag>
```

### 3.2 测试脚本的取舍（二选一，默认 A）

- **A（推荐，默认）**：`smoke.mjs`、`assert-injection.mjs` 一起提交（纯文本、无依赖运行时，方便复现）；`e2e-*.mjs` 维持 `.gitignore`（体积与历史惯例）。
- **B（全量测试入库）**：删掉 `.gitignore` 里的 `e2e-*.mjs` 一行，把 10 个脚本全部提交，并在 README 标注「需 `npm i -D playwright`」。

无论选哪个，**不要用 `git add -A` / `git add .`**，用显式路径，避免误收临时文件与截图。

### 3.3 三个提交（按「资源 → 代码 → 文档」拆，避免同文件多特性被硬拆）

```bash
# ① PWA 静态资源
git add manifest.json icon-180.png icon-192.png icon-512.png
git commit -m "feat(pwa): 增添 manifest 与主屏图标，支持添加到主屏幕"

# ② 产品代码（含新增模块）
git add index.html css/components.css css/layout.css css/responsive.css
git add js/api.js js/app.js js/icons.js js/state.js js/storage.js
git add js/avatar.js js/preset-io.js
git add js/components/characters.js js/components/chat.js js/components/preview.js
git add js/components/rules.js js/components/settings.js js/components/world.js
git commit -m "feat(rp): 预设编排与规则片段、角色/主角图片与聊天背景、Reroll、iOS 适配、历史轮数与自动归档" \
  -m "- #/rules 双栏编排 + 拖拽 + 注入位置/作用域 + Dry Run 预览 + SillyTavern 互转
- 主角/角色图片本地 canvas 压缩（240×240 WebP ≤25KB），仅存本地不进 API
- 聊天背景使用角色图片（遮罩可读），设置页可关闭
- 台词「」/心理（）双色高亮、Reroll 多版本切换、快捷输入栏
- 历史轮数默认 30 轮，超窗自动归档为长期记忆快照；发送前清洗空行与装饰线
- 全量备份导出/导入；存档损坏自愈前先留 3 份备份"

# ③ 文档与验收脚本
git add README.md docs/test-report.md
git add smoke.mjs assert-injection.mjs          # 选 B 时换成全部 e2e-*.mjs
git commit -m "docs: 更新功能说明与验收报告，补充 UI 冒烟与注入断言脚本"
```

> 若用户偏好单条提交，可把上面三步合成一次 `git add` + 一条 `git commit`，但**分组提交更利于回滚与 review**。

### 3.4 提交后自检

```bash
git status --short          # 应为空（除被忽略文件）
git log --oneline -3
git show --stat --oneline HEAD
git ls-files | grep -E "node_modules|screenshots|sk-"   # 必须为空
```

---

## 4. 推送与鉴权（三种，按环境选一种）

### 方案 A：HTTPS + Personal Access Token（无需装任何工具，最通用）

1. GitHub → Settings → Developer settings → Fine-grained tokens → 只勾该仓库 `Contents: Read and write`。
2. 推送时把 token 当密码输入（**不要把 token 写进 remote URL**）：

```bash
git push origin main
# Username: 5khw5dbt79-glitch
# Password: <PAT>
```

若想免交互（CI 场景），用一次性 header，不落盘：

```bash
git -c http.extraheader="Authorization: Bearer $GITHUB_TOKEN" push origin main
```

### 方案 B：SSH（长期最省事）

```bash
ssh-keygen -t ed25519 -C "yetan@local" -f ~/.ssh/id_ed25519_yetan
# 把 ~/.ssh/id_ed25519_yetan.pub 贴到 GitHub → Settings → SSH keys
git remote set-url origin git@github.com:5khw5dbt79-glitch/deeptavoweb.git
ssh -T git@github.com        # 看到 "Hi <user>!" 即通
git push origin main
```

### 方案 C：安装 gh CLI 后登录（可顺带看 Actions）

```bash
winget install --id GitHub.cli -e      # Windows；macOS 用 brew install gh
gh auth login                          # 选 HTTPS + 浏览器授权
gh auth setup-git                      # 让 git 复用 gh 的凭据
git push origin main
gh run watch                           # 实时看部署
```

> 当前环境 `gh` 未安装；若不想装，走方案 A/B。

---

## 5. 部署验收（push 之后必做）

1. **Actions**：仓库 Actions 页出现 `Deploy to GitHub Pages`，`deploy` job 绿。
2. **站点**：
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" https://5khw5dbt79-glitch.github.io/deeptavoweb/
   curl -s -o /dev/null -w "%{http_code}\n" https://5khw5dbt79-glitch.github.io/deeptavoweb/manifest.json
   curl -s -o /dev/null -w "%{http_code}\n" https://5khw5dbt79-glitch.github.io/deeptavoweb/icon-180.png
   ```
   三个都应为 `200`。
3. **功能抽查**（浏览器，建议手机也开一次）：
   - `#/rules` 双栏 + 拖拽 + 预览 Context
   - `#/characters` 上传角色图片 → 卡片/侧栏/气泡显示
   - `#/chat` 背景为该角色图片；「台词/心理」快捷键插入后光标在中间
   - `#/settings` 导入/导出全量备份，开关「聊天背景」即时生效
4. **移动端**：Safari 打开 → 分享 → 添加到主屏幕 → 图标为琥珀月牙、全屏无地址栏。
5. **缓存**：Pages 有 CDN 缓存，刚发布若仍是旧版，强刷或等 1–2 分钟；必要时在 URL 后加 `?v=时间戳` 验证。

---

## 6. 回滚预案

| 场景 | 操作 |
| --- | --- |
| 刚提交、还没推 | `git reset --hard pre-pwa-<时间>` |
| 已推送、站点异常 | `git revert <commit>` 后重新 push（**不要 `reset --hard` + force push**） |
| Actions 失败但代码没问题 | Actions 页 `Re-run all jobs`；或本地 `git commit --allow-empty -m "chore: retrigger pages"` 再 push |
| 只想临时下线 | 仓库 Settings → Pages → Source 改 `None` |

---

## 7. 可直接粘贴给 Agent 的 Prompt

```text
项目：E:/game/job/2026-11-16-21-50-41/tavo-web（「夜谈」，纯静态，GitHub Pages 部署）
任务：把当前未提交改动安全导入 Git 并发布到 Pages。严格按 docs/git-import-plan.md 执行。

要求：
1. 先跑文档 §2 的全部预检命令，把结果贴出来；若 origin/main 与 main 不是 0 0，或密钥扫描有命中，立刻停止并报告，不要提交。
2. 先打 tag pre-pwa-<时间>。
3. 按 §3.3 的三个提交分组提交（显式 git add，禁止 git add -A），逐条粘贴 commit 输出。
4. 代码质量门禁：提交前运行冒烟与验收脚本
   - node smoke.mjs（期望 30/30）
   - node assert-injection.mjs（期望 8 PASS）
   - node e2e-rp.mjs（期望 46/46）
   任一失败则不要提交，先修或报告。
5. 推送前先问我用哪种鉴权（PAT / SSH / gh），不要自行把 token 写进 remote URL 或写入任何文件。
6. 推送后按 §5 验收：Actions 状态、三个 URL 的 HTTP 码、关键页面抽查，把结果汇总成一段报告。
7. 全程不做 force push、不删远端分支、不改 .gitignore 以外的仓库设置。
```

---

## 8. 已知坑（提前规避）

1. **CRLF 警告**：`core.autocrlf=true`，`git add` 时会提示 LF→CRLF，属正常，不要为此改全局配置；若想彻底统一，另开一次提交加 `.gitattributes`（`* text=auto eol=lf`），并接受一次全量换行变更。
2. **不要 `git add .`**：仓库根目录有 `node_modules/`（已忽略）与 `screenshots/`（已忽略），但 `smoke.mjs` 等未忽略，误加会混入无关文件。
3. **Key 与存档永不入库**：API Key 只在浏览器 localStorage；备份 JSON 含 Key 与聊天记录，属用户私有文件，不能提交。
4. **项目 Pages 是「仓库子路径」**：所有资源必须相对路径（现状已满足），新增资源不要写 `/js/...` 这类绝对路径。
5. **hash 路由天然免回退配置**：`#/rules` 不会打到服务端，无需 404.html 或 rewrite 规则。
6. **本地预览与线上不同源**：`127.0.0.1:8080` 的存档不会出现在 Pages 域名下，验收时看到空状态是正常的。
