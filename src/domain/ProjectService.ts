import { AppSnapshot } from './types';
import { ProjectNotFoundError, ProjectInUseError } from './errors';
import { validateAppSnapshot } from './validation';

export class ProjectService {
  /**
   * 安全删除项目（软删除）
   * 将状态更改为 DELETED，deleted 置为 true，保留历史 Session/File 记录，拦截活跃 Session / 编辑状态文件。
   */
  public static deleteProject(
    snapshot: Readonly<AppSnapshot>,
    projectId: string,
    now: Date = new Date()
  ): AppSnapshot {
    const project = snapshot.projects?.[projectId];

    // 1. 存在性与二次删除校验
    if (!project || (project.status === 'DELETED' && project.deleted)) {
      throw new ProjectNotFoundError('项目不存在或已被删除');
    }

    // 2. 活跃 Session & 活动编辑文件拦截
    if (snapshot.activeRuntimeSession !== null) {
      const activeRuntime = snapshot.activeRuntimeSession;
      if (activeRuntime.projectId === projectId) {
        throw new ProjectInUseError('当前项目正在计时中，禁止删除');
      }
      if (project.documentIds.includes(activeRuntime.documentId)) {
        throw new ProjectInUseError('当前项目关联的文件正在编辑中，禁止删除');
      }
    }

    // 3. 执行软删除
    const newSnapshot: AppSnapshot = JSON.parse(JSON.stringify(snapshot));
    const targetProject = newSnapshot.projects[projectId];

    const nowIso = now.toISOString();
    targetProject.status = 'DELETED';
    targetProject.deleted = true;
    targetProject.updatedAt = nowIso;

    newSnapshot.writtenAt = nowIso;
    newSnapshot.lastCheckpointAt = nowIso;

    // 4. 校验快照完整性
    const validation = validateAppSnapshot(newSnapshot);
    if (!validation.valid) {
      throw new Error(`软删除后快照校验失败: ${validation.errors.join('; ')}`);
    }

    return newSnapshot;
  }

  /**
   * 物理硬删除项目
   * 彻底清理项目实体及其关联孤立的 SessionRecord、FileRecord，并清理关联的 MergeOperation 记录。
   */
  public static hardDeleteProject(
    snapshot: Readonly<AppSnapshot>,
    projectId: string
  ): AppSnapshot {
    const project = snapshot.projects?.[projectId];

    // 1. 存在性校验
    if (!project) {
      throw new ProjectNotFoundError('项目不存在');
    }

    // 2. 活跃 Session & 活动编辑文件拦截
    if (snapshot.activeRuntimeSession !== null) {
      const activeRuntime = snapshot.activeRuntimeSession;
      if (activeRuntime.projectId === projectId) {
        throw new ProjectInUseError('当前项目正在计时中，禁止删除');
      }
      if (project.documentIds.includes(activeRuntime.documentId)) {
        throw new ProjectInUseError('当前项目关联的文件正在编辑中，禁止删除');
      }
    }

    // 3. 执行物理清理
    const newSnapshot: AppSnapshot = JSON.parse(JSON.stringify(snapshot));

    // 从 projects 中移除
    delete newSnapshot.projects[projectId];

    // 清理属于该项目的 SessionRecords
    if (newSnapshot.sessionRecords) {
      for (const [sId, session] of Object.entries(newSnapshot.sessionRecords)) {
        if (session.projectId === projectId) {
          delete newSnapshot.sessionRecords[sId];
        }
      }
    }

    // 清理属于该项目的 FileRecords
    if (newSnapshot.fileRecords) {
      for (const [fId, file] of Object.entries(newSnapshot.fileRecords)) {
        if (file.projectId === projectId) {
          delete newSnapshot.fileRecords[fId];
        }
      }
    }

    // 清理包含该 project 的 MergeOperationStack
    if (newSnapshot.mergeOperationStack) {
      newSnapshot.mergeOperationStack = newSnapshot.mergeOperationStack.filter((op) => {
        if (op.primaryProjectId === projectId) return false;
        if (op.mergedProjectIds.includes(projectId)) return false;
        return true;
      });
    }

    // 4. 校验快照完整性
    const validation = validateAppSnapshot(newSnapshot);
    if (!validation.valid) {
      throw new Error(`硬删除后快照校验失败: ${validation.errors.join('; ')}`);
    }

    return newSnapshot;
  }

  /**
   * 批量物理清理过期项目
   * 遍历项目 updatedAt（最后活动时间），如果早于 cutoffMs，则将其以及其关联记录彻底清除。
   * 返回 { changed, newSnapshot }
   */
  public static batchAutoCleanup(
    snapshot: Readonly<AppSnapshot>,
    days: number,
    now: number = Date.now()
  ): { changed: boolean; newSnapshot: AppSnapshot } {
    if (days <= 0 || isNaN(days)) return { changed: false, newSnapshot: snapshot as AppSnapshot };
    const cutoffMs = now - days * 24 * 60 * 60 * 1000;
    
    // 找出所有过期的 projectId
    const projectsToDelete = new Set<string>();
    
    // 我们还需要保证不能删除当前正在活动的 project (如果有)
    const activeRuntimeProjectId = snapshot.activeRuntimeSession?.projectId;
    
    for (const [pId, project] of Object.entries(snapshot.projects)) {
      if (pId === activeRuntimeProjectId) continue;
      
      const lastActivityMs = new Date(project.updatedAt).getTime();
      if (lastActivityMs < cutoffMs) {
        projectsToDelete.add(pId);
      }
    }
    
    if (projectsToDelete.size === 0) {
      return { changed: false, newSnapshot: snapshot as AppSnapshot };
    }
    
    // 执行批量删除
    const newSnapshot: AppSnapshot = JSON.parse(JSON.stringify(snapshot));
    
    for (const pId of projectsToDelete) {
      delete newSnapshot.projects[pId];
    }
    
    // 清理关联的 SessionRecords
    if (newSnapshot.sessionRecords) {
      for (const [sId, session] of Object.entries(newSnapshot.sessionRecords)) {
        if (projectsToDelete.has(session.projectId)) {
          delete newSnapshot.sessionRecords[sId];
        }
      }
    }
    
    // 清理关联的 FileRecords
    if (newSnapshot.fileRecords) {
      for (const [fId, file] of Object.entries(newSnapshot.fileRecords)) {
        if (projectsToDelete.has(file.projectId)) {
          delete newSnapshot.fileRecords[fId];
        }
      }
    }
    
    // 清理 MergeOperationStack
    if (newSnapshot.mergeOperationStack) {
      newSnapshot.mergeOperationStack = newSnapshot.mergeOperationStack.filter((op) => {
        if (projectsToDelete.has(op.primaryProjectId)) return false;
        if (op.mergedProjectIds.some(mId => projectsToDelete.has(mId))) return false;
        return true;
      });
    }
    
    // 校验快照完整性
    const validation = validateAppSnapshot(newSnapshot);
    if (!validation.valid) {
      throw new Error(`批量清理后快照校验失败: ${validation.errors.join('; ')}`);
    }
    
    return { changed: true, newSnapshot };
  }
}
