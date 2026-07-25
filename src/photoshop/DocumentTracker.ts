import { EventNormalizer } from './EventNormalizer';

export interface ActiveDocumentState {
  documentId: string;
  displayName: string;
  fileName: string | null;
  isSaved: boolean;
  projectKey: string;
}

export interface DocumentProvider {
  getActiveDocument(): Promise<{
    id: string;
    name: string;
    path: string | null;
    isSaved: boolean;
  } | null>;
}

export class DocumentTracker {
  private activeState: ActiveDocumentState | null = null;

  constructor(
    private readonly normalizer: EventNormalizer,
    private readonly provider?: DocumentProvider
  ) {}

  /**
   * 获取当前被跟踪的前台文档状态
   */
  public getActiveDocument(): ActiveDocumentState | null {
    return this.activeState ? { ...this.activeState } : null;
  }

  /**
   * 计算 Project Key（去除扩展名）
   */
  public static deriveProjectKey(name: string): string {
    if (!name) return 'Untitled';
    const lastDotIndex = name.lastIndexOf('.');
    if (lastDotIndex <= 0) return name;
    return name.substring(0, lastDotIndex);
  }

  /**
   * 显式更新当前前台文档（发生文档激活或切换时）
   */
  public setActiveDocument(doc: {
    id: string;
    name: string;
    path?: string | null;
    isSaved?: boolean;
  }): ActiveDocumentState {
    const isSaved = doc.isSaved ?? doc.path != null;
    const projectKey = DocumentTracker.deriveProjectKey(doc.name);

    this.activeState = {
      documentId: doc.id,
      displayName: doc.name,
      fileName: doc.path ? doc.name : null,
      isSaved,
      projectKey,
    };

    // 文档上下文发生变更， bump contextGeneration
    this.normalizer.bumpContextGeneration();

    return { ...this.activeState };
  }

  /**
   * 清除当前前台文档（文档全部关闭时）
   */
  public clearActiveDocument(): void {
    this.activeState = null;
    this.normalizer.bumpContextGeneration();
  }

  /**
   * 处理 Save As 另存为更新
   */
  public handleSaveAs(newDocName: string, isSaved: boolean = true): ActiveDocumentState | null {
    if (!this.activeState) return null;

    const projectKey = DocumentTracker.deriveProjectKey(newDocName);
    this.activeState.displayName = newDocName;
    this.activeState.fileName = newDocName;
    this.activeState.isSaved = isSaved;
    this.activeState.projectKey = projectKey;

    return { ...this.activeState };
  }

  /**
   * 主动校正 (Health Check / Periodic Correct)
   * 核心约束：
   * 1. 识别当前实际前台文档ID与文件名
   * 2. 严禁抛出 Photoshop 活跃心跳 (Heartbeat)
   * 3. 严禁恢复 IDLE / FROZEN 状态为 WORKING
   * 4. 严禁向 Session 增加任何有效工作时长
   */
  public async checkHealth(): Promise<{
    changed: boolean;
    activeState: ActiveDocumentState | null;
    emittedHeartbeat: false; // 显式契约声明：永远为 false
    restoredWorking: false;  // 显式契约声明：永远为 false
  }> {
    if (!this.provider) {
      return {
        changed: false,
        activeState: this.getActiveDocument(),
        emittedHeartbeat: false,
        restoredWorking: false,
      };
    }

    const currentDoc = await this.provider.getActiveDocument();

    if (!currentDoc) {
      if (this.activeState !== null) {
        this.clearActiveDocument();
        return {
          changed: true,
          activeState: null,
          emittedHeartbeat: false,
          restoredWorking: false,
        };
      }
      return {
        changed: false,
        activeState: null,
        emittedHeartbeat: false,
        restoredWorking: false,
      };
    }

    const isDifferent =
      !this.activeState ||
      this.activeState.documentId !== currentDoc.id ||
      this.activeState.displayName !== currentDoc.name ||
      this.activeState.isSaved !== currentDoc.isSaved;

    if (isDifferent) {
      this.setActiveDocument({
        id: currentDoc.id,
        name: currentDoc.name,
        path: currentDoc.path,
        isSaved: currentDoc.isSaved,
      });
      return {
        changed: true,
        activeState: this.getActiveDocument(),
        emittedHeartbeat: false,
        restoredWorking: false,
      };
    }

    return {
      changed: false,
      activeState: this.getActiveDocument(),
      emittedHeartbeat: false,
      restoredWorking: false,
    };
  }
}
