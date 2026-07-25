/**
 * 领域命令定义
 */
export interface DomainCommand<T = void> {
  id: string;
  type: string;
  /** 命令入队时的上下文版本号 */
  generation: number;
  /** 命令的具体执行逻辑 */
  execute: () => Promise<T>;
}

interface QueuedItem<T = any> {
  command: DomainCommand<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason?: any) => void;
}

/**
 * 异步串行 FIFO 领域命令队列
 * - 确保业务状态变更的强顺序性
 * - 具备 contextGeneration 防腐作废机制
 * - 具备任务级别的异常隔离机制
 */
export class DomainCommandQueue {
  private queue: QueuedItem[] = [];
  private isProcessing = false;
  private currentGeneration = 0;

  /**
   * 获取当前上下文版本号
   */
  public getGeneration(): number {
    return this.currentGeneration;
  }

  /**
   * 递增上下文版本号（在崩溃恢复、重置、时钟回拨时作废所有积压的旧命令）
   */
  public incrementGeneration(): void {
    this.currentGeneration++;
  }

  /**
   * 提交命令入队
   * @param type 命令类型名称
   * @param execute 异步执行回调
   * @param customId 可选的自定义唯一 ID，若省略则自动生成
   */
  public enqueue<T>(type: string, execute: () => Promise<T>, customId?: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = customId || `${type}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const command: DomainCommand<T> = {
        id,
        type,
        generation: this.currentGeneration,
        execute,
      };

      this.queue.push({ command, resolve, reject });
      this.processNext();
    });
  }

  /**
   * 消费并执行下一个命令
   */
  private async processNext(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;
    const task = this.queue.shift()!;

    // 1. 上下文版本校验 (Stale Command Drop)
    if (task.command.generation !== this.currentGeneration) {
      task.reject(
        new Error(
          `Command canceled: stale context generation (${task.command.generation} < current ${this.currentGeneration}).`
        )
      );
      this.isProcessing = false;
      this.processNext();
      return;
    }

    // 2. 执行任务与异常隔离
    try {
      const result = await task.command.execute();
      task.resolve(result);
    } catch (error) {
      // 错误隔离：拒绝当前 Task 的 Promise，不崩溃队列，也不阻断下一个任务的消费
      task.reject(error);
    } finally {
      this.isProcessing = false;
      // 继续消费下一个任务
      this.processNext();
    }
  }

  /**
   * 获取队列中当前等待处理的任务总数
   */
  public getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * 查询队列当前是否正在执行任务
   */
  public isProcessingState(): boolean {
    return this.isProcessing;
  }

  /**
   * 清空积压的所有未执行任务（可选辅助操作）
   */
  public clearPendingTasks(reason = 'Queue cleared'): void {
    const pending = [...this.queue];
    this.queue = [];
    for (const item of pending) {
      item.reject(new Error(reason));
    }
  }
}
