# Photoshop Usage Time Tracker - 技术设计文档

**版本：** V1.3  
**对应产品规格：** V1.8  
**平台：** Photoshop UXP Plugin  
**状态：** Ready for Development  

---

## 1. 文档目的

本文档定义 Photoshop Usage Time Tracker 的技术架构、数据模型、计时规则、事件处理流程、持久化策略、用户界面结构、异常恢复方案及测试要求。

本文档服务于以下开发目标：

1. 在 Photoshop 中自动识别当前活动文件。
2. 自动将文件关联到项目。
3. 自动记录项目的在线时长和有效工作时长。
4. 支持空闲、冻结、跨日切割、Save As、文件切换和崩溃恢复。
5. 所有数据仅保存于用户本地。
6. 为后续 `plugin/` 目录中的实现提供明确模块边界。

---

## 2. 技术假设与风险

### 2.1 UXP 能力假设

插件使用 Photoshop UXP 提供的以下能力：

- `uxp.plugin`
- `uxp.storage.localFileSystem`
- `photoshop.app`
- `photoshop.action.batchPlay`
- Photoshop 事件通知能力
- UXP Panel 生命周期
- UXP 定时器或 JavaScript `setInterval`

实际使用的 Photoshop 版本可能存在 API 差异，因此所有 Photoshop 事件接入必须通过适配层封装，不允许业务层直接依赖具体事件名称。

### 2.2 必须在开发初期验证的能力

以下能力需要通过最小原型确认：

| 能力 | 用途 | 风险 |
| --- | --- | --- |
| 当前文档切换事件 | 文件切换、Session 切换 | 不同 Photoshop 版本事件名称可能不同 |
| 文档打开事件 | 自动创建或匹配项目 | 事件回调参数可能不足 |
| 文档关闭事件 | 结束当前 Session | 关闭前可能无法读取完整文档信息 |
| Save As 事件 | 更新 Project Key | 事件参数可能不包含新文件路径 |
| Photoshop 退出事件 | 正常结束 Session | UXP 插件未必能可靠收到退出通知 |
| 模态滤镜事件 | ACR、液化、滤镜库补偿 | 需要通过事件序列推断 |
| 文件名和保存状态读取 | 项目关联 | UXP API 返回格式需要确认 |
| 数据目录原子写入 | 防止数据损坏 | UXP 文件系统 API 能力有限 |

如果某项能力无法稳定获得，必须采用以下顺序处理：

1. 使用 Photoshop 内部事件推断。
2. 在下一次可观察事件中校正状态。
3. 采用“宁可少记，不可多记”的策略。
4. 在设计文档和 README 中记录实际兼容范围。

### 2.3 不支持的能力

V1 不实现以下能力：

- 读取用户具体操作内容。
- 分析鼠标移动、键盘输入或屏幕内容。
- 云端同步。
- 多设备同步。
- 项目导入。
- 记录 Photoshop 之外的工作时间。
- 自动猜测不同文件是否属于同一项目。
- 多项目同时累计时间。

---

## 3. 总体架构

### 3.1 分层结构

```text
┌──────────────────────────────────────────┐
│                  UI Layer                │
│  Status Panel / History / Detail / Setup │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│              Application Layer            │
│  ProjectService / SessionService         │
│  SettingsService / ExportService          │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│               Domain Layer                │
│  Project / Document / Session / Timer     │
│  Idle State / Freeze State / Merge Stack  │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│          Photoshop Adapter Layer          │
│  Event Adapter / Document Adapter         │
│  Modal Adapter / Heartbeat Adapter        │
└───────────────────┬──────────────────────┘
                    │
┌───────────────────▼──────────────────────┐
│             Persistence Layer             │
│  Store / Migration / Flush / Recovery     │
└──────────────────────────────────────────┘
```

### 3.2 推荐目录结构

```text
plugin/
├── manifest.json
├── index.html
├── src/
│   ├── main.js
│   ├── panel.js
│   ├── styles/
│   │   ├── variables.css
│   │   ├── panel.css
│   │   └── history.css
│   ├── ui/
│   │   ├── StatusView.js
│   │   ├── HistoryView.js
│   │   ├── ProjectDetailView.js
│   │   ├── SettingsView.js
│   │   ├── NoteEditor.js
│   │   └── components/
│   ├── application/
│   │   ├── AppController.js
│   │   ├── ProjectService.js
│   │   ├── SessionService.js
│   │   ├── SettingsService.js
│   │   ├── ExportService.js
│   │   └── MergeService.js
│   ├── domain/
│   │   ├── constants.js
│   │   ├── time.js
│   │   ├── project.js
│   │   ├── session.js
│   │   └── stateMachine.js
│   ├── photoshop/
│   │   ├── PhotoshopAdapter.js
│   │   ├── EventAdapter.js
│   │   ├── DocumentAdapter.js
│   │   ├── HeartbeatAdapter.js
│   │   └── ModalAdapter.js
│   ├── persistence/
│   │   ├── Store.js
│   │   ├── FileStore.js
│   │   ├── Snapshot.js
│   │   ├── Migration.js
│   │   └── Recovery.js
│   └── utils/
│       ├── ids.js
│       ├── format.js
│       ├── validation.js
│       └── logger.js
└── tests/
    ├── domain/
    ├── application/
    ├── persistence/
    └── photoshop/
```

---

## 4. UXP 插件入口

### 4.1 插件类型

插件使用 UXP Panel 作为主要界面。

