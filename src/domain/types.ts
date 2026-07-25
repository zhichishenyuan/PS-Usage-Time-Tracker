/**
 * 项目生命周期状态枚举
 */
export type ProjectStatus = 'ACTIVE' | 'MERGED' | 'DELETED';

/**
 * 运行态 Session 状态机状态
 */
export type SessionState = 'NO_DOCUMENT' | 'WORKING' | 'IDLE' | 'FROZEN' | 'MODAL' | 'ENDED';

/**
 * Session 结束原因枚举
 */
export type SessionEndReason =
  | 'document-switch'
  | 'document-close'
  | 'photoshop-exit'
  | 'clock-backward'
  | 'crash-recovery'
  | 'manual-system-recovery';

/**
 * 数据保留模式枚举
 */
export type RetentionMode = 'forever' | string;

/**
 * 历史统计汇总模式
 */
export type SummaryMode = 'today' | 'week' | 'all';

/**
 * 1. Project - 领域的核心统计实体
 */
export interface Project {
  /** 内部唯一标识 UUID */
  id: string;
  /** 自动关联键（已保存文件为去掉末尾扩展名后的文件名；未保存文件为临时 Key） */
  projectKey: string;
  /** UI 显示名称 */
  name: string;
  /** 项目备注，最多 100 字符 */
  note: string;
  /** 项目创建 ISO 时间戳 (UTC/ISO 8601) */
  createdAt: string;
  /** 项目最近更新 ISO 时间戳 (UTC/ISO 8601) */
  updatedAt: string;
  /** 已完成历史 Session 累计有效工作时长（毫秒） */
  totalEffectiveMs: number;
  /** 已完成历史 Session 累计在线时长（毫秒） */
  totalOnlineMs: number;
  /** 关联的文件记录 ID 列表 */
  documentIds: string[];
  /** 关联的历史 SessionRecord ID 列表 */
  sessions: string[];
  /** 项目生命周期状态 */
  status: ProjectStatus;
  /** 历史兼容删除标记（与 status === 'DELETED' 保持同步） */
  deleted: boolean;
  /** 项目内历史产生的有效操作步数总和 */
  totalActionSteps?: number;
}

/**
 * 2. FileRecord (Document) - 记录关联的 PSD/PSB/RAW 等文件载体
 */
export interface FileRecord {
  /** 文件实体唯一 ID */
  id: string;
  /** 所属 Project ID */
  projectId: string;
  /** 文件 Project Key */
  projectKey: string;
  /** 前端 UI 展示名称 (例如 IMG_0216.psd 或 未命名项目_2026-0722-182136_1) */
  displayName: string;
  /** 磁盘文件名 (如无磁盘文件则为 null) */
  fileName: string | null;
  /** 是否已被首次保存 */
  isSaved: boolean;
  /** 未保存文件的临时关联 Key (已保存文件为 null) */
  temporaryKey: string | null;
  /** 首次记录时间 ISO 戳 */
  firstSeenAt: string;
  /** 最近出现时间 ISO 戳 */
  lastSeenAt: string;
}

/**
 * 3. TimeSlice (SessionSegment) - Session 跨自然日拆分的时间片
 */
export interface TimeSlice {
  /** 时间片 UUID */
  segmentId: string;
  /** 时间片开始 ISO 时间 (UTC/ISO 8601) */
  startAt: string;
  /** 时间片结束 ISO 时间 (UTC/ISO 8601) */
  endAt: string;
  /** 本切片包含的在线时长（毫秒） */
  onlineMs: number;
  /** 本切片包含的有效工作时长（毫秒） */
  effectiveMs: number;
  /** 本切片所属本地自然日（格式 YYYY-MM-DD，按本地时区计算） */
  localDate: string;
  /** 本切片内产生的历史操作步数 */
  actionSteps?: number;
}

/**
 * 4. SessionRecord - 已完成的不可变历史统计事实记录
 */
export interface SessionRecord {
  /** 记录唯一 UUID */
  id: string;
  /** 归属 Project ID */
  projectId: string;
  /** 关联 FileRecord ID */
  documentId: string;
  /** Session 开始 ISO 时间 (UTC/ISO 8601) */
  startAt: string;
  /** Session 结束 ISO 时间 (UTC/ISO 8601) */
  endAt: string;
  /** 包含的所有 Segment 线上时长总合（毫秒） */
  onlineMs: number;
  /** 包含的所有 Segment 有效时长总和（毫秒） */
  effectiveMs: number;
  /** 记录完成状态 */
  status: 'completed' | 'recovered';
  /** 结束原因 */
  endReason: SessionEndReason;
  /** 跨午夜切分后的时间片列表（必须非空，且每个切片不跨本地自然日） */
  segments: TimeSlice[];
  /** 连续 Session 标识组（用于关联因文件切换等产生的连续会话） */
  continuationGroupId?: string;
  /** 记录创建时间 ISO 戳 */
  createdAt: string;
  /** 记录更新时间 ISO 戳 */
  updatedAt: string;
  /** Session 期间产生的历史操作步数总和 */
  actionSteps?: number;
}

