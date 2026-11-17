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

- 顶层的 `rules` / `worldBooks` / `protagonist` / `memory` 是「通用设定」：既是所有未独立角色的回落来源，也是新建角色的初始模板。详见 2.1。

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
  updatedAt: 1700000000000,
  scoped: CharacterScope | undefined // 该角色的独立设定集，见 2.1
}
```

## 2.1 CharacterScope（角色独立设定集）

```js
{
  rules: [ Rule ],            // 该角色专属规则书
  worldBooks: [ WorldEntry ], // 该角色专属世界书条目
  protagonist: Protagonist,   // 该角色里「玩家」的身份
  memory: { enabled, content },// 该角色专属长期记忆
  forkedAt: 1700000000000     // 从通用设定复制过来的时间
}
```

- **存在即独立**：`scoped` 一旦存在，该角色的四类设定全部与顶层通用设定脱钩。
- **不存在则回落**：读取端（注入、页面渲染）回落到顶层的 `rules` / `worldBooks` / `protagonist` / `memory`，所以老数据零迁移，未编辑过的角色行为不变。
- **写入即 fork**：在某角色名下做第一次修改时，`editingScope()` 把通用设定整套深拷贝一份写入 `scoped`，之后只改这份副本。
- **新建角色立即 fork**：`addCharacter()` 直接复制当前通用设定，避免多个新角色共享同一套模板。
- **恢复跟随通用**：删除 `scoped` 字段，回到回落状态（UI 有二次确认）。
- 注入只认「当前对话角色」的 `scoped`，与页面上正在编辑谁无关，避免看着 A 的设定给 B 发消息。

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