Panel 包含：

- 当前状态面板。
- 项目备注入口。
- 工作记录入口。
- 设置入口。

插件加载后应立即初始化计时服务，即使用户尚未打开历史记录页面，也必须持续监听 Photoshop 状态。

### 4.2 初始化顺序

```text
插件加载
  ↓
加载 manifest 与插件配置
  ↓
初始化本地数据目录
  ↓
读取数据快照
  ↓
执行数据迁移
  ↓
恢复异常退出前的未结束 Session
  ↓
初始化 Photoshop 事件监听器
  ↓
读取当前活动文档
  ↓
根据当前文档创建或匹配项目
  ↓
启动计时器与定时 flush
  ↓
渲染一级界面
```

### 4.3 初始化失败策略

- 数据目录创建失败：界面显示错误状态，停止统计。
- 数据读取失败：尝试读取备份快照。
- 主快照与备份均损坏：显示恢复失败，不覆盖原文件。
- Photoshop API 初始化失败：显示未连接状态，允许面板重新初始化。
- 单个历史项目数据损坏：跳过该项目并记录日志，不影响其他项目。

---

## 5. 核心领域模型

### 5.1 Project

```js
{
  "id": "project-uuid",
  "projectKey": "IMG_0216",
  "name": "IMG_0216",
  "note": "",
  "createdAt": "2026-07-20T20:00:00.000Z",
  "updatedAt": "2026-07-21T16:55:00.000Z",
  "totalEffectiveMs": 5520000,
  "totalOnlineMs": 7410000,
  "documentIds": ["document-uuid-1"],
  "sessions": ["session-uuid-1", "session-uuid-2"],
  "deleted": false
}
```

字段说明：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 项目内部唯一 ID |
| `projectKey` | string | 自动关联键 |
| `name` | string | UI 显示名称 |
| `note` | string | 最多 100 个字符 |
| `createdAt` | ISO string | 项目创建时间 |
| `updatedAt` | ISO string | 最近更新时间 |
| `totalEffectiveMs` | integer | 累计有效工作时长 |
| `totalOnlineMs` | integer | 累计在线时长 |
| `documentIds` | string[] | 关联文件对象 ID |
| `sessions` | string[] | Session ID 列表 |
| `deleted` | boolean | 删除标记，默认 `false` |

### 5.2 Document

文件对象用于记录文件载体，不代表文件生命周期。

```js
{
  "id": "document-uuid",
  "projectId": "project-uuid",
  "projectKey": "IMG_0216",
  "displayName": "IMG_0216.psd",
  "fileName": "IMG_0216.psd",
  "isSaved": true,
  "temporaryKey": null,
  "firstSeenAt": "2026-07-20T20:00:00.000Z",
  "lastSeenAt": "2026-07-21T16:55:00.000Z"
}
```

未保存文件：

```js
{
  "id": "document-uuid",
  "projectId": "project-uuid",
  "projectKey": "unsaved-20260722182136-1",
  "displayName": "未命名项目_2026-0722-182136_1",
  "fileName": null,
  "isSaved": false,
  "temporaryKey": "unsaved-20260722182136-1",
  "firstSeenAt": "2026-07-22T18:21:36.000Z",
  "lastSeenAt": "2026-07-22T18:21:36.000Z"
}
```

### 5.3 Session

```js
{
  "id": "session-uuid",
  "projectId": "project-uuid",
  "documentId": "document-uuid",
  "startAt": "2026-07-20T20:00:00.000Z",
  "endAt": "2026-07-20T22:00:00.000Z",
  "onlineMs": 4200000,
  "effectiveMs": 3600000,
  "status": "completed",
  "endReason": "document-switch",
  "segments": [
    {
      "startAt": "2026-07-20T20:00:00.000Z",
      "endAt": "2026-07-20T22:00:00.000Z",
      "onlineMs": 4200000,
      "effectiveMs": 3600000
    }
  ],
  "createdAt": "2026-07-20T20:00:00.000Z",
  "updatedAt": "2026-07-20T22:00:00.000Z"
}
```

`status` 取值：

- `running`
- `completed`
- `recovered`

`endReason` 取值：

- `document-switch`
- `document-close`
- `photoshop-exit`
- `clock-backward`
- `crash-recovery`
- `manual-system-recovery`

### 5.4 Session Segment

Session 跨越午夜时必须拆分成多个 Segment。

```js
{
  "startAt": "2026-07-20T23:30:00.000Z",
  "endAt": "2026-07-21T00:00:00.000Z",
  "onlineMs": 1800000,
  "effectiveMs": 1800000
}
```

Session 的累计时长由所有 Segment 相加。

---

## 6. Project Key 规则

### 6.1 已保存文件

从文件名中去除最后一个扩展名：

```text
IMG_0216.CR2 -> IMG_0216
IMG_0216.psd -> IMG_0216
IMG_0216.final.psd -> IMG_0216.final
```

规则：

- 只使用文件名，不使用目录路径。
- 保留 Unicode 字符。
- 不进行大小写折叠。
- 不移除空格。
- 不移除版本号。
- 不移除 `copy`、`final` 等后缀。
- 仅去除最后一个扩展名。

示例：

```text
IMG_0216.psd       -> IMG_0216
IMG_0216_final.psd -> IMG_0216_final
客户A.psb          -> 客户A
```

### 6.2 未保存文件

临时 Project Key：

