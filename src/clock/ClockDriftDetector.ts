import { ClockSource } from './ClockSource';

/**
 * 时钟异常检测类型
 * - NORMAL: 正常时间流逝
 * - SUSPEND: 系统挂起/休眠（间隔 > 90 秒）
 * - CLOCK_BACKWARD: 墙上时间负向突变（时钟回拨）
 * - JUMP_FORWARD: 墙上时间正向突变（调快系统时间，但单调时间无大幅突变）
 */
export type ClockDriftType = 'NORMAL' | 'SUSPEND' | 'CLOCK_BACKWARD' | 'JUMP_FORWARD';

/**
 * 时钟漂移/异常检测报告
 */
export interface ClockDriftReport {
  type: ClockDriftType;
  /** 墙上时间增量 (毫秒) */
  deltaWallMs: number;
  /** 单调时间增量 (毫秒) */
  deltaMonoMs: number;
  /** 发生突变前最后确认的可信墙上时间 (Epoch ms) */
  lastTrustworthyWallTime: number;
  /** 当前最新的墙上时间 (Epoch ms) */
  currentWallTime: number;
}

export type SuspendCallback = (report: ClockDriftReport) => void;
export type ClockBackwardCallback = (report: ClockDriftReport) => void;
export type JumpForwardCallback = (report: ClockDriftReport) => void;

export class ClockDriftDetector {
  private clockSource: ClockSource;
  private lastCheckWallTime: number;
  private lastCheckMonoTime: number;

  /** 休眠/挂起检测阈值：90 秒 */
  public static readonly SUSPEND_THRESHOLD_MS = 90000;
  /** 墙上时间正向突变阈值：3 分钟 (180 秒) */
  public static readonly JUMP_FORWARD_WALL_THRESHOLD_MS = 180000;
  /** 正向突变时单调时间的允许上限：5 秒 */
  public static readonly JUMP_FORWARD_MONO_MAX_MS = 5000;

  private suspendListeners: Set<SuspendCallback> = new Set();
  private clockBackwardListeners: Set<ClockBackwardCallback> = new Set();
  private jumpForwardListeners: Set<JumpForwardCallback> = new Set();

  constructor(clockSource: ClockSource) {
    this.clockSource = clockSource;
    this.lastCheckWallTime = this.clockSource.now();
    this.lastCheckMonoTime = this.clockSource.monotonic();
  }

  /**
   * 注册休眠/挂起事件回调
   */
  public onSuspend(callback: SuspendCallback): () => void {
    this.suspendListeners.add(callback);
    return () => this.suspendListeners.delete(callback);
  }

  /**
   * 注册时钟回拨（负跳变）事件回调
   */
  public onClockBackward(callback: ClockBackwardCallback): () => void {
    this.clockBackwardListeners.add(callback);
    return () => this.clockBackwardListeners.delete(callback);
  }

  /**
   * 注册墙上时间正向突变事件回调
   */
  public onJumpForward(callback: JumpForwardCallback): () => void {
    this.jumpForwardListeners.add(callback);
    return () => this.jumpForwardListeners.delete(callback);
  }

  /**
   * 手动重置上次检查的时间点
   */
  public reset(
    wallTime: number = this.clockSource.now(),
    monoTime: number = this.clockSource.monotonic()
  ): void {
    this.lastCheckWallTime = wallTime;
    this.lastCheckMonoTime = monoTime;
  }

  /**
   * 获取最近一次可信的墙上时间戳
   */
  public getLastTrustworthyWallTime(): number {
    return this.lastCheckWallTime;
  }

  /**
   * 执行时钟检查，判断是否有休眠、回拨或正向突变
   * 必须在定时健康检查 (Check) 或每次 Tick / 心跳处理时调用
   */
  public checkClockDrift(): ClockDriftReport {
    const currentWall = this.clockSource.now();
    const currentMono = this.clockSource.monotonic();

    const deltaWallMs = currentWall - this.lastCheckWallTime;
    const deltaMonoMs = currentMono - this.lastCheckMonoTime;
    const lastTrustworthyWallTime = this.lastCheckWallTime;

    let type: ClockDriftType = 'NORMAL';

    // 1. 负向跳变 / 时钟回拨判定
    if (deltaWallMs < 0) {
      type = 'CLOCK_BACKWARD';
    }
    // 2. 挂起 / 休眠判定 (> 90 秒)
    else if (
      deltaWallMs > ClockDriftDetector.SUSPEND_THRESHOLD_MS &&
      deltaMonoMs > ClockDriftDetector.SUSPEND_THRESHOLD_MS
    ) {
      type = 'SUSPEND';
    }
    // 3. 墙上时间正向突变判定 (墙上时间与单调时间的偏差 > 180s 且 deltaWallMs > 0)
    else if (
      deltaWallMs > 0 &&
      deltaWallMs - deltaMonoMs > ClockDriftDetector.JUMP_FORWARD_WALL_THRESHOLD_MS
    ) {
      type = 'JUMP_FORWARD';
    }

    const report: ClockDriftReport = {
      type,
      deltaWallMs,
      deltaMonoMs,
      lastTrustworthyWallTime,
      currentWallTime: currentWall,
    };

    // 触发对应回调
    if (type === 'CLOCK_BACKWARD') {
      this.clockBackwardListeners.forEach((cb) => cb(report));
    } else if (type === 'SUSPEND') {
      this.suspendListeners.forEach((cb) => cb(report));
    } else if (type === 'JUMP_FORWARD') {
      this.jumpForwardListeners.forEach((cb) => cb(report));
    }

    // 更新基准时间戳
    this.lastCheckWallTime = currentWall;
    this.lastCheckMonoTime = currentMono;

    return report;
  }
}
