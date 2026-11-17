# 数据模型

> 存储：浏览器 `localStorage`，单一命名空间 `tavo-web:v1`。读写统一走 `js/storage.js`。

## 1. 顶层结构

```js
{
  version: 1,
  activeCharacterId: "chr_xxx",
  settings: {
    baseURL: "https://api.deepseek.com",
    apiKey: "",
    model: "deepseek-chat",
    temperature: 1.2,
    contextLimit: 20
  },
  characters: [ Character ],
  conversations: { [characterId]: [ Message ] }
}
```

## 2. Character（角色卡）

```js
{
  id: "chr_ming_1700000000000",   // 唯一 id，生成方式 chr_<slug>_<timestamp>
  name: "岚",                       // 必填，展示名
  description: "夜班图书管理员",     // 一句话简介
  systemPrompt: "你是岚……",         // 作为 system 消息发送
  greeting: "这么晚了，还在找书吗？", // 开场白，首次进入时生成角色首条消息
  color: "#E0B872",                 // 角色标识色（用于头像与消息竖线）
  createdAt: 1700000000000,
  updatedAt: 1700000000000
}
```

## 3. Message（消息）

```js
{
  id: "msg_1700000000001",
  role: "user" | "assistant",
  content: "……",
  status: "done" | "streaming" | "stopped" | "error",
  createdAt: 1700000000000
}
```

- `role: "system"` 不入库，组装请求时由角色 `systemPrompt` 动态注入。
- `status` 用于 UI 渲染状态点、错误提示与重试。

## 4. 数据操作约定

- 所有写操作后立即 `JSON.stringify` 整个状态对象写回 localStorage（数据量小，足够）。
- 读操作先 `JSON.parse`，失败则回退到初始状态并覆盖写入（自愈）。
- API Key 仅存本地，不上传任何第三方；导出 JSON 时**默认脱敏**（apiKey 置空），提供"包含密钥"复选框由用户主动勾选。
- 清空数据：删除 `tavo-web:v1` 键并重建初始状态。

## 5. 校验规则

- `characters` 至少保留名称非空的角色；删除最后一个角色后允许空数组。
- `activeCharacterId` 必须指向存在的角色，否则置空。
- 设置项数值范围：temperature `0–2`，contextLimit `1–100`。

## 6. 待验证项

- 原 App 的角色卡字段远多于本模型（世界书、正则、EJS 变量等） → 本模型仅覆盖核心字段，属于有意裁剪。
