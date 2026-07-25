import { formatLocalDate } from '../domain/validation';

/**
 * 统一时间源抽象接口
 * 确保纯领域层与服务层不直接依赖原生 Date.now() 或 performance.now()
 */
export interface ClockSource {
  /**
   * 获取当前墙上时间（Wall Clock Time），表示为 Unix 纪元毫秒数
   */
  now(): number;

  /**
   * 获取单调递增高精度时间（Monotonic Time），单位毫秒
   * 用于精确计算时间差，不受系统改时、NTP 校时影响
   */
  monotonic(): number;

  /**
   * 获取当前 ISO 8601 时间戳字符串 (UTC)
   */
  toISOString(): string;

  /**
   * 根据当前时间推算本地自然日字符串 (格式: YYYY-MM-DD)
   */
  getLocalDateString(): string;
}

/**
 * 生产环境时间源实现
 */
export class SystemClockSource implements ClockSource {
  public now(): number {
    return Date.now();
  }

  public monotonic(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  public toISOString(): string {
    return new Date(this.now()).toISOString();
  }

  public getLocalDateString(): string {
    return formatLocalDate(this.now());
  }
}

/**
 * 测试环境可控模拟时钟 (FakeClock)
 * 能够精确模拟时间快进、休眠挂起、墙上时间倒退（回拨）与突发跳变
 */
export class FakeClock implements ClockSource {
  private wallTimeMs: number;
  private monotonicMs: number;

  constructor(initialWallTimeMs: number = Date.parse('2026-07-22T10:00:00.000Z')) {
    this.wallTimeMs = initialWallTimeMs;
    this.monotonicMs = 1000.0;
  }

  public now(): number {
    return this.wallTimeMs;
  }

  public monotonic(): number {
    return this.monotonicMs;
  }

  public toISOString(): string {
    return new Date(this.wallTimeMs).toISOString();
  }

  public getLocalDateString(): string {
    return formatLocalDate(this.wallTimeMs);
  }

  /**
   * 正常时间流逝：同步推进墙上时间与单调时间
   * @param ms 流逝的毫秒数 (必须 >= 0)
   */
  public advance(ms: number): void {
    if (ms < 0) {
      throw new Error('advance() 参数必须大于等于 0，倒退时间请使用 rewindWallTime() 或 setWallTime()');
    }
    this.wallTimeMs += ms;
    this.monotonicMs += ms;
  }

  /**
   * 模拟系统休眠/挂起：时间突变跨越指定毫秒数（单调时间与墙上时间均向前推进）
   * @param sleepMs 休眠时长（毫秒）
   */
  public simulateSleep(sleepMs: number): void {
    this.advance(sleepMs);
  }

  /**
   * 强行修改墙上时间（用于模拟手动调整系统墙上时钟，单调时间 monotonic 保持不变）
   * @param newWallTimeMs 新的 Unix 纪元毫秒数
   */
  public setWallTime(newWallTimeMs: number): void {
    this.wallTimeMs = newWallTimeMs;
  }

  /**
   * 墙上时间倒退（回拨）（单调时间 monotonic 保持不变）
   * @param ms 倒退毫秒数
   */
  public rewindWallTime(ms: number): void {
    this.wallTimeMs -= ms;
  }
}
