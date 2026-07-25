import { ModalType, ModalResult } from '../domain/types';
import { EventNormalizer, RawPsEvent } from './EventNormalizer';

export interface ModalContext {
  modalType: ModalType;
  enterTimestamp: number;
  descriptor?: Record<string, any>;
}

export interface DomainModalEvent {
  type: 'MODAL_ENTER' | 'MODAL_EXIT';
  modalType: ModalType;
  timestamp: number;
  result?: ModalResult;
  contextGeneration: number;
  descriptor?: Record<string, any>;
}

export class ModalTracker {
  private currentContext: ModalContext | null = null;

  constructor(private readonly normalizer?: EventNormalizer) {}

  public isModalActive(): boolean {
    return this.currentContext !== null;
  }

  public getModalContext(): Readonly<ModalContext> | null {
    return this.currentContext ? { ...this.currentContext } : null;
  }

  public handleModalEnter(
    modalType: ModalType,
    timestamp: number,
    descriptor?: Record<string, any>
  ): ModalContext {
    this.currentContext = {
      modalType,
      enterTimestamp: timestamp,
      descriptor,
    };
    return { ...this.currentContext };
  }

  public handleModalExit(): ModalContext | null {
    const ctx = this.currentContext;
    this.currentContext = null;
    return ctx;
  }

  /**
   * 规范化模态 Action / modalStateChanged 事件
   */
  public normalizeModalEvent(
    rawEvent: RawPsEvent,
    expectedGeneration?: number
  ): DomainModalEvent | null {
    const eventName = rawEvent.event;
    const timestamp = rawEvent.timestamp || Date.now();
    const descriptor = rawEvent.descriptor || {};

    if (eventName !== 'modalStateChanged' && !eventName.toLowerCase().includes('modal')) {
      return null;
    }

    const targetGen = this.normalizer
      ? this.normalizer.getContextGeneration()
      : expectedGeneration ?? 0;

    if (expectedGeneration !== undefined && targetGen !== expectedGeneration) {
      return null;
    }

    const stateStr = String(descriptor.state || '').toLowerCase();
    const isModalBool = descriptor.isModal;

    const isEnter = stateStr === 'opened' || stateStr === 'enter' || isModalBool === true;
    const isExit = stateStr === 'closed' || stateStr === 'exit' || isModalBool === false;

    // 解析 target ModalType
    let modalType: ModalType = 'GENERIC_MODAL';
    const targetName = String(
      descriptor.target || descriptor.title || descriptor.name || ''
    ).toLowerCase();

    if (targetName.includes('camera raw') || targetName.includes('acr')) {
      modalType = 'ACR';
    } else if (targetName.includes('liquify') || targetName.includes('液化')) {
      modalType = 'LIQUIFY';
    } else if (targetName.includes('filter') || targetName.includes('滤镜')) {
      modalType = 'FILTER_GALLERY';
    }

    if (isEnter) {
      this.handleModalEnter(modalType, timestamp, descriptor);
      return {
        type: 'MODAL_ENTER',
        modalType,
        timestamp,
        contextGeneration: targetGen,
        descriptor,
      };
    }

    if (isExit) {
      const canceled = Boolean(descriptor.canceled || descriptor.cancelled);
      const result: ModalResult = canceled ? 'cancel' : 'commit';
      this.handleModalExit();
      return {
        type: 'MODAL_EXIT',
        modalType,
        timestamp,
        result,
        contextGeneration: targetGen,
        descriptor,
      };
    }

    return null;
  }
}
