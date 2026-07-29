import { AppSnapshot, FileRecord, Project, RuntimeSession, SessionRecord } from '../../domain/types';
import {
  AssociatedFileViewModel,
  HistorySessionViewModel,
  LiveSessionCardViewModel,
  PaginatedResult,
  ProjectViewModel,
  SummaryViewModel,
  TimelinePaginationOptions,
} from './types';

/**
 * 格式化时长毫秒数为 HH:mm:ss 格式字符串
 */
export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

/**
 * 格式化 Date 为本地 YYYY-MM-DD 日期字符串
 */
export function formatLocalDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 格式化 ISO 开始和结束时间为 HH:mm～HH:mm
 */
export function formatTimeRange(startAtIso: string, endAtIso: string): string {
  const startDate = new Date(startAtIso);
  const endDate = new Date(endAtIso);

  const startHH = String(startDate.getHours()).padStart(2, '0');
  const startMM = String(startDate.getMinutes()).padStart(2, '0');

  const endHH = String(endDate.getHours()).padStart(2, '0');
  const endMM = String(endDate.getMinutes()).padStart(2, '0');

  return `${startHH}:${startMM}～${endHH}:${endMM}`;
}

/**
 * 获取本地时间所在周的周一 00:00:00.000 时间戳 (毫秒)
 */
export function getLocalWeekStartTimestamp(nowMs: number): number {
  const d = new Date(nowMs);
  const day = d.getDay(); // 0: 周日, 1: 周一, ..., 6: 周六
  const dayOfWeek = day === 0 ? 7 : day; // 规范化：周一为 1 ... 周日为 7

  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (dayOfWeek - 1));
  return d.getTime();
}

/**
 * 格式化周一起始日期文本，形如 "2026-07-20 (周一)"
 */
export function formatWeekStartDateLabel(weekStartMs: number): string {
  const d = new Date(weekStartMs);
  const dateStr = formatLocalDate(d);
  return `${dateStr} (周一)`;
}

/**
 * ReadModel 选择器服务
 * 100% 纯函数，只读、零副作用
 */
