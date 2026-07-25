import { AppSnapshot, FileRecord, SessionRecord, Project } from './types';
import { ProjectNotFoundError } from './errors';

export interface ExportTxtOptions {
  includeHeader?: boolean;
  includeFileRecords?: boolean;
  timeZoneOffsetMinutes?: number;
}

/**
 * 将毫秒数格式化为 HH:mm:ss
 */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(Math.max(0, ms) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (num: number) => String(num).padStart(2, '0');
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * 将 ISO 8601 时间格式化为 YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(isoString: string, offsetMinutes?: number): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  if (typeof offsetMinutes === 'number') {
    const targetMs = d.getTime() + offsetMinutes * 60000;
    const targetDate = new Date(targetMs);
    const year = targetDate.getUTCFullYear();
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getUTCDate()).padStart(2, '0');
    const hours = String(targetDate.getUTCHours()).padStart(2, '0');
    const minutes = String(targetDate.getUTCMinutes()).padStart(2, '0');
    const seconds = String(targetDate.getUTCSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  const seconds = String(d.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * 从 ISO 时间提取 YYYY-MM-DD
 */
function formatDateOnly(isoString: string, offsetMinutes?: number): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  if (typeof offsetMinutes === 'number') {
    const targetMs = d.getTime() + offsetMinutes * 60000;
    const targetDate = new Date(targetMs);
    const year = targetDate.getUTCFullYear();
    const month = String(targetDate.getUTCMonth() + 1).padStart(2, '0');
    const day = String(targetDate.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 从 ISO 时间提取 HH:mm
 */
function formatTimeOnly(isoString: string, offsetMinutes?: number): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  if (typeof offsetMinutes === 'number') {
    const targetMs = d.getTime() + offsetMinutes * 60000;
    const targetDate = new Date(targetMs);
    const hours = String(targetDate.getUTCHours()).padStart(2, '0');
    const minutes = String(targetDate.getUTCMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export class ExportService {
  /**
   * 将全量数据导出为 CSV
   */
  public static exportToCSV(
    projects: Record<string, Project>,
    sessionRecords: Record<string, SessionRecord>
  ): string {
    const lines: string[] = [];
    // 添加 UTF-8 BOM，防止 Excel 打开乱码
    lines.push('\uFEFF工作日期,开始时间,结束时间,项目名称,项目备注,有效工作时长,在线时长,结束原因');

    const sessions = Object.values(sessionRecords || {}).sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

    for (const s of sessions) {
      const p = projects[s.projectId];
      if (!p) continue;
      
      const dateStr = formatDateOnly(s.startAt);
      const startStr = formatTimeOnly(s.startAt);
      const endStr = formatTimeOnly(s.endAt);
      
      const pName = `"${(p.name || '').replace(/"/g, '""')}"`;
      const pNote = `"${(p.note || '').replace(/"/g, '""')}"`;
      
      const eff = formatDuration(s.effectiveMs);
      const onl = formatDuration(s.onlineMs);
      const reason = s.endReason;

      lines.push(`${dateStr},${startStr},${endStr},${pName},${pNote},${eff},${onl},${reason}`);
    }

    return lines.join('\n');
  }

  /**
   * 将指定项目导出为排版格式良好的 TXT 文本明细
   */
  public static exportProjectToTxt(
    snapshot: Readonly<AppSnapshot>,
    projectId: string,
    options: ExportTxtOptions = {}
  ): string {
    const project = snapshot.projects?.[projectId];
    if (!project) {
      throw new ProjectNotFoundError(`找不到项目 ID: ${projectId}`);
    }

    const includeHeader = options.includeHeader !== false;
    const includeFileRecords = options.includeFileRecords !== false;
    const tzOffset = options.timeZoneOffsetMinutes;

    // 关联的 FileRecords
    const files: FileRecord[] = Object.values(snapshot.fileRecords || {}).filter(
      (f) => project.documentIds.includes(f.id) || f.projectId === projectId
    );

    // 关联的 SessionRecords (按 startAt 升序排序)
    const sessions: SessionRecord[] = Object.values(snapshot.sessionRecords || {})
      .filter((s) => project.sessions.includes(s.id) || s.projectId === projectId)
      .sort((a, b) => Date.parse(a.startAt) - Date.parse(b.startAt));

    const lines: string[] = [];
    const divider = '='.repeat(80);
    const subDivider = '-'.repeat(80);

    if (includeHeader) {
      lines.push(divider);
      lines.push('                    Photoshop Usage Time Tracker - 工时明细报告');
      lines.push(divider);
    }

    lines.push(`项目名称:   ${project.name}`);
    lines.push(`Project Key:${project.projectKey}`);
    lines.push(`项目 ID:    ${project.id}`);
    lines.push(`项目备注:   ${project.note || '(无)'}`);
    lines.push(`创建时间:   ${formatDateTime(project.createdAt, tzOffset)}`);
    lines.push(`导出时间:   ${formatDateTime(new Date().toISOString(), tzOffset)}`);
    lines.push('');

    lines.push(subDivider);
    lines.push('【工时汇总】');
    lines.push(subDivider);
    lines.push(
      `累计有效工作时长: ${formatDuration(project.totalEffectiveMs)} (${project.totalEffectiveMs.toLocaleString()} ms)`
    );
    lines.push(
      `累计在线总时长:   ${formatDuration(project.totalOnlineMs)} (${project.totalOnlineMs.toLocaleString()} ms)`
    );
    lines.push(`已完成 Session 数: ${sessions.length} 笔`);
    lines.push(`关联文件数量:     ${files.length} 个`);
    lines.push('');

    if (includeFileRecords) {
      lines.push(subDivider);
      lines.push('【关联文件记录】');
      lines.push(subDivider);
      if (files.length === 0) {
        lines.push('(暂无关联文件记录)');
      } else {
        files.forEach((file, index) => {
          const saveTag = file.isSaved ? '[已保存]' : '[未保存]';
          lines.push(`${index + 1}. ${saveTag} ${file.displayName} (首次记录: ${formatDateTime(file.firstSeenAt, tzOffset)})`);
        });
      }
      lines.push('');
    }

    lines.push(subDivider);
    lines.push('【历史工作 Session 明细】');
    lines.push(subDivider);

    if (sessions.length === 0) {
      lines.push('(暂无历史 Session 记录)');
    } else {
      lines.push('序号 | 日期       | 时间段        | 有效时长   | 在线时长   | 结束原因         | 关联文件');
      lines.push('-----|------------|---------------|------------|------------|------------------|----------------------');

      sessions.forEach((s, index) => {
        const seq = String(index + 1).padEnd(4, ' ');
        const dateStr = formatDateOnly(s.startAt, tzOffset).padEnd(10, ' ');
        const timeRange = `${formatTimeOnly(s.startAt, tzOffset)}～${formatTimeOnly(s.endAt, tzOffset)}`.padEnd(13, ' ');
        const effDuration = formatDuration(s.effectiveMs).padEnd(10, ' ');
        const onlDuration = formatDuration(s.onlineMs).padEnd(10, ' ');
        const endReason = String(s.endReason).padEnd(16, ' ');

        const relatedFile = snapshot.fileRecords?.[s.documentId]?.displayName || s.documentId;

        lines.push(`${seq} | ${dateStr} | ${timeRange} | ${effDuration} | ${onlDuration} | ${endReason} | ${relatedFile}`);
      });
    }

    lines.push(divider);

    return lines.join('\n');
  }

  /**
   * 将指定项目导出为 JSON 结构化文本
   */
  public static exportProjectToJson(
    snapshot: Readonly<AppSnapshot>,
    projectId: string
  ): string {
    const project = snapshot.projects?.[projectId];
    if (!project) {
      throw new ProjectNotFoundError(`找不到项目 ID: ${projectId}`);
    }

    const fileRecords = Object.values(snapshot.fileRecords || {}).filter(
      (f) => project.documentIds.includes(f.id) || f.projectId === projectId
    );

    const sessionRecords = Object.values(snapshot.sessionRecords || {}).filter(
      (s) => project.sessions.includes(s.id) || s.projectId === projectId
    );

    const exportObj = {
      exportVersion: '1.0',
      exportedAt: new Date().toISOString(),
      project,
      fileRecords,
      sessionRecords,
    };

    return JSON.stringify(exportObj, null, 2);
  }

  /**
   * 导出全量 AppSnapshot 数据为 JSON
   */
  public static exportFullSnapshotToJson(
    snapshot: Readonly<AppSnapshot>
  ): string {
    return JSON.stringify(snapshot, null, 2);
  }
}
