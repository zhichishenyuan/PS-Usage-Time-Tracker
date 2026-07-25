import { AppSnapshot, SessionRecord, TimeSlice } from '../domain/types';
import { formatLocalDate } from '../domain/validation';

export interface RecoveryResult {
  recovered: boolean;
  recoveryRecord: SessionRecord | null;
  affectedProjectId: string | null;
}

export class CrashRecoveryEngine {
  /**
   * 执行崩溃恢复处理
   * 检查快照中是否存在残留的 activeRuntimeSession。
   * 若存在，强制将 endAt 设定为 snapshot.lastCheckpointAt，生成 SessionRecord 并重新计算项目累计值。
   */
  public recover(snapshot: AppSnapshot): RecoveryResult {
    const active = snapshot.activeRuntimeSession;

    // 1. 无残留 activeRuntimeSession 时，无需恢复，保持幂等
    if (!active) {
      return {
        recovered: false,
        recoveryRecord: null,
        affectedProjectId: null,
      };
    }

    // 2. 崩溃结束时间强约束：必须严格使用 snapshot.lastCheckpointAt，绝对不能使用 Date.now()！
    const recoveryEndIso = snapshot.lastCheckpointAt;
    const recoveryEndMs = Date.parse(recoveryEndIso);

    const segmentStartIso = active.segmentStartedAt;
    const segmentStartMs = Date.parse(segmentStartIso);

    // 计算当前 Segment 在崩溃前物理确认落盘的真实时长
    const onlineMs = Math.max(0, recoveryEndMs - segmentStartMs);
    const effectiveMs = Math.min(onlineMs, active.segmentEffectiveMs);
    const localDate = formatLocalDate(segmentStartMs);

    // 构造最终 Segment 时间片
    const currentSlice: TimeSlice = {
      segmentId: active.segmentId,
      startAt: segmentStartIso,
      endAt: recoveryEndIso,
      onlineMs,
      effectiveMs,
      localDate,
    };

    const allSegments: TimeSlice[] = [...active.completedSegments, currentSlice];

    const totalOnlineMs = allSegments.reduce((sum, s) => sum + s.onlineMs, 0);
    const totalEffectiveMs = allSegments.reduce((sum, s) => sum + s.effectiveMs, 0);

    // 构造完成恢复后的不可变历史 SessionRecord
    const recoveryRecord: SessionRecord = {
      id: active.id,
      projectId: active.projectId,
      documentId: active.documentId,
      startAt: active.startAt,
      endAt: recoveryEndIso,
      onlineMs: totalOnlineMs,
      effectiveMs: totalEffectiveMs,
      status: 'recovered',
      endReason: 'crash-recovery',
      segments: allSegments,
      continuationGroupId: active.continuationGroupId,
      createdAt: active.startAt,
      updatedAt: recoveryEndIso,
    };

    // 3. 将 SessionRecord 保存至快照
    snapshot.sessionRecords[recoveryRecord.id] = recoveryRecord;

    // 4. 重算受影响项目 (Project) 的累计在与有效时长
    const projectId = active.projectId;
    const project = snapshot.projects[projectId];

    if (project) {
      if (!project.sessions.includes(recoveryRecord.id)) {
        project.sessions.push(recoveryRecord.id);
      }

      // 从全量 historical sessionRecords 重算该项目的 totalOnlineMs 与 totalEffectiveMs
      let recalculatedOnlineMs = 0;
      let recalculatedEffectiveMs = 0;

      for (const sId of project.sessions) {
        const record = snapshot.sessionRecords[sId];
        if (record) {
          recalculatedOnlineMs += record.onlineMs;
          recalculatedEffectiveMs += record.effectiveMs;
        }
      }

      project.totalOnlineMs = recalculatedOnlineMs;
      project.totalEffectiveMs = recalculatedEffectiveMs;
      project.updatedAt = recoveryEndIso;
    }

    // 5. 清空运行态 Session，确保幂等
    snapshot.activeRuntimeSession = null;

    return {
      recovered: true,
      recoveryRecord,
      affectedProjectId: projectId,
    };
  }
}
