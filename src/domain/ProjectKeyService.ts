/**
 * ProjectKeyService
 * 负责根据文档名称/路径与未命名自增序号生成 Project Key 及 UI 显示名称。
 */

export interface DocumentInfo {
  /** 是否已被首次保存 */
  isSaved: boolean;
  /** 文件名或全路径（如 D:/Work/Project/Logo.psd 或 IMG_0216.CR2） */
  name: string;
  /** 可选：文件首次记录时间戳 */
  createdAt?: number;
}

export class ProjectKeyService {
  /**
   * 生成已保存文件的 Project Key
   * 规则：
   * 1. 绝对禁止包含路径，只提取文件名。
   * 2. 截去最后一个扩展名（保留大小写/中文/Emoji/空格）。
   * 3. 若文件名无扩展名或以点开头（如 .gitignore），完整保留文件名。
   */
  public static generateSavedKey(fileNameOrPath: string): string {
    if (!fileNameOrPath) {
      return '';
    }

    // 提取文件名（兼容 Windows '\\' 与 Unix/Mac '/' 路径分隔符）
    const pathSegments = fileNameOrPath.split(/[/\\]/);
    const fileName = pathSegments[pathSegments.length - 1] || '';

    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex <= 0) {
      return fileName;
    }

    return fileName.substring(0, lastDotIndex);
  }

  /**
   * 生成未保存文件的内部 Project Key 与 UI 名称
   * key 格式: unsaved_<YYYYMMDDHHmmss>_<seq>
   * uiName 格式: 未命名项目_YYYY-MMDD-HHmmss_seq
   */
  public static generateUnsavedIdentity(
    sequence: number,
    now: Date = new Date()
  ): { key: string; uiName: string } {
    const pad = (n: number, width: number = 2) => String(n).padStart(width, '0');

    const YYYY = now.getFullYear();
    const MM = pad(now.getMonth() + 1);
    const DD = pad(now.getDate());
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    const ss = pad(now.getSeconds());

    const timestampStr = `${YYYY}${MM}${DD}${hh}${mm}${ss}`;
    const uiTimestampStr = `${YYYY}-${MM}${DD}-${hh}${mm}${ss}`;

    const key = `unsaved_${timestampStr}_${sequence}`;
    const uiName = `未命名项目_${uiTimestampStr}_${sequence}`;

    return { key, uiName };
  }
}