```text
unsaved-{YYYYMMDDHHmmss}-{sequence}
```

UI 名称：

```text
未命名项目_{YYYY}-{MMDD}-{HHmmss}_{sequence}
```

序号必须在本地数据中持久化，确保同一时间创建的未保存文件仍然拥有不同 Key。

### 6.3 自动关联策略

```text
自动关联开启
  ├── 已保存文件：按 projectKey 查找历史项目
  │     ├── 找到：关联到最早匹配项目
  │     └── 未找到：创建新项目
  └── 未保存文件：始终创建临时项目

自动关联关闭
  ├── 当前会话中的 Save As：继续使用当前项目
  └── 新打开或新建文件：创建新项目
```

为支持关闭自动关联时的 Save As 继承，当前文档上下文必须保留：

```js
{
  "documentRuntimeId": "...",
  "currentProjectId": "project-uuid",
  "lastKnownFileName": "IMG_0216.psd"
}
```

---

## 7. Session 状态机

### 7.1 状态

```text
NO_DOCUMENT
  当前没有可统计的前台文件

WORKING
  收到活跃心跳，累计在线时长和有效工作时长

IDLE
  超过空闲阈值未收到心跳，累计在线时长，不累计有效时长

FROZEN
  IDLE 状态持续达到 10 分钟，暂停在线时长和有效时长

MODAL
  Photoshop 进入可识别的模态操作，按模态规则处理

ENDED
  Session 已结束，等待下一个 Session
```

### 7.2 状态转换

```text
NO_DOCUMENT -> WORKING
条件：检测到前台文件

WORKING -> IDLE
条件：当前时间 - 最近活跃心跳时间 >= idleThreshold

IDLE -> WORKING
条件：收到活跃心跳

IDLE -> FROZEN
条件：连续 Idle 时间 >= 10 分钟

FROZEN -> WORKING
条件：收到活跃心跳

WORKING/IDLE/FROZEN -> ENDED
条件：文件关闭、文件切换、Photoshop 退出、时钟回拨

WORKING/IDLE -> MODAL
条件：检测到模态操作开始

MODAL -> WORKING
条件：模态操作提交

MODAL -> IDLE
条件：模态操作取消，且已有空闲状态

MODAL -> ENDED
条件：文件关闭或 Photoshop 退出
```

---

## 8. 时间统计算法

### 8.1 时间来源

统一使用物理时钟：

```js
Date.now()
```

持久化时间使用 ISO 8601 UTC 字符串，显示时根据系统本地时区格式化。

不使用递增计时器作为唯一时间来源，因为系统休眠、插件暂停和 Photoshop 卡顿都可能导致计时器不可靠。

### 8.2 活跃心跳

心跳来源仅限 Photoshop 内部事件，例如：

- 工具切换。
- 文档内容变化。
- 图层变化。
- 选择区变化。
- 历史记录变化。
- Photoshop 操作事件。
- 可识别的滤镜或模态操作事件。

心跳事件只表达“存在 Photoshop 工作行为”，不保存具体操作内容。

重复事件应进行合并，避免同一操作产生大量无意义写入：

```text
收到事件
  ↓
记录 lastHeartbeatAt
  ↓
若状态为 IDLE 或 FROZEN，恢复为 WORKING
  ↓
根据时间差更新计时累计
  ↓
标记 dirty
```

### 8.3 有效工作时长

有效工作时长按心跳和空闲阈值计算。

设：

- `S` = Session 开始时间
- `E` = 当前结算时间或 Session 结束时间
- `H` = 最近一次活跃心跳时间
- `T` = 空闲阈值，默认 60 秒

当用户处于工作状态：

```text
有效结束时间 = E
```

当用户已经进入空闲状态：

```text
有效结束时间 = min(E, H + T)
```

有效时长：

```text
effectiveMs = max(0, effectiveEnd - S)
```

但实际实现不能每次直接从 Session 开始时间重算并重复累加。推荐保存：

```js
{
  "lastAccountingAt": "...",
  "lastHeartbeatAt": "...",
  "effectiveMs": 0,
  "onlineMs": 0
}
```

每次结算只计算 `[lastAccountingAt, now]` 区间，避免重复累加。

### 8.4 在线时长

在线时长从 Session 开始后累计，直到进入冻结状态。

规则：

- `WORKING`：累计在线时长。
- `IDLE` 且未满 10 分钟：累计在线时长。
- `FROZEN`：暂停在线时长。
- 收到新心跳：恢复 `WORKING`，继续累计。

在线结算逻辑：

```text
WORKING:
  online += now - lastAccountingAt
  effective += now - lastAccountingAt

IDLE:
  online += now - lastAccountingAt
  effective += 当前仍未超过 idleThreshold 的部分

FROZEN:
  不累计 online
  不累计 effective
```

### 8.5 定时 Tick

每 1 秒到 5 秒执行一次内存状态更新，以保证 UI 实时刷新。

每 60 秒执行一次 flush：

```text
tick
  ↓
检测物理时钟
  ↓
结算当前 Session
  ↓
更新状态：WORKING / IDLE / FROZEN
  ↓
刷新界面
  ↓
达到 flush 周期则持久化
```

为了减少写盘，不需要每次 Tick 都写文件。

---

## 9. 空闲、冻结和阈值修改

### 9.1 默认配置

```js
{
  "idleThresholdMs": 60000,
  "freezeThresholdMs": 600000,
  "showSummary": true,
  "summaryMode": "today",
  "autoAssociate": true,
  "retentionMode": "forever"
}
```

