import { useState, useEffect } from 'react';
import { AppSnapshot, RuntimeSession } from '../../domain/types';

export interface ReadModelOptions {
  getSnapshot: () => Readonly<AppSnapshot>;
  getActiveRuntime: () => Readonly<RuntimeSession> | null;
  subscribe?: (listener: () => void) => () => void;
  getNow?: () => number;
}

export function useReadModel<T>(
  selector: (
    snapshot: Readonly<AppSnapshot>,
    activeRuntime: Readonly<RuntimeSession> | null,
    now: number
  ) => T,
  options: ReadModelOptions
): T {
  const [, setTick] = useState(0);
  const getNow = options.getNow || Date.now;

  useEffect(() => {
    // 1. 订阅 Store 变动
    let unsubscribeStore: (() => void) | undefined;
    if (typeof options.subscribe === 'function') {
      unsubscribeStore = options.subscribe(() => {
        setTick(t => t + 1);
      });
    }

    // 2. 1s 定时低频刷新
    const intervalId = setInterval(() => {
      setTick(t => t + 1);
    }, 1000);

    // 3. 组件 Unmount 自动取消订阅与清除定时器
    return () => {
      if (unsubscribeStore) {
        unsubscribeStore();
      }
      clearInterval(intervalId);
    };
  }, [options.subscribe]);

  // Compute during render with the latest snapshot!
  return selector(options.getSnapshot(), options.getActiveRuntime(), getNow());
}
