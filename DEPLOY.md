# 部署到公网（GitHub Pages）

本项目是**纯静态站点**，不需要构建、不需要服务器，GitHub Pages 免费额度足够。

## 0. 部署前必读：数据不会跟着过去

 localStorage 按「协议 + 域名 + 端口」隔离。现在的地址是 `http://localhost:8080`，换成 `https://用户名.github.io/仓库名/` 后，原来的角色 / 对话 / 设置 / token 统计都看不到。

- 先在旧地址的设置页点「导出备份」，保存 JSON
- 目前 Web 版没有「导入备份」按钮，迁移需要手动做：打开新地址 → 浏览器 F12 开发者工具 → Console → 粘贴下面代码 → 把备份 JSON 内容粘进弹窗 → 回车刷新

```js
const txt = prompt('粘贴备份 JSON 内容');
if (txt) { localStorage.setItem('tavo-web:v1', txt.trim()); location.reload(); }
```

> 别把包含真实 API Key 的备份发给别人或传到公开仓库。

## 1. 在 GitHub 网页上建仓库

1. 打开 https://github.com/new
2. Repository name 填 `tavo-web`（或任意名字，下面命令要一致）
3. 选 **Public**（免费版只能从公开仓库发布 Pages；Private 需要付费）
4. **不要**勾选 Add a README / .gitignore / license，保持空仓库
5. 点 Create repository

## 2. 在本机执行 Git 命令

打开 Git Bash，进入项目目录后执行（把 `你的用户名` 换成你的 GitHub 用户名）：

```bash
cd /e/game/job/2026-11-16-21-50-41/tavo-web

git init
git config user.name "你的名字"
git config user.email "你的邮箱@example.com"

git add index.html css js docs README.md DEPLOY.md .nojekyll .github
git commit -m "deploy tavo-web to GitHub Pages"

git branch -M main
git remote add origin https://github.com/你的用户名/tavo-web.git
git push -u origin main
```

- `.gitignore` 已写好，会排除 `node_modules/`、`screenshots/`、e2e 测试脚本
- 如果想用 HTTPS 方式推送但没配置凭据，GitHub 现在需要用 **Personal Access Token** 代替密码；也可以配置 SSH key 后用 `git@github.com:用户名/tavo-web.git`

## 3. 开启 GitHub Pages

进仓库网页 → **Settings** → 左侧 **Pages** → Build and deployment：

- **推荐（最简单）**：Source 选 `Deploy from a branch`，Branch 选 `main`、目录选 `/ (root)`，Save
- 或者：Source 选 `GitHub Actions`，项目里已带 `.github/workflows/deploy.yml`，push 后会自动部署

等待 1–2 分钟，打开：

```
https://你的用户名.github.io/tavo-web/
```

## 4. 以后更新

改完代码后：

```bash
git add index.html css js docs README.md DEPLOY.md .nojekyll .github
git commit -m "update"
git push
```

## 5. 安全提醒

- 网站是公开的，任何人拿到地址都能打开；但**数据只存在各自浏览器**，不共享
- API Key 只存在浏览器 localStorage，不会写进代码；**不要把真实 Key 提交到仓库**
- 如果之前误传了含 Key 的备份 JSON，立刻去 GitHub 删掉该文件并重置 key