冻结阈值固定为 600000 毫秒，不开放设置。

### 9.2 空闲阈值允许值

预设：

- 1 分钟
- 3 分钟
- 5 分钟

自定义：

- 最小 60 秒。
- 必须为整数。
- 无最大值限制，但 UI 应提示过大的值可能降低统计准确性。

### 9.3 运行中修改阈值

修改阈值时：

1. 先以旧阈值结算当前 Session。
2. 保存当前累计时长。
3. 将 `lastHeartbeatAt` 重置为当前时间。
4. 将状态设置为 `WORKING`。
5. 重置 Idle 和冻结计时。
6. 使用新阈值继续统计。
7. 不追溯修改已完成 Session。

---

## 10. 文件事件处理

### 10.1 文件打开或新建

```text
收到 document-opened 或检测到新前台文档
  ↓
读取文档信息
  ↓
生成文件 Project Key
  ↓
根据自动关联开关查找项目
  ↓
创建或匹配 Project
  ↓
创建 Document 对象
  ↓
启动新的 Session
  ↓
设置当前运行上下文
```

### 10.2 文件切换

文件切换必须立即处理，不能等待空闲阈值：

```text
旧文件 Session 结算并结束
  ↓
清空旧文件 Idle 状态
  ↓
读取新前台文件
  ↓
为新文件创建新的 Session
  ↓
立即进入 WORKING
```

切换不会删除项目，也不会改变项目累计历史。

### 10.3 文件关闭

```text
结算当前 Session
  ↓
设置 endAt
  ↓
设置 endReason=document-close
  ↓
更新项目累计值
  ↓
清除运行上下文
  ↓
flush
```

### 10.4 Save As

Save As 的处理优先级：

1. 如果能确认是当前文档的路径或名称变化，则视为当前项目的文件载体变化。
2. 更新或创建 Document 对象。
3. 当前 Project ID 保持不变。
4. 对已保存文件更新 `projectKey` 和 `name`。
5. 不创建新 Session，当前 Session 连续保持。
6. 如果无法可靠确认 Save As，暂不立即拆分项目，在下一次文档状态变化时校正。

Save As 示例：

```text
未保存文件 -> 客户A.psd
```

结果：

```text
Project ID 不变
Project Key 更新为 客户A
项目名称更新为 客户A
累计时间保持不变
```

自动关联关闭时，当前文档的正常 Save As 仍然继承原项目。

---

## 11. 跨午夜切割

Session 不能跨越自然日直接存储为单段记录。

在每次结算、flush 和结束 Session 时检查是否跨越本地午夜：

```text
Session [23:30, 01:30]
  ↓
Segment 1 [23:30, 00:00]
Segment 2 [00:00, 01:30]
```

跨日切割使用用户本地时区，而不是 UTC 日期。

切割时：

1. 计算当前 Session 到下一个本地午夜的边界。
2. 结算边界前的 online/effective 时长。
3. 创建新的 Segment。
4. 从午夜开始继续计算。
5. Session ID 保持不变。
6. 每个 Segment 保存真实开始和结束时间。

历史记录界面按 Segment 日期显示。

---

## 12. 系统休眠与时钟异常

### 12.1 物理时钟检测

每分钟检查一次：

```js
elapsed = Date.now() - lastClockCheckAt
```

当：

```text
elapsed > 90000ms
```

判定为系统挂起或插件长时间未执行。

### 12.2 休眠处理

检测到系统挂起时：

1. 不将挂起期间直接计入在线时长。
2. 不将挂起期间计入有效工作时长。
3. 将当前结算点设置为挂起前最后可信时间。
4. 记录恢复时间。
5. 等待新的 Photoshop 活跃心跳恢复统计。
6. 若有新心跳，则从恢复后的心跳时间重新进入 `WORKING`。

为了遵循“宁可少记”，挂起期间默认全部剔除。

### 12.3 时钟回拨

当：

```text
Date.now() < lastAccountingAt
```

则：

1. 当前 Session 立即结束。
2. `endReason=clock-backward`。
3. 结束时间使用最后可信时间。
4. 清除当前运行状态。
5. 重新读取活动文档。
6. 如仍有前台文档，则创建新的 Session。

---

## 13. 模态滤镜与 ACR

### 13.1 设计目标

模态操作期间可能没有逐笔 Photoshop 事件，因此不能仅依赖普通心跳判断用户是否工作。

模态操作需要单独记录：

```js
{
  "startedAt": "...",
  "documentId": "...",
  "projectId": "...",
  "status": "running"
}
```

### 13.2 模态开始

检测到模态操作开始时：

1. 保存普通 Session 当前结算点。
2. 进入 `MODAL`。
3. 暂停普通 Idle 判定。
4. 在线时长可以继续累计，但最终按模态规则封顶。
5. 不依赖模态期间的普通心跳。

### 13.3 Commit

设模态持续时间为 `modalDuration`：

```text
compensatedEffective =
  min(modalDuration, idleThresholdMs + 20 * 60 * 1000)

compensatedOnline =
  min(modalDuration, compensatedEffective + 10 * 60 * 1000)
```

Commit 后：

1. 加入补偿有效时长。
2. 加入补偿在线时长。
3. 设置最近心跳时间为当前时间。
4. 恢复 `WORKING`。
5. 重新开始 Idle 判定。

### 13.4 Cancel

Cancel 后：

