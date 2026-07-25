import { AppSnapshot } from '../domain/types';
import { Store } from './Store';

export interface PendingWriteTask {
  snapshot: AppSnapshot;
  checkpointAt: string;
  resolvers: Array<() => void>;
  rejecters: Array<(reason: unknown) => void>;
}

export class PersistenceWriteQueue {
  private isProcessing: boolean = false;
  private isDirty: boolean = false;
  private pendingTask: PendingWriteTask | null = null;
  private lastCheckpointAt: string | null = null;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(
    private readonly store: Store,
    options?: { maxRetries?: number; retryDelayMs?: number }
  ) {
    this.maxRetries = options?.maxRetries ?? 3;
    this.retryDelayMs = options?.retryDelayMs ?? 50;
  }

  /**
   * 查询当前是否有未完成落盘的脏数据
   */
  public getIsDirty(): boolean {
    return this.isDirty;
  }

  /**
   * 获取最近一次物理写入确认成功落盘的 Checkpoint 时间戳 (ISO)
   */
  public getLastCheckpointAt(): string | null {
    return this.lastCheckpointAt;
  }

  /**
   * 将写请求提交至队列
   * 若队列正忙，多请求将自动 Coalesce (合并) 为最新快照
   */
  public enqueue(snapshot: AppSnapshot, checkpointAt?: string): Promise<void> {
    const targetCheckpoint = checkpointAt || snapshot.lastCheckpointAt;
    this.isDirty = true;

    return new Promise<void>((resolve, reject) => {
      if (this.pendingTask) {
        // 请求合并 (Coalescing): 替换为最新的 snapshot 和 checkpoint，并叠加 Promise 回调
        this.pendingTask.snapshot = snapshot;
        this.pendingTask.checkpointAt = targetCheckpoint;
        this.pendingTask.resolvers.push(resolve);
        this.pendingTask.rejecters.push(reject);
      } else {
        this.pendingTask = {
          snapshot,
          checkpointAt: targetCheckpoint,
          resolvers: [resolve],
          rejecters: [reject],
        };
      }

      // 如果当前没有正在处理的物理写入任务，启动队列处理
      if (!this.isProcessing) {
        this.processQueue();
      }
    });
  }

  /**
   * 立即强刷（等待当前任务并写完待处理请求）
   */
  public async flush(): Promise<void> {
    while (this.pendingTask || this.isProcessing) {
      if (!this.isProcessing && this.pendingTask) {
        this.processQueue();
      }
      await new Promise((r) => setTimeout(r, 10));
    }
  }

  /**
   * 私有单线程 Mutex 循环处理队列
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || !this.pendingTask) {
      return;
    }

    this.isProcessing = true;

    while (this.pendingTask) {
      // 提取当前的写任务并重置 pendingTask 指针，以允许后续 enqueue 收集新请求
      const currentTask = this.pendingTask;
      this.pendingTask = null;

      let success = false;
      let lastError: unknown = null;

      // 尝试重试物理落盘
      for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
        try {
          await this.store.save(currentTask.snapshot);
          success = true;
          break;
        } catch (err) {
          lastError = err;
          if (attempt < this.maxRetries && this.retryDelayMs > 0) {
            await new Promise((r) => setTimeout(r, this.retryDelayMs));
          }
        }
      }

      if (success) {
        // 物理写盘成功，更新确认界限与 dirty 状态
        this.lastCheckpointAt = currentTask.checkpointAt;
        this.isDirty = this.pendingTask !== null; // 若在物理写入期间又有了新的 pendingTask，依然是 dirty

        // 统一 resolve 合并的所有 Promises
        for (const resolve of currentTask.resolvers) {
          resolve();
        }
      } else {
        // 物理写盘失败：保留 isDirty = true，绝对不推进 lastCheckpointAt！
        this.isDirty = true;

        // 统一 reject 对应的 Promises
        for (const reject of currentTask.rejecters) {
          reject(lastError);
        }
      }
    }

    this.isProcessing = false;
  }
}