/**
 * 5. RuntimeSession - 内存中进行实时结算的运行态 Session
 */
export interface RuntimeSession {
  /** 运行态 Session UUID */
  id: string;
  /** 当前归属 Project ID */
  projectId: string;
  /** 当前关联 FileRecord ID */
  documentId: string;
  /** 连续 Session 标识组 ID */
  continuationGroupId: string;
  /** 当前正在活动的 Segment ID */
  segmentId: string;
  /** 当前 Segment 开始 ISO 时间 */
  segmentStartedAt: string;
  /** 当前 Segment 已累计的在线时长（毫秒） */
  segmentOnlineMs: number;
  /** 当前 Segment 已累计的有效时长（毫秒） */
  segmentEffectiveMs: number;
  /** 当前 Segment 已累计的操作步数 */
  segmentActionSteps: number;
  /** 本 Session 跨过前序午夜已切割完成的 Segment 列表 */
  completedSegments: TimeSlice[];
  /** 最近一次结算时的墙上时间戳 (Epoch ms) */
  lastAccountingAt: number;
  /** 最近一次收到 Photoshop 活跃心跳的墙上时间戳 (Epoch ms) */
  lastHeartbeatAt: number;
  /** 运行态状态 */
  state: SessionState;
  /** 整个 RuntimeSession 首次启动的 ISO 时间 */
  startAt: string;
}

/**
 * 6. MergeOperation - 手动合并与 Undo 恢复快照记录
 */
export interface MergeOperation {
  /** 操作记录 UUID */
  id: string;
  /** 执行合并的时间 ISO 戳 */
  timestamp: string;
  /** 合并后的主项目 ID (Earliest Created) */
  primaryProjectId: string;
  /** 被合并入主项目的副项目 ID 列表 */
  mergedProjectIds: string[];
  /** 用于 V1.0 撤销合并 (Undo Merge) 的快照恢复结构 */
  snapshot: {
    /** 被合并副项目的原始全量 Project 数据 */
    mergedProjects: Project[];
    /** 被搬动的 SessionRecord 与其原始 Project ID 的对应关系映射 */
    sessionReassignments: Array<{
      sessionId: string;
      originalProjectId: string;
    }>;
    /** 被搬动的 FileRecord 与其原始 Project ID 的对应关系映射 */
    documentReassignments?: Array<{
      documentId: string;
      originalProjectId: string;
    }>;
  };
}

/**
 * 7. Settings - 用户配置与业务阈值
 */
export interface Settings {
  /** 空闲判定阈值（毫秒），默认 60000 ms (1分钟)，自定义值必须 >= 60000 */
  idleThresholdMs: number;
  /** 在线时长冻结阈值（毫秒），固定 600000 ms (10分钟)，不可配置 */
  readonly freezeThresholdMs: number;
  /** 是否开启界面汇总 */
  showSummary: boolean;
  /** 汇总颗粒度 */
  summaryMode: SummaryMode;
  /** 是否开启项目自动关联 */
  autoAssociate: boolean;
  /** 数据历史保留策略 */
  retentionMode: RetentionMode;
  /** 项目名称展示偏好 */
  projectNameDisplayMode?: 'name' | 'note-first';
}

/**
 * 8. AppSnapshot - 持久化 JSON 全量数据底座
 */
export interface AppSnapshot {
  /** Schema 版本（当前为 1） */
  schemaVersion: number;
  /** 快照 UUID */
  snapshotId: string;
  /** 快照生成与写入时间 ISO 戳 */
  writtenAt: string;
  /** 内存结算点 Checkpoint 时间 ISO 戳 */
  lastCheckpointAt: string;
  /** 上一次持久化 Flush 完成时间 ISO 戳 */
  lastFlushCompletedAt: string;
  /** 未命名项目递增序号 */
  nextUntitledSequence: number;
  /** 全局设置 */
  settings: Settings;
  /** 项目字典以 ID 为 Key */
  projects: Record<string, Project>;
  /** 文件字典以 ID 为 Key */
  fileRecords: Record<string, FileRecord>;
  /** 历史 Session 字典以 ID 为 Key */
  sessionRecords: Record<string, SessionRecord>;
  /** 运行态 Session (异常崩溃恢复的关键依据) */
  activeRuntimeSession: RuntimeSession | null;
  /** 以合并后的主项目 ID 为键，存储其最近一次合并的撤销快照 */
  undoMergeRecords?: Record<string, MergeOperation>;
}

export type ModalType = 'ACR' | 'LIQUIFY' | 'FILTER_GALLERY' | 'GENERIC_MODAL';

export type ModalResult = 'commit' | 'cancel';

export interface ModalCompensationResult {
  modalType?: ModalType;
  effectiveCompMs: number;
  onlineCompMs: number;
  netDurationMs: number;
  rawDurationMs: number;
  result: ModalResult;
}

export * from './capabilities';
