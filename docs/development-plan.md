# 开发计划

## 优先级与顺序

| 阶段 | 内容 | 交付物 |
|---|---|---|
| P0 | 静态骨架：HTML 结构、CSS 设计系统、三页布局、hash 路由 | 可打开、可切换页面 |
| P1 | 数据层：storage/state，角色 CRUD，localStorage 持久化 | 角色可增删改、刷新不丢 |
| P2 | 聊天 UI：消息渲染、输入、发送、滚动、状态 | 可本地模拟收发 |
| P3 | API 层：DeepSeek 流式请求、SSE 解析、中止、错误 | 真实对话可用 |
| P4 | 响应式与安全区、动效收敛、细节打磨 | 手机/桌面双端 |
| P5 | 浏览器实测 + 修复 + 测试报告 | 可交付成品 |

## 文件规划

```
tavo-web/
├── index.html              入口，三页容器 + tab 导航
├── css/
│   ├── reset.css           归一化
│   ├── variables.css       设计 token（颜色/间距/字体）
│   ├── layout.css          三页布局与响应式
│   ├── components.css      按钮/卡片/气泡/输入/弹层/抽屉
│   └── responsive.css      断点与安全区
├── js/
│   ├── storage.js          localStorage 读写与自愈
│   ├── state.js            全局状态、订阅、操作封装
│   ├── router.js           hash 路由
│   ├── api.js              DeepSeek 流式请求
│   ├── icons.js            内联 SVG 图标集
│   ├── app.js              启动入口、事件绑定
│   ├── components/
│   │   ├── chat.js         聊天页渲染与交互
│   │   ├── characters.js   角色页与编辑弹层
│   │   └── settings.js     设置页
│   └── pages/              （占位，页面级逻辑在 components 中）
├── docs/                   7 份分析文档
└── README.md               本地运行说明
```

## 技术决策

- **原生 ES Modules**，无构建步骤，双击/本地 HTTP 即可运行
- **hash 路由** 而非 History API：兼容 `file://` 与任意静态托管，无需服务端配置
- **fetch + ReadableStream** 解析 SSE，AbortController 实现停止
- **localStorage** 单键存储，数据量小，避免 IndexedDB 复杂度
- **内联 SVG 图标**，无外部图标库依赖

## 测试清单

1. 三页可打开、tab 与头部入口可跳转、刷新后路由保持
2. 角色新建/编辑/删除/切换，刷新后保持
3. 配置 API Key 后可发送，流式文字逐步出现
4. 停止按钮可中止，保留已生成内容
5. 错误场景（无 Key、错误 Key、网络断开）有提示且不崩
6. 控制台无报错、无 404 资源
7. 375/390/430px 手机宽度与 1280/1440/1920px 桌面布局正常
8. 数据导出/清空行为正确