```text
effective = 0
online = min(modalDuration, 10 * 60 * 1000)
```

然后：

1. 不计入模态期间有效工作时长。
2. 在线时长按上限计入。
3. 根据后续状态恢复 `WORKING` 或 `IDLE`。
4. 标记数据需要 flush。

### 13.5 无法检测模态状态时

如果 Photoshop 版本无法可靠识别模态开始、Commit 或 Cancel：

- 不进行猜测性补偿。
- 继续使用普通心跳和空闲规则。
- 在日志中记录能力降级。
- 在设置或 README 中记录该版本限制。

---

## 14. 崩溃恢复

### 14.1 Flush 策略

插件每 60 秒持久化一次当前状态。

Flush 内容必须包括：

- 所有项目。
- 所有 Document。
- 所有已完成 Session。
- 当前运行中的 Session。
- 当前 Session 的最新累计值。
- 最后一次成功 flush 时间。
- 当前插件数据版本。

### 14.2 正常退出

如果能收到 Photoshop 退出或插件销毁事件：

1. 以当前可信时间结算 Session。
2. 结束 Session。
3. 设置正确的 `endReason`。
4. 执行最后一次 flush。

### 14.3 异常退出

重新启动时：

1. 检查是否存在 `status=running` 的 Session。
2. 使用 `lastSuccessfulFlushAt` 作为结束时间。
3. 不使用当前启动时间补计中间时间。
4. 设置 `status=recovered`。
5. 设置 `endReason=crash-recovery`。
6. 更新项目累计值。
7. 重新读取当前活动文档并创建新 Session。

该策略可能少记最后一次 flush 之后的工作时间，但不会把 Photoshop 关闭期间误计入工作时间。

---

## 15. 数据持久化

### 15.1 存储目录

使用 UXP：

```js
localFileSystem.getDataFolder()
```

建议文件：

```text
data/
├── usage-data.json
├── usage-data.backup.json
├── usage-data.tmp.json
└── export/
```

实际路径由 UXP 数据目录决定，不在插件代码中写死。

### 15.2 根数据结构

```js
{
  "schemaVersion": 1,
  "lastSuccessfulFlushAt": "2026-07-23T10:00:00.000Z",
  "nextUnsavedSequence": 2,
  "settings": {},
  "projects": {},
  "documents": {},
  "sessions": {},
  "mergeUndoStack": [],
  "runtime": {
    "activeDocumentId": null,
    "activeProjectId": null,
    "activeSessionId": null,
    "lastHeartbeatAt": null,
    "lastAccountingAt": null,
    "lastClockCheckAt": null
  }
}
```

### 15.3 写入流程

```text
内存状态标记 dirty
  ↓
合并短时间内的多次写入请求
  ↓
生成完整 JSON 快照
  ↓
写入 usage-data.tmp.json
  ↓
验证 JSON 可解析
  ↓
备份当前 usage-data.json
  ↓
替换主快照
  ↓
更新 lastSuccessfulFlushAt
```

如果 UXP 文件系统不支持可靠原子替换，则采用：

1. 先写临时文件。
2. 写入完成后重新读取并解析。
3. 保留主文件和备份文件。
4. 启动时选择可解析且 `lastSuccessfulFlushAt` 更新的文件。

### 15.4 数据版本迁移

`schemaVersion` 必须递增。

迁移函数：

```js
migrate(data, fromVersion, toVersion)
```

要求：

- 迁移前复制备份。
- 每个版本只负责相邻版本迁移。
- 迁移失败时不覆盖原文件。
- 启动日志中记录迁移结果。

---

## 16. 项目合并与撤销合并

### 16.1 合并规则

用户选择两个或多个项目后：

1. 按 `createdAt` 升序排序。
2. 最早创建的项目作为主项目。
3. 主项目名称和备注保持不变。
4. 其他项目的 Session 全部转移到主项目。
5. 其他项目的 Document 全部转移到主项目。
6. 重算主项目累计有效时长和在线时长。
7. 被合并项目保留原始快照至撤销栈。
8. 被合并项目从正常项目列表隐藏。

### 16.2 Undo Merge

V1 仅支持撤销最近一次合并。

Undo 栈记录：

```js
{
  "id": "merge-operation-uuid",
  "createdAt": "...",
  "primaryProjectId": "project-1",
  "mergedProjectSnapshots": [
    {
      "project": {},
      "sessionIds": [],
      "documentIds": []
    }
  ],
  "sessionOwnershipBeforeMerge": {
    "session-1": "project-2"
  }
}
```

撤销流程：

1. 读取栈顶操作。
2. 恢复被合并项目原始属性。
3. 按 `sessionOwnershipBeforeMerge` 恢复 Session 所属项目。
4. 恢复 Document 所属项目。
5. 重算所有受影响项目累计值。
6. 删除栈顶操作。
7. flush。

如果合并后又发生新的项目删除或二次合并，应禁止撤销可能造成数据冲突的操作，并提示用户。

---

## 17. 查询与历史记录

### 17.1 项目列表

默认排序：

```text
updatedAt 升序
```

最久未工作项目在上，最近工作项目在下。

项目列表显示：

- 项目名称。
- 项目备注。
- 创建时间。
- 最近工作时间。
- 累计有效时长。
- 累计在线时长。
- 关联文件数量。

### 17.2 工作记录列表

统一时间轴：

```text
最早记录在上
最新记录在下
```

记录显示：