export class ReadModelService {
  /**
   * 获取格式化后的项目列表 ViewModel (按 lastWorkedAt 降序)
   */
  public static getProjectViewModels(
    snapshot: Readonly<AppSnapshot>,
    activeRuntime: Readonly<RuntimeSession> | null,
    now: number
  ): ProjectViewModel[] {
    // 1. 过滤有效项目：排除 status === 'MERGED' | 'DELETED' 或 deleted === true
    const validProjects = Object.values(snapshot.projects).filter(
      (p) => p.status === 'ACTIVE' && !p.deleted
    );

    // 2. 映射每个项目并计算 lastWorkedAt 与叠加工时
    const projectsWithTime = validProjects.map((project) => {
      const isCurrentlyActive = Boolean(
        activeRuntime && activeRuntime.projectId === project.id
      );

      // 计算关联文件 ViewModel
      const rawAssociatedFiles = (project.documentIds || [])
        .map((docId) => snapshot.fileRecords[docId])
        .filter((file): file is FileRecord => Boolean(file) && file.projectId === project.id);
        
      // 去重：因为 Photoshop 重启后同一个文件会分配不同的 documentId，导致相同的 fileName 被记录多次
      const uniqueFilesMap = new Map<string, FileRecord>();
      for (const file of rawAssociatedFiles) {
        const key = file.fileName || file.displayName;
        if (!uniqueFilesMap.has(key)) {
          uniqueFilesMap.set(key, file);
        } else {
          // 保留最近看到的记录
          const existing = uniqueFilesMap.get(key)!;
          if (new Date(file.lastSeenAt).getTime() > new Date(existing.lastSeenAt).getTime()) {
            uniqueFilesMap.set(key, file);
          }
        }
      }

      const associatedFiles: AssociatedFileViewModel[] = Array.from(uniqueFilesMap.values())
        .map((file) => {
          let fileOnlineMs = 0;
          let fileEffectiveMs = 0;
          let fileActionSteps = 0;

          // 从历史 session 中统计
          for (const sId of project.sessions || []) {
            const s = snapshot.sessionRecords[sId];
            if (s && s.documentId === file.id) {
              fileOnlineMs += s.onlineMs || 0;
              fileEffectiveMs += s.effectiveMs || 0;
              fileActionSteps += s.actionSteps || 0;
            }
          }

          // 按照用户需求，即使是当前活跃的文件，也不进行实时更新，仅统计历史固化数据
          /*
          if (isCurrentlyActive && activeRuntime && activeRuntime.documentId === file.id) {
            fileOnlineMs += activeRuntime.segmentOnlineMs || 0;
            fileEffectiveMs += activeRuntime.segmentEffectiveMs || 0;
            fileActionSteps += activeRuntime.segmentActionSteps || 0;
          }
          */

          return {
            id: file.id,
            displayName: file.displayName,
            fileName: file.fileName,
            isSaved: file.isSaved,
            firstSeenAt: file.firstSeenAt,
            lastSeenAt: file.lastSeenAt,
            displayOnlineTime: formatDurationMs(fileOnlineMs),
            displayEffectiveTime: formatDurationMs(fileEffectiveMs),
            actionSteps: fileActionSteps,
          };
        });

      // 计算实时 LiveSessionCard
      let liveSessionCard: LiveSessionCardViewModel | null = null;
      const isNoteFirst = snapshot.settings?.projectNameDisplayMode === 'note-first';
      let displayName = project.name;
      let displayNote = project.note || '';
      if (isNoteFirst && project.note && project.note.trim() !== '') {
        displayName = project.note;
        displayNote = ''; // 既然备注已经作为标题显示，下方就不再显示重复的备注栏
      }

      if (isCurrentlyActive && activeRuntime) {
        const activeDoc = snapshot.fileRecords[activeRuntime.documentId];
        const activeFileName = activeDoc ? activeDoc.displayName : (project ? project.name + ' (恢复)' : '未知文件');

        liveSessionCard = {
          id: activeRuntime.id,
          projectId: project.id,
          projectName: displayName,
          documentId: activeRuntime.documentId,
          displayName: activeFileName,
          segmentStartedAt: activeRuntime.segmentStartedAt,
          currentEffectiveMs: activeRuntime.segmentEffectiveMs,
          currentOnlineMs: activeRuntime.segmentOnlineMs,
          displayEffectiveTime: formatDurationMs(activeRuntime.segmentEffectiveMs),
          displayOnlineTime: formatDurationMs(activeRuntime.segmentOnlineMs),
          statusText: activeRuntime.state === 'WORKING' ? '⚡ 正在进行中...' : (activeRuntime.state === 'IDLE' ? '⏸️ 空闲' : '❄️ 冻结'),
          actionSteps: activeRuntime.segmentActionSteps || 0,
        };
      }

      // 计算 lastWorkedAt (精确对比已完成 SessionRecord endAt、RuntimeSession 活动状态与项目更新时间)
      let latestMs = new Date(project.updatedAt || project.createdAt).getTime();

      if (project.sessions && project.sessions.length > 0) {
        for (const sessionId of project.sessions) {
          const rec = snapshot.sessionRecords[sessionId];
          if (rec) {
            const endMs = new Date(rec.endAt).getTime();
            if (endMs > latestMs) {
              latestMs = endMs;
            }
          }
        }
      }

      if (isCurrentlyActive && activeRuntime) {
        const activeStartMs = new Date(activeRuntime.startAt).getTime();
        if (activeStartMs > latestMs) {
          latestMs = activeStartMs;
        }
      }

      const lastWorkedAt = new Date(latestMs).toISOString();

      // 叠加实时工时
      const activeEffectiveMs = isCurrentlyActive && activeRuntime ? activeRuntime.segmentEffectiveMs : 0;
      const activeOnlineMs = isCurrentlyActive && activeRuntime ? activeRuntime.segmentOnlineMs : 0;
      const activeActionSteps = isCurrentlyActive && activeRuntime ? (activeRuntime.segmentActionSteps || 0) : 0;

      const effectiveMs = project.totalEffectiveMs + activeEffectiveMs;
      const onlineMs = project.totalOnlineMs + activeOnlineMs;
      const totalActionSteps = (project.totalActionSteps || 0) + activeActionSteps;

      const viewModel: ProjectViewModel = {
        id: project.id,
        projectKey: project.projectKey,
        originalName: project.name,
        name: displayName,
        note: displayNote,
        rawNote: project.note || '',
        createdAt: project.createdAt,
        lastWorkedAt,
        effectiveMs,
        onlineMs,
        displayEffectiveTime: formatDurationMs(effectiveMs),
        displayOnlineTime: formatDurationMs(onlineMs),
        associatedFileCount: associatedFiles.length,
        associatedFiles: associatedFiles,
        hasUndoRecord: Boolean(snapshot.undoMergeRecords && snapshot.undoMergeRecords[project.id]),
        isCurrentlyActive,
        liveSessionCard,
        totalActionSteps,
      };

      return {
        viewModel,
        lastWorkedMs: latestMs,
      };
    });

    // 3. 排序：按 lastWorkedMs 降序排列 (最新工作的放在最上方)
    projectsWithTime.sort((a, b) => {
      if (b.lastWorkedMs !== a.lastWorkedMs) {
        return b.lastWorkedMs - a.lastWorkedMs;
      }
      return a.viewModel.id.localeCompare(b.viewModel.id);
    });

    return projectsWithTime.map((item) => item.viewModel);
  }

