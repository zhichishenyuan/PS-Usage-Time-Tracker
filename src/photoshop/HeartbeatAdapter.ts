import { SessionState } from '../domain/types';
import { RawPsEvent } from './EventNormalizer';

/**
 * A 类白名单心跳事件集合
 */
export const HEARTBEAT_WHITELIST = new Set<string>([
  'select',
  'useTool',
  'set',
  'make',
  'delete',
  'move',
  'show',
  'hide',
  'setLayerStyle',
  'selectHistoryState',
  'setSelection',
  'deselect',
  'applyFilterEvent',
  'modalStateChanged',
]);

export interface MemorySessionState {
  state: SessionState;
  lastHeartbeatAt: number;
  isMemoryDirty: boolean;
}

export class HeartbeatAdapter {
  /**
   * 检查事件是否属于 A 类心跳白名单
   */
  public isWhitelisted(eventName: string): boolean {
    return HEARTBEAT_WHITELIST.has(eventName);
  }

  /**
   * 处理可能的心跳事件
   * @param rawEvent 原始 PS 事件
   * @param activeDocumentId 当前前台激活文档 ID
   * @param currentSessionState 当前内存 RuntimeSession 状态
   * @returns 包含处理结果的对象：didTriggerHeartbeat, stateChanged, nextSessionState, triggeredDiskSave (永远为 false)
   */
  public processEvent(
    rawEvent: RawPsEvent,
    activeDocumentId: string | null,
    currentSessionState: MemorySessionState
  ): {
    didTriggerHeartbeat: boolean;
    stateChanged: boolean;
    nextSessionState: MemorySessionState;
    triggeredDiskSave: false; // 严禁触发 Store 写盘！
  } {
    const eventName = rawEvent.event;

    // 1. 检查是否处于 A 类心跳白名单
    if (!this.isWhitelisted(eventName)) {
      return {
        didTriggerHeartbeat: false,
        stateChanged: false,
        nextSessionState: { ...currentSessionState },
        triggeredDiskSave: false,
      };
    }

    // 2. 检查事件 target 是否匹配当前激活的前台文档
    const eventDocId = rawEvent.descriptor?.documentID !== undefined ? String(rawEvent.descriptor.documentID) : null;

    if (activeDocumentId && eventDocId && eventDocId !== activeDocumentId) {
      // 目标文档不是前台文档，忽略心跳
      return {
        didTriggerHeartbeat: false,
        stateChanged: false,
        nextSessionState: { ...currentSessionState },
        triggeredDiskSave: false,
      };
    }

    const now = rawEvent.timestamp || Date.now();
    let stateChanged = false;
    let nextState = currentSessionState.state;

    // 3. 如果当前状态为 IDLE 或 FROZEN，恢复为 WORKING
    if (currentSessionState.state === 'IDLE' || currentSessionState.state === 'FROZEN') {
      nextState = 'WORKING';
      stateChanged = true;
    }

    const updatedSessionState: MemorySessionState = {
      state: nextState,
      lastHeartbeatAt: now,
      isMemoryDirty: true, // 仅更新内存 dirty 标记
    };

    return {
      didTriggerHeartbeat: true,
      stateChanged,
      nextSessionState: updatedSessionState,
      triggeredDiskSave: false, // 确定不直接写磁盘
    };
  }
}