- 日期。
- 项目名称。
- 关联文件。
- 开始时间。
- 结束时间。
- 在线时长。
- 有效工作时长。

### 17.3 当前 Session

当前运行中的 Session 以实时指示项显示：

```text
⚡ IMG_0216.psd 正在进行中...
```

该项：

- 不计入历史列表累计值。
- 不显示虚假的结束时间。
- 文件切换或关闭后变为普通历史记录。
- 一级界面实时显示累计值。

### 17.4 分页加载

首次进入历史页面只加载 10 条。

继续向上滚动时：

```text
加载更早的一页
```

建议查询接口：

```js
getSessions({
  beforeCreatedAt,
  limit: 10,
  projectId,
  includeRunning: true
})
```

数据不足一页时表示已经加载完成。

首次进入页面默认定位到最新记录所在位置。

---

## 18. 今日和本周累计

### 18.1 计算依据

累计时间以 Session Segment 的本地日期为依据。

今日累计：

```text
本地日期 == 当前本地日期
```

本周累计：

```text
本地日期处于当前周
```

一周起始日应使用系统本地化设置；V1 默认使用周一作为每周第一天，后续可扩展为系统区域设置。

### 18.2 显示模式

设置：

```js
{
  "showSummary": true,
  "summaryMode": "today"
}
```

`summaryMode`：

- `today`
- `week`

当 `showSummary=false` 时：

- 隐藏整个累计区域。
- 今日/本周选择控件置灰。
- 不影响统计数据。

默认显示有效工作时长。

---

## 19. 导出

### 19.1 导出文件名

```text
<YYYY-MMDD-HHmmss>_PS使用时间记录.txt
```

示例：

```text
2026-0722-182136_PS使用时间记录.txt
```

时间戳使用本地时间。

### 19.2 导出内容

建议格式：

```text
Photoshop Usage Time Tracker
导出时间：2026-07-22 18:21:36

项目：IMG_0216
备注：客户A 二修
创建时间：2026-07-20 20:00:00
累计在线时长：06:12:00
累计有效工作时长：05:28:00

关联文件：
- IMG_0216.CR2
- IMG_0216.psd

工作记录：
日期 | 开始时间 | 结束时间 | 关联文件 | 在线时长 | 有效工作时长
2026-07-20 | 20:00 | 22:00 | IMG_0216.CR2 | 02:00:00 | 01:32:00
```

导出仅用于查看，不作为数据恢复来源。

### 19.3 用户选择保存位置

使用 UXP 文件选择器让用户选择导出位置。

导出失败时：

- 不修改业务数据。
- 显示明确错误信息。
- 保留用户当前页面状态。

---

## 20. 设置服务

设置模型：

```js
{
  "idleThresholdMs": 60000,
  "showSummary": true,
  "summaryMode": "today",
  "autoAssociate": true,
  "retention": {
    "mode": "forever",
    "days": 30
  }
}
```

### 20.1 设置校验

- `idleThresholdMs >= 60000`
- 自定义阈值必须是整数。
- `retention.days` 范围为 7 到 365。
- 项目备注最多 100 个字符。
- 空值备注转换为空字符串。
- 设置变更立即保存。
- 空闲阈值变更需要触发当前 Session 状态重置。

---

## 21. 自动删除

删除策略：

### 永久保留

不执行自动删除。

### 按天数保留

以项目最后活跃日期判断：

```text
当前日期 - project.updatedAt 日期 > retention.days
```

则删除项目及其：

- Session。
- Document 关联记录。
- 项目备注。
- 项目元数据。

执行时机：

- 插件启动后执行一次。
- 每日首次进入插件时执行一次。
- 不在每次 Tick 执行。

删除前应在日志中记录删除数量。

### 手动删除

V1 仅支持单个项目删除。

删除前必须二次确认：

```text
删除后无法恢复，是否继续？
```

删除动作不可通过 V1 的合并撤销栈恢复。

---

## 22. Photoshop 事件适配层

### 22.1 适配层职责

`PhotoshopAdapter` 负责：

- 获取当前活动文档。
- 获取文档 ID。
- 获取文档文件名。
- 判断文档是否已保存。
- 监听文档打开、关闭、切换和变更。
- 识别可能的模态操作。
- 将原始 Photoshop 事件转换为领域事件。

业务层只接收统一事件：

```js
{
  "type": "DOCUMENT_ACTIVATED",
  "at": 1784728362577,
  "document": {
    "runtimeId": "...",
    "fileName": "IMG_0216.psd",
    "isSaved": true
  }
}
```

### 22.2 领域事件类型

```text
PLUGIN_READY
DOCUMENT_OPENED
DOCUMENT_ACTIVATED
DOCUMENT_DEACTIVATED
DOCUMENT_CLOSED
DOCUMENT_CHANGED
DOCUMENT_SAVED_AS
HEARTBEAT
MODAL_STARTED
MODAL_COMMITTED
MODAL_CANCELLED
PHOTOSHOP_EXITING
CLOCK_SUSPEND_DETECTED
CLOCK_BACKWARD_DETECTED
```

### 22.3 事件去重

同一事件可能通过多个 API 来源重复通知，适配层需要去重：

```text
去重键 = eventType + runtimeDocumentId + roundedTimestamp
```

去重窗口建议为 100 到 300 毫秒。

---

## 23. 运行上下文

运行中的数据不能只保存在 UI 组件中，必须由 `SessionService` 管理。