  /**
   * 获取按时间轴升序排列的分页 Session ViewModel 列表
   */
  public static getTimelineSessionViewModels(
    snapshot: Readonly<AppSnapshot>,
    activeRuntime: Readonly<RuntimeSession> | null,
    options: TimelinePaginationOptions = {},
    now: number
  ): PaginatedResult<HistorySessionViewModel> {
    const page = Math.max(1, options.page || 1);
    const pageSize = Math.max(1, options.pageSize || 10);

    // 1. 获取所有 SessionRecord 并根据条件过滤
    let records = Object.values(snapshot.sessionRecords);

    if (options.projectId) {
      records = records.filter((r) => r.projectId === options.projectId);
    }

    if (options.beforeStartAt) {
      const beforeMs = new Date(options.beforeStartAt).getTime();
      records = records.filter((r) => new Date(r.startAt).getTime() <= beforeMs);
    }

    // 2. 按 startAt 降序排列 (最新记录在顶部，最早记录在底部)
    records.sort((a, b) => {
      const timeA = new Date(a.startAt).getTime();
      const timeB = new Date(b.startAt).getTime();
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      return b.id.localeCompare(a.id);
    });

    // 2.5 合并同项目且时间相近的相邻片段 (间隔 <= 3分钟)
    const mergedRecords: typeof records = [];
    for (const record of records) {
      if (mergedRecords.length === 0) {
        mergedRecords.push({ ...record });
        continue;
      }
      
      const last = mergedRecords[mergedRecords.length - 1];
      if (last.projectId === record.projectId) {
        const gapMs = new Date(last.startAt).getTime() - new Date(record.endAt).getTime();
        
        // 允许合并：间隔 <= 3 分钟 (180,000 毫秒)。如果 gapMs < 0 说明时间有重叠，也应该合并。
        if (gapMs <= 180000) {
          // 合并时间区间：选取更早的 startAt 和 更晚的 endAt
          last.startAt = new Date(Math.min(new Date(last.startAt).getTime(), new Date(record.startAt).getTime())).toISOString();
          last.endAt = new Date(Math.max(new Date(last.endAt).getTime(), new Date(record.endAt).getTime())).toISOString();
          
          last.onlineMs += record.onlineMs;
          last.effectiveMs += record.effectiveMs;
          last.actionSteps = (last.actionSteps || 0) + (record.actionSteps || 0);
          continue;
        }
      }
      mergedRecords.push({ ...record });
    }

    const total = mergedRecords.length;

    // 3. 切片分页
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const slicedRecords = startIndex < total ? mergedRecords.slice(startIndex, endIndex) : [];

    const items: HistorySessionViewModel[] = slicedRecords.map((record) => {
      const project = snapshot.projects[record.projectId];
      const doc = snapshot.fileRecords[record.documentId];

      const isNoteFirst = snapshot.settings?.projectNameDisplayMode === 'note-first';
      let projectName = project ? project.name : '未知项目';
      if (project && isNoteFirst && project.note && project.note.trim() !== '') {
        projectName = project.note;
      }
      
      const displayName = doc ? doc.displayName : (project ? project.name + ' (恢复)' : '未知文件');

      return {
        id: record.id,
        projectId: record.projectId,
        projectName,
        documentId: record.documentId,
        displayName,
        startAt: record.startAt,
        endAt: record.endAt,
        onlineMs: record.onlineMs,
        effectiveMs: record.effectiveMs,
        displayOnlineTime: formatDurationMs(record.onlineMs),
        displayEffectiveTime: formatDurationMs(record.effectiveMs),
        dateLabel: formatLocalDate(new Date(record.startAt)),
        timeRangeLabel: formatTimeRange(record.startAt, record.endAt),
        isLive: false,
        status: record.status,
        endReason: record.endReason,
        actionSteps: record.actionSteps || 0,
      };
    });

    const hasMore = endIndex < total;

    return {
      items,
      total,
      page,
      pageSize,
      hasMore,
    };
  }

