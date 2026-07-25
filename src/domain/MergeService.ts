import { AppSnapshot, Project, MergeOperation } from './types';
import { MergeValidationError, UndoMergeError } from './errors';
import { validateAppSnapshot } from './validation';

export interface MergeResult {
  updatedSnapshot: AppSnapshot;
  primaryProject: Project;
  mergeOperation: MergeOperation;
}

export interface UndoMergeResult {
  updatedSnapshot: AppSnapshot;
  restoredProject: Project;
  primaryProject: Project;
}

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

export class MergeService {
  /**
   * 将源项目 (sourceProjectId) 与目标项目 (targetProjectId) 进行合并
   * 根据 Earliest Created 规则判定主项目，累加工时、迁移 SessionRecord/FileRecord，
   * 更新副项目状态为 MERGED，生成并压入 MergeOperation 快照。
   */
  public static mergeProjects(
    snapshot: Readonly<AppSnapshot>,
    targetProjectId: string,
    sourceProjectId: string,
    now: Date = new Date()
  ): MergeResult {
    const targetProj = snapshot.projects?.[targetProjectId];
    const sourceProj = snapshot.projects?.[sourceProjectId];

    // 1. 存在性校验
    if (!targetProj || !sourceProj) {
      throw new MergeValidationError('合并操作中的目标项目或源项目不存在');
    }

    // 2. 状态校验 (必须处于 ACTIVE 且 !deleted)
    if (targetProj.status !== 'ACTIVE' || targetProj.deleted) {
      throw new MergeValidationError(`目标项目 [${targetProj.name}] 非活跃或已删除，拒绝合并`);
    }
    if (sourceProj.status !== 'ACTIVE' || sourceProj.deleted) {
      throw new MergeValidationError(`源项目 [${sourceProj.name}] 非活跃或已删除，拒绝合并`);
    }

    // 3. 同项目校验
    if (targetProjectId === sourceProjectId) {
      throw new MergeValidationError('不能将项目与自身进行合并');
    }

    // 4. (原) 活动 Session 拦截已取消。现在允许合并，若涉及活动项目则自动更新其归属。

    // 5. 判定 Earliest Created 主项目
    const targetCreatedMs = Date.parse(targetProj.createdAt);
    const sourceCreatedMs = Date.parse(sourceProj.createdAt);

    let primaryId: string;
    let mergedId: string;

    if (sourceCreatedMs < targetCreatedMs) {
      primaryId = sourceProjectId;
      mergedId = targetProjectId;
    } else {
      primaryId = targetProjectId;
      mergedId = sourceProjectId;
    }

    // 6. 深拷贝 Snapshot
    const newSnapshot: AppSnapshot = JSON.parse(JSON.stringify(snapshot));

    const primaryProj = newSnapshot.projects[primaryId];
    const mergedProj = newSnapshot.projects[mergedId];
    const origMergedProjCopy: Project = JSON.parse(JSON.stringify(snapshot.projects[mergedId]));

    const nowIso = now.toISOString();

    // 7. 累加工时与操作步数
    primaryProj.totalEffectiveMs += mergedProj.totalEffectiveMs;
    primaryProj.totalOnlineMs += mergedProj.totalOnlineMs;
    primaryProj.totalActionSteps = (primaryProj.totalActionSteps || 0) + (mergedProj.totalActionSteps || 0);
    primaryProj.updatedAt = nowIso;

    // 8. 迁移 SessionRecords
    const sessionReassignments: Array<{ sessionId: string; originalProjectId: string }> = [];
    if (newSnapshot.sessionRecords) {
      for (const sessionRecord of Object.values(newSnapshot.sessionRecords)) {
        if (sessionRecord.projectId === mergedId) {
          sessionRecord.projectId = primaryId;
          sessionReassignments.push({
            sessionId: sessionRecord.id,
            originalProjectId: mergedId,
          });
        }
      }
    }
    // 合并并去重 primaryProj.sessions
    const combinedSessions = Array.from(new Set([...primaryProj.sessions, ...mergedProj.sessions]));
    primaryProj.sessions = combinedSessions;

    // 9. 迁移 FileRecords
    const documentReassignments: Array<{ documentId: string; originalProjectId: string }> = [];
    if (newSnapshot.fileRecords) {
      for (const fileRecord of Object.values(newSnapshot.fileRecords)) {
        if (fileRecord.projectId === mergedId) {
          fileRecord.projectId = primaryId;
          documentReassignments.push({
            documentId: fileRecord.id,
            originalProjectId: mergedId,
          });
        }
      }
    }
    // 合并并去重 primaryProj.documentIds
    const combinedDocs = Array.from(new Set([...primaryProj.documentIds, ...mergedProj.documentIds]));
    primaryProj.documentIds = combinedDocs;

    // 10. 更新副项目状态，及活动 Session 归属
    mergedProj.status = 'MERGED';
    mergedProj.deleted = false;
    mergedProj.updatedAt = nowIso;

    if (newSnapshot.activeRuntimeSession && newSnapshot.activeRuntimeSession.projectId === mergedId) {
      newSnapshot.activeRuntimeSession.projectId = primaryId;
    }

    // 11. 生成 MergeOperation 入栈 (V1 单层保留最新 1 条)
    const mergeOp: MergeOperation = {
      id: generateUUID(),
      timestamp: nowIso,
      primaryProjectId: primaryId,
      mergedProjectIds: [mergedId],
      snapshot: {
        mergedProjects: [origMergedProjCopy],
        sessionReassignments,
        documentReassignments,
      },
    };

    if (!newSnapshot.undoMergeRecords) newSnapshot.undoMergeRecords = {};
    newSnapshot.undoMergeRecords[primaryId] = mergeOp;
    newSnapshot.writtenAt = nowIso;
    newSnapshot.lastCheckpointAt = nowIso;

    // 12. 自我校验
    const validation = validateAppSnapshot(newSnapshot);
    if (!validation.valid) {
      throw new MergeValidationError(`合并后快照校验失败: ${validation.errors.join('; ')}`);
    }

    return {
      updatedSnapshot: newSnapshot,
      primaryProject: primaryProj,
      mergeOperation: mergeOp,
    };
  }

