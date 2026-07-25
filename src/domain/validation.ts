import {
  Project,
  FileRecord,
  SessionRecord,
  TimeSlice,
  Settings,
  AppSnapshot,
  RetentionMode,
  SummaryMode,
  ProjectStatus,
  SessionEndReason,
} from './types';

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

/**
 * 辅助构建函数
 */
export function createValidationResult(errors: string[]): ValidationResult {
  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * 辅助函数：校验字符串是否为有效 ISO 8601 时间格式
 */
function isValidIsoDateString(isoString: string): boolean {
  if (typeof isoString !== 'string' || !isoString) {
    return false;
  }
  const timestamp = Date.parse(isoString);
  return !isNaN(timestamp);
}

/**
 * 辅助函数：根据 Date 对象或毫秒戳推算本地 YYYY-MM-DD 字符串
 */
export function formatLocalDate(dateOrMs: Date | number): string {
  const d = typeof dateOrMs === 'number' ? new Date(dateOrMs) : dateOrMs;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}



const VALID_SUMMARY_MODES: Set<SummaryMode> = new Set(['today', 'week', 'all']);

const VALID_PROJECT_STATUSES: Set<ProjectStatus> = new Set(['ACTIVE', 'MERGED', 'DELETED']);

const VALID_SESSION_END_REASONS: Set<SessionEndReason> = new Set([
  'document-switch',
  'document-close',
  'photoshop-exit',
  'clock-backward',
  'crash-recovery',
  'manual-system-recovery',
]);

/**
 * 1. 校验 Project 领域实体
 */
export function validateProject(project: Project): ValidationResult {
  const errors: string[] = [];

  if (!project.id || typeof project.id !== 'string') {
    errors.push('Project id 必须为非空字符串');
  }
  if (!project.projectKey || typeof project.projectKey !== 'string') {
    errors.push('Project projectKey 必须为非空字符串');
  }
  if (!project.name || typeof project.name !== 'string') {
    errors.push('Project name 必须为非空字符串');
  }
  if (typeof project.note !== 'string') {
    errors.push('Project note 必须为字符串');
  } else if (project.note.length > 100) {
    errors.push(`Project note 长度不能超过 100 字符，当前长度: ${project.note.length}`);
  }

  if (typeof project.totalEffectiveMs !== 'number' || project.totalEffectiveMs < 0) {
    errors.push('totalEffectiveMs 必须为非负数值');
  }
  if (typeof project.totalOnlineMs !== 'number' || project.totalOnlineMs < 0) {
    errors.push('totalOnlineMs 必须为非负数值');
  }
  if (
    typeof project.totalEffectiveMs === 'number' &&
    typeof project.totalOnlineMs === 'number' &&
    project.totalEffectiveMs > project.totalOnlineMs
  ) {
    errors.push('totalEffectiveMs 不能大于 totalOnlineMs');
  }

  if (!isValidIsoDateString(project.createdAt)) {
    errors.push('createdAt 必须为有效的 ISO 8601 时间格式');
  }
  if (!isValidIsoDateString(project.updatedAt)) {
    errors.push('updatedAt 必须为有效的 ISO 8601 时间格式');
  }
  if (
    isValidIsoDateString(project.createdAt) &&
    isValidIsoDateString(project.updatedAt) &&
    Date.parse(project.createdAt) > Date.parse(project.updatedAt)
  ) {
    errors.push('createdAt 不能大于 updatedAt');
  }

  if (!VALID_PROJECT_STATUSES.has(project.status)) {
    errors.push(`status 必须为 ACTIVE, MERGED 或 DELETED 之一，当前值: ${project.status}`);
  }

  const isStatusDeleted = project.status === 'DELETED';
  if (project.deleted !== isStatusDeleted) {
    errors.push(`deleted 标识 (${project.deleted}) 必须与 status === 'DELETED' (${isStatusDeleted}) 保持一致`);
  }

  if (!Array.isArray(project.documentIds)) {
    errors.push('documentIds 必须为数组');
  }
  if (!Array.isArray(project.sessions)) {
    errors.push('sessions 必须为数组');
  }

  return createValidationResult(errors);
}

/**
 * 2. 校验 Settings 设置项
 */
export function validateSettings(settings: Settings): ValidationResult {
  const errors: string[] = [];

  if (
    typeof settings.idleThresholdMs !== 'number' ||
    !Number.isInteger(settings.idleThresholdMs) ||
    settings.idleThresholdMs < 1000 ||
    settings.idleThresholdMs > 900000
  ) {
    errors.push(`idleThresholdMs 必须为 1000~900000 ms 之间的整数，当前值: ${settings.idleThresholdMs}`);
  }

  if (
    typeof settings.freezeThresholdMs !== 'number' ||
    !Number.isInteger(settings.freezeThresholdMs) ||
    settings.freezeThresholdMs < 60000 ||
    settings.freezeThresholdMs > 3600000
  ) {
    errors.push(`freezeThresholdMs 必须为 60000~3600000 ms 之间的整数，当前值: ${settings.freezeThresholdMs}`);
  } else if (settings.idleThresholdMs > settings.freezeThresholdMs) {
    errors.push(`空闲时间阈值 (${settings.idleThresholdMs}) 必须小于或等于挂机时间阈值 (${settings.freezeThresholdMs})`);
  }

  if (settings.retentionMode !== 'forever' && !/^\d+d(ays)?$/.test(settings.retentionMode)) {
    errors.push(`retentionMode 不合法，当前值: ${settings.retentionMode}`);
  }

  if (!VALID_SUMMARY_MODES.has(settings.summaryMode)) {
    errors.push(`summaryMode 不在允许列表中，当前值: ${settings.summaryMode}`);
  }

  if (typeof settings.showSummary !== 'boolean') {
    errors.push('showSummary 必须为布尔值');
  }

  if (typeof settings.autoAssociate !== 'boolean') {
    errors.push('autoAssociate 必须为布尔值');
  }

  return createValidationResult(errors);
}

/**
 * 3. 校验 TimeSlice 时间片
 */
export function validateTimeSlice(slice: TimeSlice): ValidationResult {
  const errors: string[] = [];

  if (!slice.segmentId || typeof slice.segmentId !== 'string') {
    errors.push('segmentId 必须为非空字符串');
  }

  if (!isValidIsoDateString(slice.startAt)) {
    errors.push('startAt 必须为有效的 ISO 8601 时间格式');
  }
  if (!isValidIsoDateString(slice.endAt)) {
    errors.push('endAt 必须为有效的 ISO 8601 时间格式');
  }

  const startMs = Date.parse(slice.startAt);
  const endMs = Date.parse(slice.endAt);

  if (isValidIsoDateString(slice.startAt) && isValidIsoDateString(slice.endAt)) {
    if (startMs >= endMs) {
      errors.push(`startAt (${slice.startAt}) 必须严格小于 endAt (${slice.endAt})`);
    }
  }

  if (typeof slice.effectiveMs !== 'number' || slice.effectiveMs < 0) {
    errors.push('effectiveMs 必须为非负数值');
  }
  if (typeof slice.onlineMs !== 'number' || slice.onlineMs < 0) {
    errors.push('onlineMs 必须为非负数值');
  }
  if (
    typeof slice.effectiveMs === 'number' &&
    typeof slice.onlineMs === 'number' &&
    slice.effectiveMs > slice.onlineMs
  ) {
    errors.push('effectiveMs 不能大于 onlineMs');
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!slice.localDate || !datePattern.test(slice.localDate)) {
    errors.push(`localDate 必须符合 YYYY-MM-DD 格式，当前值: ${slice.localDate}`);
  } else if (isValidIsoDateString(slice.startAt) && isValidIsoDateString(slice.endAt) && startMs < endMs) {
    const startLocalDate = formatLocalDate(startMs);
    // [startAt, endAt) 属于半开区间，包含了 [startMs, endMs - 1] 的所有时间点
    const lastPointLocalDate = formatLocalDate(endMs - 1);

    if (startLocalDate !== slice.localDate) {
      errors.push(`startAt 对应的本地日期 (${startLocalDate}) 与 localDate (${slice.localDate}) 不匹配`);
    }
    if (lastPointLocalDate !== slice.localDate) {
      errors.push(`endAt 对应的本地日期 (${lastPointLocalDate}) 与 localDate (${slice.localDate}) 不匹配（不允许跨自然日）`);
    }
  }

  return createValidationResult(errors);
}

/**
 * 4. 校验 SessionRecord 事实记录
 */
export function validateSessionRecord(session: SessionRecord): ValidationResult {
  const errors: string[] = [];

  if (!session.id || typeof session.id !== 'string') {
    errors.push('SessionRecord id 必须为非空字符串');
  }
  if (!session.projectId || typeof session.projectId !== 'string') {
    errors.push('SessionRecord projectId 必须为非空字符串');
  }
  if (!session.documentId || typeof session.documentId !== 'string') {
    errors.push('SessionRecord documentId 必须为非空字符串');
  }

  if (!isValidIsoDateString(session.startAt)) {
    errors.push('startAt 必须为有效的 ISO 8601 时间格式');
  }
  if (!isValidIsoDateString(session.endAt)) {
    errors.push('endAt 必须为有效的 ISO 8601 时间格式');
  }

  const startMs = Date.parse(session.startAt);
  const endMs = Date.parse(session.endAt);

  if (isValidIsoDateString(session.startAt) && isValidIsoDateString(session.endAt)) {
    if (startMs >= endMs) {
      errors.push(`startAt (${session.startAt}) 必须严格小于 endAt (${session.endAt})`);
    }
  }

  if (typeof session.effectiveMs !== 'number' || session.effectiveMs < 0) {
    errors.push('effectiveMs 必须为非负数值');
  }
  if (typeof session.onlineMs !== 'number' || session.onlineMs < 0) {
    errors.push('onlineMs 必须为非负数值');
  }
  if (
    typeof session.effectiveMs === 'number' &&
    typeof session.onlineMs === 'number' &&
    session.effectiveMs > session.onlineMs
  ) {
    errors.push('effectiveMs 不能大于 onlineMs');
  }

  if (session.status !== 'completed' && session.status !== 'recovered') {
    errors.push(`status 必须为 completed 或 recovered，当前值: ${session.status}`);
  }

  if (!VALID_SESSION_END_REASONS.has(session.endReason)) {
    errors.push(`endReason 不在允许列表中，当前值: ${session.endReason}`);
  }

  if (!Array.isArray(session.segments) || session.segments.length === 0) {
    errors.push('segments 必须是非空数组');
  } else {
    let segmentsOnlineMsSum = 0;
    let segmentsEffectiveMsSum = 0;

    for (let i = 0; i < session.segments.length; i++) {
      const slice = session.segments[i];
      const sliceRes = validateTimeSlice(slice);
      if (!sliceRes.valid) {
        errors.push(`segment[${i}] 校验失败: ${sliceRes.errors.join('; ')}`);
      } else {
        segmentsOnlineMsSum += slice.onlineMs;
        segmentsEffectiveMsSum += slice.effectiveMs;
      }

      // 检查片段连续性
      if (i > 0) {
        const prevEndMs = Date.parse(session.segments[i - 1].endAt);
        const currStartMs = Date.parse(slice.startAt);
        if (prevEndMs !== currStartMs) {
          errors.push(`segments 时间不连续: segment[${i - 1}].endAt (${session.segments[i - 1].endAt}) 与 segment[${i}].startAt (${slice.startAt}) 不重合`);
        }
      }
    }

    if (Math.abs(segmentsOnlineMsSum - session.onlineMs) > 1) {
      errors.push(`segments onlineMs 之和 (${segmentsOnlineMsSum}) 与 Session onlineMs (${session.onlineMs}) 差值超过 1ms`);
    }
    if (Math.abs(segmentsEffectiveMsSum - session.effectiveMs) > 1) {
      errors.push(`segments effectiveMs 之和 (${segmentsEffectiveMsSum}) 与 Session effectiveMs (${session.effectiveMs}) 差值超过 1ms`);
    }
  }

  return createValidationResult(errors);
}

/**
 * 5. 校验 AppSnapshot 全量快照
 */
export function validateAppSnapshot(snapshot: AppSnapshot): ValidationResult {
  const errors: string[] = [];

  if (typeof snapshot.schemaVersion !== 'number' || snapshot.schemaVersion < 1) {
    errors.push('schemaVersion 必须为 >= 1 的整数');
  }
  if (!snapshot.snapshotId || typeof snapshot.snapshotId !== 'string') {
    errors.push('snapshotId 必须为非空字符串');
  }
  if (!isValidIsoDateString(snapshot.writtenAt)) {
    errors.push('writtenAt 必须为有效的 ISO 8601 时间格式');
  }
  if (!isValidIsoDateString(snapshot.lastCheckpointAt)) {
    errors.push('lastCheckpointAt 必须为有效的 ISO 8601 时间格式');
  }
  if (!isValidIsoDateString(snapshot.lastFlushCompletedAt)) {
    errors.push('lastFlushCompletedAt 必须为有效的 ISO 8601 时间格式');
  }

  if (typeof snapshot.nextUntitledSequence !== 'number' || snapshot.nextUntitledSequence < 0) {
    errors.push('nextUntitledSequence 必须为非负整数');
  }

  // 校验 settings
  if (!snapshot.settings) {
    errors.push('settings 不能为空');
  } else {
    const settingsRes = validateSettings(snapshot.settings);
    if (!settingsRes.valid) {
      errors.push(`settings 校验失败: ${settingsRes.errors.join('; ')}`);
    }
  }

  // 校验 projects 字典与交叉一致性
  if (!snapshot.projects || typeof snapshot.projects !== 'object') {
    errors.push('projects 必须为对象');
  } else {
    for (const [projId, proj] of Object.entries(snapshot.projects)) {
      const projRes = validateProject(proj);
      if (!projRes.valid) {
        errors.push(`projects[${projId}] 校验失败: ${projRes.errors.join('; ')}`);
      }
      // 检查 sessions 引用在 sessionRecords 中真实存在
      if (Array.isArray(proj.sessions)) {
        for (const sId of proj.sessions) {
          if (!snapshot.sessionRecords || !snapshot.sessionRecords[sId]) {
            errors.push(`Project[${projId}] 引用的 Session[${sId}] 在 sessionRecords 中不存在`);
          }
        }
      }
      // 检查 documentIds 引用在 fileRecords 中真实存在
      if (Array.isArray(proj.documentIds)) {
        for (const docId of proj.documentIds) {
          if (!snapshot.fileRecords || !snapshot.fileRecords[docId]) {
            errors.push(`Project[${projId}] 引用的 File[${docId}] 在 fileRecords 中不存在`);
          }
        }
      }
    }
  }

  // 校验 sessionRecords 字典与交叉一致性
  if (!snapshot.sessionRecords || typeof snapshot.sessionRecords !== 'object') {
    errors.push('sessionRecords 必须为对象');
  } else {
    for (const [sId, session] of Object.entries(snapshot.sessionRecords)) {
      const sessionRes = validateSessionRecord(session);
      if (!sessionRes.valid) {
        errors.push(`sessionRecords[${sId}] 校验失败: ${sessionRes.errors.join('; ')}`);
      }
      if (!session.documentId || !snapshot.fileRecords || !snapshot.fileRecords[session.documentId]) {
        errors.push(`SessionRecord[${sId}] 引用的 File[${session.documentId}] 在 fileRecords 中不存在`);
      }
      if (!session.projectId || !snapshot.projects || !snapshot.projects[session.projectId]) {
        errors.push(`SessionRecord[${sId}] 引用的 Project[${session.projectId}] 在 projects 中不存在`);
      }
    }
  }

  // 校验 fileRecords 字典
  if (!snapshot.fileRecords || typeof snapshot.fileRecords !== 'object') {
    errors.push('fileRecords 必须为对象');
  }

  // 校验 activeRuntimeSession
  if (snapshot.activeRuntimeSession !== null) {
    const runtime = snapshot.activeRuntimeSession;
    if (typeof runtime !== 'object') {
      errors.push('activeRuntimeSession 必须为对象或 null');
    } else {
      if (!runtime.projectId || !snapshot.projects[runtime.projectId]) {
        errors.push(`activeRuntimeSession 归属的项目 [${runtime.projectId}] 在 projects 中不存在`);
      }
      if (!runtime.documentId || !snapshot.fileRecords || !snapshot.fileRecords[runtime.documentId]) {
        errors.push(`activeRuntimeSession 关联的文件 [${runtime.documentId}] 在 fileRecords 中不存在`);
      }
    }
  }

  return createValidationResult(errors);
}