```js
{
  "activeDocumentId": "document-uuid",
  "activeProjectId": "project-uuid",
  "activeSessionId": "session-uuid",
  "state": "WORKING",
  "sessionStartedAt": "...",
  "lastHeartbeatAt": "...",
  "lastAccountingAt": "...",
  "idleSince": null,
  "frozenAt": null,
  "lastClockCheckAt": "...",
  "modal": null,
  "dirty": true
}
```

Panel 关闭或重新打开时，运行上下文不能丢失。

---

## 24. UI 设计结构

### 24.1 一级状态界面

显示：

- 当前项目。
- 工作状态指示器。
- 当前项目在线时长。
- 当前项目有效工作时长。
- 今日或本周累计。
- 项目备注按钮。
- 工作记录按钮。
- 设置按钮。

状态：

| 状态 | 颜色 | 文案 |
| --- | --- | --- |
| 工作中 | 绿色 | 工作中 |
| 空闲中 | 黄色 | 空闲中 |
| 未统计 | 灰色 | 未统计 |

无前台文件时显示：

```text
未打开文件
```

### 24.2 项目备注

- 点击备注按钮打开编辑界面。
- 支持最多 100 个字符。
- 支持保存和取消。
- 保存后立即持久化。
- 备注不影响 Project Key 和任何统计逻辑。

### 24.3 历史记录界面

顶部使用 Tab：

- 项目。
- 工作记录。

项目模式：

- 项目列表。
- 点击项目进入详情。
- 支持单个项目删除。
- 支持多选项目合并。

工作记录模式：

- 按统一时间轴显示全部 Segment。
- 支持按需加载更早记录。
- 当前 Session 显示实时状态项。

### 24.4 项目详情界面

显示：

- 项目名称。
- 项目备注。
- 创建时间。
- 最近工作时间。
- 累计有效工作时长。
- 累计在线时长。
- 关联文件列表。
- 全部工作记录。

### 24.5 设置界面

设置分组：

1. 空闲时间。
2. 今日/本周累计显示。
3. 项目自动关联。
4. 导出记录。
5. 删除项目记录。

---

## 25. 服务接口

### 25.1 ProjectService

```js
createProject(documentInfo)
findProjectByKey(projectKey)
getProject(projectId)
listProjects(options)
updateProjectNote(projectId, note)
mergeProjects(projectIds)
undoLastMerge()
deleteProject(projectId)
recalculateProjectTotals(projectId)
```

### 25.2 SessionService

```js
startSession(documentContext, now)
recordHeartbeat(now, source)
tick(now)
endSession(reason, now)
handleDocumentSwitch(documentContext, now)
handleClockAnomaly(type, now)
getCurrentRuntimeState()
```

### 25.3 Store

```js
load()
save(snapshot)
flush()
markDirty()
getState()
replaceState(nextState)
```

### 25.4 ExportService

```js
buildTextExport(filter)
chooseExportLocation()
exportToFile(filter)
```

### 25.5 SettingsService

```js
getSettings()
updateSettings(patch)
validateSettings(settings)
```

---

## 26. 错误处理

错误分为三类：

### 可恢复错误

例如：

- 单次事件解析失败。
- 某次非关键 UI 刷新失败。
- 某个历史记录字段缺失。

处理：

- 记录日志。
- 使用默认值或跳过当前事件。
- 继续运行。

### 需要重试错误

例如：

- 数据文件暂时不可写。
- Photoshop 当前处于不可调用状态。

处理：

- 保留内存状态。
- 延迟重试。
- 不重复创建 Session。
- 超过重试次数后显示持久化异常。

### 不可恢复错误

例如：

- 主数据和备份均无法解析。
- UXP 数据目录不可访问。

处理：

- 停止计时服务。
- 保留原始文件。
- 在 UI 中显示错误。
- 不自动覆盖或清空用户数据。

---

## 27. 日志

日志不得包含：

- 文件完整路径。
- 文件内容。
- 用户操作内容。
- 任何网络数据。

日志可以包含：

- 事件类型。
- 文档运行时 ID。
- 项目 ID。
- Session ID。
- 状态转换。
- flush 成功或失败。
- API 能力检测结果。

生产环境建议支持日志级别：

```text
error
warn
info
debug
```

默认使用 `warn` 或 `info`，避免长期运行产生过大日志。

---

## 28. 安全与隐私

- 所有业务数据只写入 UXP `getDataFolder()` 返回的目录。
- 不发起网络请求。
- 不使用远程脚本。
- 不读取文件内容。
- 关联文件只保存文件名，不保存完整路径。
- 导出必须由用户主动触发。
- 导出位置由用户选择。
- 不将数据写入插件安装目录。
- 不在日志中写入完整路径。

---

## 29. 测试策略

### 29.1 单元测试

必须覆盖：

- 去除文件扩展名。
- Unicode 文件名。
- 未保存文件 Project Key 生成。
- Project Key 完全匹配和不匹配。
- 自动关联开启和关闭。
- 空闲阈值校验。
- 有效时长计算。
- 在线时长计算。
- 10 分钟冻结。
- 跨午夜切割。
- 时钟前拨和回拨。
- Session 累计不重复。
- 项目合并。
- 最近一次合并撤销。
- 今日和本周累计。
- 自动删除日期判断。
- 数据迁移。

### 29.2 时间计算测试矩阵

