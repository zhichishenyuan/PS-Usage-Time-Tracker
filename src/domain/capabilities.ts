/**
 * UXP / Photoshop 平台细粒度能力矩阵
 */
export interface RuntimeCapabilities {
  /** 是否支持读写 UXP getDataFolder() 本地数据目录 */
  hasFileSystemAccess: boolean;

  /** 是否支持捕获文档打开、关闭、激活切换事件 */
  hasDocumentEvents: boolean;

  /** 是否支持 batchPlay 捕获 PS 深度图层/工具/选择区等心跳事件 */
  hasBatchPlay: boolean;

  /** 是否支持可靠识别 Save As 事件及其目标文件名 */
  hasSaveAsEvent: boolean;

  /** 是否支持可靠识别模态操作（ACR / 滤镜库 / 液化等）开始、提交与取消 */
  hasModalEvents: boolean;

  /** 是否支持监听 Photoshop 宿主退出或插件 Panel 销毁通知 */
  hasExitEvent: boolean;
}

/**
 * 插件系统运行模式
 * - FULL: 所有关键能力均可用，启用完整功能
 * - DEGRADED: 文件系统可用，但部分 PS 事件缺乏，降级为普通心跳/轮询，不进行猜测性模态补偿
 * - UNAVAILABLE: 文件系统不可用或核心文档事件严重缺失，无法安全记录数据，系统停止统计并报错
 */
export type RuntimeMode = 'FULL' | 'DEGRADED' | 'UNAVAILABLE';

/**
 * 探测结果与模式评估结果
 */
export interface CapabilityAssessment {
  mode: RuntimeMode;
  capabilities: RuntimeCapabilities;
  degradedReasons: string[];
}

/**
 * 能力探测器抽象接口
 */
export interface ICapabilitiesDetector {
  /**
   * 执行能力探测并返回评估结果
   */
  detect(): Promise<CapabilityAssessment>;
}

/**
 * 根据平台细粒度能力矩阵评估运行模式
 * @param capabilities 运行时能力矩阵
 * @returns 评估结果，包含运行模式与降级原因清单
 */
export function evaluateRuntimeMode(capabilities: RuntimeCapabilities): CapabilityAssessment {
  const degradedReasons: string[] = [];

  // 1. 致命判定：数据存储不可用或无法监控文档事件，则直接设为 UNAVAILABLE
  if (!capabilities.hasFileSystemAccess) {
    degradedReasons.push('FileSystem access is unavailable. Data cannot be safely persisted.');
  }

  if (!capabilities.hasDocumentEvents) {
    degradedReasons.push('Document lifecycle events are unavailable. Active documents cannot be tracked.');
  }

  if (!capabilities.hasFileSystemAccess || !capabilities.hasDocumentEvents) {
    return {
      mode: 'UNAVAILABLE',
      capabilities: { ...capabilities },
      degradedReasons,
    };
  }

  // 2. 降级判定：关键可选项缺失
  if (!capabilities.hasModalEvents) {
    degradedReasons.push('Modal events unavailable. Speculative modal compensation disabled.');
  }

  if (!capabilities.hasSaveAsEvent) {
    degradedReasons.push('Save As event unavailable. Save As document association delayed until next activation.');
  }

  if (!capabilities.hasBatchPlay) {
    degradedReasons.push('BatchPlay event capture unavailable. Secondary heartbeat listening disabled.');
  }

  if (!capabilities.hasExitEvent) {
    degradedReasons.push('Exit event listener unavailable. Unclosed session relies on crash recovery.');
  }

  const mode: RuntimeMode = degradedReasons.length > 0 ? 'DEGRADED' : 'FULL';

  return {
    mode,
    capabilities: { ...capabilities },
    degradedReasons,
  };
}
