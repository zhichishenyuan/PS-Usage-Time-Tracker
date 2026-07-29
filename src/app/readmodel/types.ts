/**
 * ReadModel & ViewModels 类型定义
 */

export interface AssociatedFileViewModel {
  /** 文件实体 ID */
  id: string;
  /** 前端 UI 展示名称 */
  displayName: string;
  /** 磁盘文件名 (如无磁盘文件则为 null) */
  fileName: string | null;
  /** 是否已被首次保存 */
  isSaved: boolean;
  /** 首次记录时间 ISO 戳 */
  firstSeenAt: string;
  /** 最近出现时间 ISO 戳 */
  lastSeenAt: string;
  /** 文件关联的在线时长（格式化字符串） */
  displayOnlineTime?: string;
  /** 文件关联的有效工作时长（格式化字符串） */
  displayEffectiveTime?: string;
  /** 文件关联的操作步数 */
  actionSteps?: number;
}

export interface LiveSessionCardViewModel {
  /** RuntimeSession ID */
  id: string;
  /** 归属项目 ID */
  projectId: string;
  /** 归属项目名称 */
  projectName: string;
  /** 关联 Document ID */
  documentId: string;
  /** 关联 Document 显示名称 */
  displayName: string;
  /** 当前 Segment 开始 ISO 时间 */
  segmentStartedAt: string;
  /** 当前 Segment 实时有效工作时长（毫秒） */
  currentEffectiveMs: number;
  /** 当前 Segment 实时在线时长（毫秒） */
  currentOnlineMs: number;
  /** 格式化的有效工作时长 */
  displayEffectiveTime: string;
  /** 格式化的在线时长 */
  displayOnlineTime: string;
  /** 状态展示字符串 (如 "⚡ 正在进行中...") */
  statusText: string;
  /** 当前 Segment 已累计的操作步数 */
  actionSteps: number;
}

export interface ProjectViewModel {
  /** 项目唯一 ID */
  id: string;
  /** 自动分配的项目编号 */
  projectKey: string;
  /** 原文件名 */
  originalName: string;
  /** UI 显示名称 */
  name: string;
  /** 项目备注（最多 100 字符） */
  note: string;
  /** 用于编辑器初始化的原始完整备注（不受 UI 设置影响） */
  rawNote: string;
  /** 创建时间 ISO 字符串 */
  createdAt: string;
  /** 最近工作时间 ISO 字符串 */
  lastWorkedAt: string;
  /** 实时计算后的有效工作时长毫秒数 (totalEffectiveMs + activeSegmentEffectiveMs) */
  effectiveMs: number;
  /** 实时计算后的在线时长毫秒数 (totalOnlineMs + activeSegmentOnlineMs) */
  onlineMs: number;
  /** 格式化后的有效工作时长字符串 (如 "01:32:48") */
  displayEffectiveTime: string;
  /** 格式化后的在线时长字符串 (如 "02:04:16") */
  displayOnlineTime: string;
  /** 关联文件数量 */
  associatedFileCount: number;
  /** 关联文件 ViewModel 列表 */
  associatedFiles: AssociatedFileViewModel[];
  /** 是否拥有可撤销的合并操作 */
  hasUndoRecord?: boolean;
  /** 是否为当前正在 Photoshop 前台编辑的项目 */
  isCurrentlyActive: boolean;
  /** 如果是当前活动项目，携带实时指示卡片 ViewModel；非活动项目为 null */
  liveSessionCard: LiveSessionCardViewModel | null;
  /** 项目内历史产生的有效操作步数总和（含当前运行段） */
  totalActionSteps: number;
}

export interface HistorySessionViewModel {
  /** SessionRecord 唯一 ID */
  id: string;
  /** 归属项目 ID */
  projectId: string;
  /** 归属项目名称 */
  projectName: string;
  /** 关联文件 ID */
  documentId: string;
  /** 关联文件 UI 展示名称 */
  displayName: string;
  /** 开始时间 ISO 字符串 */
  startAt: string;
  /** 结束时间 ISO 字符串 */
  endAt: string;
  /** 在线时长毫秒数 */
  onlineMs: number;
  /** 有效工作时长毫秒数 */
  effectiveMs: number;
  /** 格式化在线时长 */
  displayOnlineTime: string;
  /** 格式化有效工作时长 */
  displayEffectiveTime: string;
  /** 所属本地日期标签 (例如 "2026-07-20") */
  dateLabel: string;
  /** 时段展示文本 (例如 "20:00～22:00") */
  timeRangeLabel: string;
  /** 是否为实时活动中的 Live Session 卡片 */
  isLive: boolean;
  /** 记录状态 ('completed' | 'recovered' | 'running') */
  status: 'completed' | 'recovered' | 'running';
  /** 结束原因 */
  endReason: string | null;
  /** Session 期间产生的历史操作步数总和 */
  actionSteps: number;
}

export interface SummaryViewModel {
  /** 今日有效工作时长毫秒数 */
  todayEffectiveMs: number;
  /** 今日在线时长毫秒数 */
  todayOnlineMs: number;
  /** 格式化今日有效时长 (如 "03:45:22") */
  displayTodayEffectiveTime: string;
  /** 格式化今日在线时长 */
  displayTodayOnlineTime: string;
  
  /** 本周有效工作时长毫秒数 (以周一为一周起始) */
  weekEffectiveMs: number;
  /** 本周在线时长毫秒数 */
  weekOnlineMs: number;
  /** 格式化本周有效时长 (如 "18:20:15") */
  displayWeekEffectiveTime: string;
  /** 格式化本周在线时长 */
  displayWeekOnlineTime: string;

  /** 是否根据设置在界面上展示汇总区域 */
  isSummaryVisible: boolean;
  /** 当前选中的汇总模式 ('today' | 'week' | 'all') */
  summaryMode: 'today' | 'week' | 'all';
  /** 本周起始日期文本 (如 "2026-07-20 (周一)") */
  weekStartDateLabel: string;
  /** 今日日期文本 (如 "2026-07-23") */
  todayDateLabel: string;
}

export interface TimelinePaginationOptions {
  /** 当前页码，从 1 开始，默认 1 */
  page?: number;
  /** 每页限制条数，默认 10 */
  pageSize?: number;
  /** 游标时间戳 ISO 字符串 (取小于等于该时间的记录，可选) */
  beforeStartAt?: string;
  /** 按指定项目 ID 过滤 (可选) */
  projectId?: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