| 场景 | 在线时长 | 有效时长 |
| --- | ---: | ---: |
| 连续工作 30 分钟 | 30 分钟 | 30 分钟 |
| 工作 10 分钟后空闲 2 分钟，阈值 1 分钟 | 12 分钟 | 11 分钟 |
| 空闲 10 分钟后冻结 | 10 分钟 | 1 分钟 |
| 冻结后收到心跳再工作 20 分钟 | 冻结段不计 | 冻结段不计 |
| 文件切换 | 截止切换时间 | 截止切换时间按空闲规则结算 |
| 跨午夜 | 分 Segment | 分 Segment |
| 系统休眠 2 小时 | 休眠段不计 | 休眠段不计 |
| 时钟回拨 | 旧 Session 截止最后可信时间 | 旧 Session 截止最后可信时间 |

### 29.3 集成测试

使用 Photoshop UXP 开发环境验证：

1. 打开已保存文件自动创建项目。
2. 同名不同扩展名文件自动关联。
3. 不同文件名不自动关联。
4. 自动关联关闭时新文件创建新项目。
5. Save As 不创建新项目。
6. 文件切换立即结束和开始 Session。
7. 文件关闭结束 Session。
8. 当前 Session 实时显示。
9. Photoshop 重启后恢复未结束 Session。
10. 历史记录分页加载。
11. 项目合并和撤销合并。
12. 导出 TXT。
13. 设置变更立即生效。

### 29.4 长时间测试

至少执行以下测试：

- 连续运行 24 小时。
- 每分钟 flush。
- 多次打开、关闭和切换文件。
- 多次 Save As。
- 系统睡眠和唤醒。
- Photoshop 模态滤镜操作。
- 面板关闭后重新打开。
- Photoshop 崩溃模拟或强制结束。

验收重点：

- 不重复创建项目。
- 不重复累计时间。
- 不出现负时长。
- 不因 UI 关闭而停止统计。
- 数据文件可恢复。
- 内存使用不会持续增长。

---

## 30. 验收标准

### 数据正确性

- 所有项目只在首次需要时创建。
- Project Key 规则完全匹配产品规格。
- Save As 过程不丢失历史。
- 文件切换不会把后台文件计入当前时间。
- 空闲时间不计入有效工作时长。
- 冻结时间不计入在线时长。
- 跨日记录按本地午夜切割。
- 休眠时间不会被计入。
- 崩溃恢复最多使用最后一次成功 flush 时间。

### 可靠性

- Panel 关闭不影响统计。
- Photoshop 重启后数据可恢复。
- 写盘失败不会覆盖有效历史数据。
- 数据迁移失败不会破坏旧数据。
- 当前 Session 不会因重复事件被重复创建。

### UI

- 一级界面不显示历史记录。
- 历史记录默认定位到最新记录。
- 历史记录按需分页加载。
- 工作记录从上到下按时间递增显示。
- 当前 Session 使用实时状态显示，不伪造结束时间。
- 设置关闭今日/本周累计后，累计区域完全隐藏。

### 隐私

- 不向网络发送数据。
- 不保存完整文件路径。
- 不读取 Photoshop 文件内容。
- 导出必须由用户主动触发。

---

## 31. 实现顺序

建议按以下顺序开发：

### 阶段一：技术验证

- 创建最小 UXP Panel。
- 验证 `getDataFolder()`。
- 验证当前文档读取。
- 验证打开、关闭、切换、变更事件。
- 验证事件监听在 Panel 关闭后是否继续运行。
- 确认支持的 Photoshop 最低版本。

### 阶段二：持久化基础

- 实现数据结构。
- 实现加载、保存、备份和恢复。
- 实现 schema migration。
- 添加数据损坏测试。

### 阶段三：项目与文件模型

- 实现 Project Key。
- 实现项目创建。
- 实现自动关联开关。
- 实现未保存文件命名。
- 实现 Save As 继承。

### 阶段四：Session 计时

- 实现状态机。
- 实现心跳接入。
- 实现空闲和冻结。
- 实现文件切换。
- 实现跨午夜切割。
- 实现时钟异常处理。
- 实现每分钟 flush。

### 阶段五：核心 UI

- 实现一级状态界面。
- 实现备注编辑。
- 实现项目列表。
- 实现项目详情。
- 实现工作记录列表。
- 实现当前 Session 实时显示。

### 阶段六：高级功能

- 实现模态操作补偿。
- 实现项目合并。
- 实现撤销最近一次合并。
- 实现导出。
- 实现自动删除。

### 阶段七：兼容性与验收

- 在目标 Photoshop 版本验证事件差异。
- 执行长时间运行测试。
- 执行崩溃恢复测试。
- 执行数据迁移测试。
- 更新 README 的安装和兼容性说明。

---

## 32. 关键设计决策总结

1. 项目是统计主体，Document 只是载体。
2. Project Key 只由文件名去扩展名得到，不使用路径。
3. 事件适配层隔离 Photoshop API 差异。
4. Session 是不可重复累计的计时单位。
5. 跨午夜通过 Segment 实现自然日统计。
6. 有效时长依赖 Photoshop 内部心跳，宁可少记。
7. 在线时长在空闲前 10 分钟继续累计，之后冻结。
8. 系统休眠时间全部剔除。
9. 每分钟 flush，崩溃恢复使用最后成功 flush 时间。
10. UI 不承担计时职责，Panel 关闭不能影响统计。
11. 所有数据只存储在本地 UXP 数据目录。
12. API 能力无法确认时必须降级，不进行猜测性统计。