  /**
   * 撤销最近一次合并操作 (Undo Merge V1)
   */
  public static undoMerge(
    snapshot: Readonly<AppSnapshot>,
    targetProjectId: string,
    now: Date = new Date()
  ): UndoMergeResult {
    if (!snapshot.undoMergeRecords || !snapshot.undoMergeRecords[targetProjectId]) {
      throw new UndoMergeError('没有可撤销的合并操作');
    }

    const newSnapshot: AppSnapshot = JSON.parse(JSON.stringify(snapshot));
    const lastOp = newSnapshot.undoMergeRecords[targetProjectId];

    const primaryProj = newSnapshot.projects[lastOp.primaryProjectId];
    if (!primaryProj) {
      throw new UndoMergeError(`主项目 [${lastOp.primaryProjectId}] 不存在，无法执行合并撤销`);
    }

    const nowIso = now.toISOString();

    // 1. 恢复副项目 (Merged Projects)
    let lastRestoredProject: Project | null = null;
    for (const origProj of lastOp.snapshot.mergedProjects) {
      const restoredProj: Project = {
        ...origProj,
        status: 'ACTIVE',
        deleted: false,
        updatedAt: nowIso,
      };
      newSnapshot.projects[restoredProj.id] = restoredProj;
      lastRestoredProject = restoredProj;
    }

    if (!lastRestoredProject) {
      throw new UndoMergeError('撤销快照中缺失需恢复的副项目信息');
    }

    // 2. 归还 SessionRecord 归属与剔除主项目引用
    for (const reassignment of lastOp.snapshot.sessionReassignments) {
      const { sessionId, originalProjectId } = reassignment;
      if (newSnapshot.sessionRecords[sessionId]) {
        newSnapshot.sessionRecords[sessionId].projectId = originalProjectId;
      }
      // 从主项目 sessions 中剔除
      primaryProj.sessions = primaryProj.sessions.filter((sId) => sId !== sessionId);
    }

    // 3. 归还 FileRecord 归属与剔除主项目引用
    if (lastOp.snapshot.documentReassignments && lastOp.snapshot.documentReassignments.length > 0) {
      for (const docReassignment of lastOp.snapshot.documentReassignments) {
        const { documentId, originalProjectId } = docReassignment;
        if (newSnapshot.fileRecords[documentId]) {
          newSnapshot.fileRecords[documentId].projectId = originalProjectId;
        }
        primaryProj.documentIds = primaryProj.documentIds.filter((dId) => dId !== documentId);
      }
    } else {
      // 备用：若没有 documentReassignments 记录，按副项目的 documentIds 剔除与归还
      for (const origProj of lastOp.snapshot.mergedProjects) {
        for (const docId of origProj.documentIds) {
          if (newSnapshot.fileRecords[docId]) {
            newSnapshot.fileRecords[docId].projectId = origProj.id;
          }
          primaryProj.documentIds = primaryProj.documentIds.filter((dId) => dId !== docId);
        }
      }
    }

    // 4. 扣除累加的工时与操作步数
    for (const origProj of lastOp.snapshot.mergedProjects) {
      primaryProj.totalEffectiveMs = Math.max(0, primaryProj.totalEffectiveMs - origProj.totalEffectiveMs);
      primaryProj.totalOnlineMs = Math.max(0, primaryProj.totalOnlineMs - origProj.totalOnlineMs);
      primaryProj.totalActionSteps = Math.max(0, (primaryProj.totalActionSteps || 0) - (origProj.totalActionSteps || 0));
    }
    primaryProj.updatedAt = nowIso;

    // 恢复 activeRuntimeSession 的指向（如果它当前指向主项目，且它正在编辑被撤销的文档）
    if (newSnapshot.activeRuntimeSession && newSnapshot.activeRuntimeSession.projectId === primaryProj.id) {
      const activeDocId = newSnapshot.activeRuntimeSession.documentId;
      // 检查当前活动文档是否属于刚恢复的某个副项目
      for (const origProj of lastOp.snapshot.mergedProjects) {
        if (origProj.documentIds.includes(activeDocId)) {
          newSnapshot.activeRuntimeSession.projectId = origProj.id;
          break;
        }
      }
    }

    // 5. 删除对应的撤销记录
    delete newSnapshot.undoMergeRecords[targetProjectId];
    newSnapshot.writtenAt = nowIso;
    newSnapshot.lastCheckpointAt = nowIso;

    // 6. 快照合法性校验
    const validation = validateAppSnapshot(newSnapshot);
    if (!validation.valid) {
      throw new UndoMergeError(`撤销合并后快照校验失败: ${validation.errors.join('; ')}`);
    }

    return {
      updatedSnapshot: newSnapshot,
      restoredProject: lastRestoredProject,
      primaryProject: primaryProj,
    };
  }
}
