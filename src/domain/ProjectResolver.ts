import { Project, FileRecord, ProjectStatus } from './types';
import { ProjectKeyService, DocumentInfo } from './ProjectKeyService';

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export class ProjectResolver {
  /**
   * 根据当前文档信息与全局 autoAssociate 配置，解析或新建关联项目
   */
  public static resolveProject(
    doc: DocumentInfo,
    autoAssociate: boolean,
    existingProjects: Project[],
    nextSequenceFetcher: () => number,
    now: Date = new Date()
  ): { project: Project; isNew: boolean } {
    const nowIso = now.toISOString();

    // 1. 未保存文件：始终创建全新的未命名项目
    if (!doc.isSaved) {
      const sequence = nextSequenceFetcher();
      const { key, uiName } = ProjectKeyService.generateUnsavedIdentity(sequence, now);
      const project = this.createNewProject(key, uiName, nowIso);
      return { project, isNew: true };
    }

    // 2. 已保存文件：提取 Project Key
    const projectKey = ProjectKeyService.generateSavedKey(doc.name);

    // 3. 当 autoAssociate 为 false 时，不关联已有项目，直接新建项目
    if (!autoAssociate) {
      const project = this.createNewProject(projectKey, projectKey, nowIso);
      return { project, isNew: true };
    }

    // 4. 当 autoAssociate 为 true 时，在已有项目库中检索相同 projectKey 且 status === 'ACTIVE' 且 !deleted 的活跃项目
    const activeCandidates = existingProjects.filter(
      (p) => p.projectKey === projectKey && p.status === 'ACTIVE' && !p.deleted
    );

    if (activeCandidates.length > 0) {
      // 按 createdAt 升序排序，选择最早创建的项目
      activeCandidates.sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
      return { project: activeCandidates[0], isNew: false };
    }

    // 5. 无匹配活跃项目，创建新项目
    const project = this.createNewProject(projectKey, projectKey, nowIso);
    return { project, isNew: true };
  }

  /**
   * Save As (另存为) 继承机制
   * - 保持当前原 projectId 与 Session 连续。
   * - 更新 Project Key 和 Name。
   * - 更新或新增对应的 FileRecord，绝不覆盖或删除过去的旧 FileRecord。
   * - 不受 autoAssociate 开关限制，绝对不与已有相同 Key 的其他项目自动合并。
   */
  public static handleSaveAs(
    currentProject: Project,
    newFileName: string,
    existingFileRecords: FileRecord[],
    now: Date = new Date()
  ): { updatedProject: Project; fileRecord: FileRecord } {
    const nowIso = now.toISOString();
    const newProjectKey = ProjectKeyService.generateSavedKey(newFileName);

    // 1. 查找是否已存在相同 fileName 的 FileRecord
    let targetFileRecord = existingFileRecords.find(
      (fr) => fr.projectId === currentProject.id && fr.fileName === newFileName
    );

    if (targetFileRecord) {
      targetFileRecord = {
        ...targetFileRecord,
        projectKey: newProjectKey,
        displayName: newFileName,
        isSaved: true,
        lastSeenAt: nowIso,
      };
    } else {
      targetFileRecord = {
        id: generateUUID(),
        projectId: currentProject.id,
        projectKey: newProjectKey,
        displayName: newFileName,
        fileName: newFileName,
        isSaved: true,
        temporaryKey: null,
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
      };
    }

    // 2. 更新 Project 属性
    const documentIds = currentProject.documentIds.includes(targetFileRecord.id)
      ? currentProject.documentIds
      : [...currentProject.documentIds, targetFileRecord.id];

    const updatedProject: Project = {
      ...currentProject,
      projectKey: newProjectKey,
      name: newProjectKey,
      updatedAt: nowIso,
      documentIds,
    };

    return { updatedProject, fileRecord: targetFileRecord };
  }

  private static createNewProject(key: string, name: string, nowIso: string): Project {
    return {
      id: generateUUID(),
      projectKey: key,
      name,
      note: '',
      createdAt: nowIso,
      updatedAt: nowIso,
      totalEffectiveMs: 0,
      totalOnlineMs: 0,
      documentIds: [],
      sessions: [],
      status: 'ACTIVE',
      deleted: false,
    };
  }
}