  /**
   * 获取今日与本周工时汇总 ViewModel (以周一为一周起始日)
   */
  public static getSummaryViewModel(
    snapshot: Readonly<AppSnapshot>,
    activeRuntime: Readonly<RuntimeSession> | null,
    now: number
  ): SummaryViewModel {
    const todayDate = formatLocalDate(new Date(now));
    const weekStartMs = getLocalWeekStartTimestamp(now);

    let todayEffectiveMs = 0;
    let todayOnlineMs = 0;
    let weekEffectiveMs = 0;
    let weekOnlineMs = 0;

    // 1. 扫描固化的 SessionRecords
    const records = Object.values(snapshot.sessionRecords);
    for (const record of records) {
      if (record.segments && record.segments.length > 0) {
        for (const seg of record.segments) {
          const segLocalDate = seg.localDate || formatLocalDate(new Date(seg.startAt));
          if (segLocalDate === todayDate) {
            todayEffectiveMs += seg.effectiveMs;
            todayOnlineMs += seg.onlineMs;
          }

          const segStartMs = new Date(seg.startAt).getTime();
          if (segStartMs >= weekStartMs) {
            weekEffectiveMs += seg.effectiveMs;
            weekOnlineMs += seg.onlineMs;
          }
        }
      } else {
        // 兜底：若没有 segments，按 SessionRecord 整体对待
        const recStartMs = new Date(record.startAt).getTime();
        const recLocalDate = formatLocalDate(new Date(recStartMs));

        if (recLocalDate === todayDate) {
          todayEffectiveMs += record.effectiveMs;
          todayOnlineMs += record.onlineMs;
        }

        if (recStartMs >= weekStartMs) {
          weekEffectiveMs += record.effectiveMs;
          weekOnlineMs += record.onlineMs;
        }
      }
    }

    // 2. 动态叠加活跃的 RuntimeSession (已完成切片 + 当前活动切片)
    if (activeRuntime) {
      if (activeRuntime.completedSegments) {
        for (const seg of activeRuntime.completedSegments) {
          const segLocalDate = seg.localDate || formatLocalDate(new Date(seg.startAt));
          if (segLocalDate === todayDate) {
            todayEffectiveMs += seg.effectiveMs;
            todayOnlineMs += seg.onlineMs;
          }

          const segStartMs = new Date(seg.startAt).getTime();
          if (segStartMs >= weekStartMs) {
            weekEffectiveMs += seg.effectiveMs;
            weekOnlineMs += seg.onlineMs;
          }
        }
      }

      // 当前活动 segment
      const activeStartMs = new Date(activeRuntime.segmentStartedAt).getTime();
      const activeLocalDate = formatLocalDate(new Date(activeStartMs));

      if (activeLocalDate === todayDate) {
        todayEffectiveMs += activeRuntime.segmentEffectiveMs;
        todayOnlineMs += activeRuntime.segmentOnlineMs;
      }

      if (activeStartMs >= weekStartMs) {
        weekEffectiveMs += activeRuntime.segmentEffectiveMs;
        weekOnlineMs += activeRuntime.segmentOnlineMs;
      }
    }

    const showSummary = snapshot.settings ? snapshot.settings.showSummary !== false : true;
    const summaryMode = snapshot.settings ? snapshot.settings.summaryMode || 'today' : 'today';

    return {
      todayEffectiveMs,
      todayOnlineMs,
      displayTodayEffectiveTime: formatDurationMs(todayEffectiveMs),
      displayTodayOnlineTime: formatDurationMs(todayOnlineMs),

      weekEffectiveMs,
      weekOnlineMs,
      displayWeekEffectiveTime: formatDurationMs(weekEffectiveMs),
      displayWeekOnlineTime: formatDurationMs(weekOnlineMs),

      isSummaryVisible: showSummary,
      summaryMode,
      weekStartDateLabel: formatWeekStartDateLabel(weekStartMs),
      todayDateLabel: todayDate,
    };
  }
}
