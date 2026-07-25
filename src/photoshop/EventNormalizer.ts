export type DomainEventType =
  | 'HEARTBEAT'
  | 'DOCUMENT_SWITCH'
  | 'DOCUMENT_CLOSE'
  | 'SAVE_AS'
  | 'UNKNOWN';

export interface RawPsEvent {
  event: string;
  descriptor?: Record<string, any>;
  timestamp?: number;
}

export interface DomainEvent {
  type: DomainEventType;
  rawEventName: string;
  timestamp: number;
  documentId?: string;
  documentName?: string;
  isSaved?: boolean;
  contextGeneration: number;
  descriptor?: Record<string, any>;
}

export class EventNormalizer {
  private currentContextGeneration: number = 0;

  /**
   * 获取当前 Context Generation 版本
   */
  public getContextGeneration(): number {
    return this.currentContextGeneration;
  }

  /**
   * 发生前台文档切换、关闭或重新建立上下文时，递增 Context Generation 版本
   */
  public bumpContextGeneration(): number {
    this.currentContextGeneration++;
    return this.currentContextGeneration;
  }

  /**
   * 规范化事件并执行 contextGeneration 版本防腐校验
   * 若 expectedGeneration 与 currentContextGeneration 不一致，丢弃事件并返回 null
   */
  public normalize(rawEvent: RawPsEvent, expectedGeneration?: number): DomainEvent | null {
    const targetGen = expectedGeneration !== undefined ? expectedGeneration : this.currentContextGeneration;

    if (targetGen !== this.currentContextGeneration) {
      // 版本不匹配：该异步回调跨越了文档切换，直接丢弃！
      return null;
    }

    const eventName = rawEvent.event;
    const timestamp = rawEvent.timestamp || Date.now();
    const descriptor = rawEvent.descriptor || {};

    let eventType: DomainEventType = 'UNKNOWN';

    // 常用事件映射判定
    if (
      eventName === 'selectDocument' ||
      eventName === 'open' ||
      (eventName === 'select' && descriptor._target?.[0]?._ref === 'document')
    ) {
      eventType = 'DOCUMENT_SWITCH';
    } else if (eventName === 'close') {
      eventType = 'DOCUMENT_CLOSE';
    } else if (eventName === 'save' || eventName === 'saveAs') {
      eventType = 'SAVE_AS';
    } else {
      eventType = 'HEARTBEAT';
    }

    const docId = descriptor.documentID !== undefined ? String(descriptor.documentID) : undefined;
    const docName = descriptor.title || descriptor.name;
    const isSaved = descriptor.saved !== undefined ? Boolean(descriptor.saved) : undefined;

    return {
      type: eventType,
      rawEventName: eventName,
      timestamp,
      documentId: docId,
      documentName: docName,
      isSaved,
      contextGeneration: targetGen,
      descriptor,
    };
  }
}
