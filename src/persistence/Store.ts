import { AppSnapshot } from '../domain/types';
import { validateAppSnapshot } from '../domain/validation';

/**
 * 写入/落盘校验失败异常
 */
export class FlushValidationError extends Error {
  constructor(message: string, public readonly errors?: string[]) {
    super(message);
    this.name = 'FlushValidationError';
  }
}

/**
 * 快照致命损坏异常（主备双坏或主坏且无备份）
 */
export class FatalStoreCorruptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FatalStoreCorruptError';
  }
}

/**
 * Schema 迁移异常
 */
export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * 底层物理文件存储抽象接口 (FileStore)
 */
export interface FileStore {
  readText(filename: string): Promise<string | null>;
  writeText(filename: string, content: string): Promise<void>;
  exists(filename: string): Promise<boolean>;
  copy(sourceFilename: string, targetFilename: string): Promise<void>;
  rename(sourceFilename: string, targetFilename: string): Promise<void>;
  delete(filename: string): Promise<void>;
}

/**
 * 内存/Mock FileStore 实现，供单测或虚拟存储使用
 */
export class InMemoryFileStore implements FileStore {
  private files: Map<string, string> = new Map();

  public async readText(filename: string): Promise<string | null> {
    return this.files.has(filename) ? this.files.get(filename)! : null;
  }

  public async writeText(filename: string, content: string): Promise<void> {
    this.files.set(filename, content);
  }

  public async exists(filename: string): Promise<boolean> {
    return this.files.has(filename);
  }

  public async copy(sourceFilename: string, targetFilename: string): Promise<void> {
    const content = this.files.get(sourceFilename);
    if (content === undefined) {
      throw new Error(`Source file ${sourceFilename} does not exist for copy.`);
    }
    this.files.set(targetFilename, content);
  }

  public async rename(sourceFilename: string, targetFilename: string): Promise<void> {
    const content = this.files.get(sourceFilename);
    if (content === undefined) {
      throw new Error(`Source file ${sourceFilename} does not exist for rename.`);
    }
    this.files.set(targetFilename, content);
    this.files.delete(sourceFilename);
  }

  public async delete(filename: string): Promise<void> {
    this.files.delete(filename);
  }

  /**
   * 测试辅助：清空所有文件
   */
  public clear(): void {
    this.files.clear();
  }
}

/**
 * 业务持久化存储接口 (Store)
 */
export interface Store {
  load(): Promise<AppSnapshot>;
  save(snapshot: AppSnapshot): Promise<void>;
  validate(snapshot: unknown): snapshot is AppSnapshot;
  getSnapshotPathInfo(): { main: string; backup: string; temp: string };
  subscribe(listener: () => void): () => void;
}

/**
 * 辅助函数：创建全新的默认 AppSnapshot 结构
 */
export function createInitialAppSnapshot(nowIso?: string): AppSnapshot {
  const now = nowIso || new Date().toISOString();
  return {
    schemaVersion: 1,
    snapshotId: 'snap_' + Math.random().toString(36).substring(2, 10),
    writtenAt: now,
    lastCheckpointAt: now,
    lastFlushCompletedAt: now,
    nextUntitledSequence: 1,
    settings: {
      idleThresholdMs: 30000,
      freezeThresholdMs: 60000,
      showSummary: true,
      summaryMode: 'today',
      autoAssociate: true,
      retentionMode: 'forever',
    },
    projects: {},
    fileRecords: {},
    sessionRecords: {},
    activeRuntimeSession: null,
    mergeOperationStack: [],
  };
}

/**
 * Schema 迁移处理器
 */
export class SchemaMigration {
  public static readonly CURRENT_SCHEMA_VERSION = 1;

  /**
   * 对未经校验的原始快照数据进行版本迁移
   */
  public migrate(rawSnapshot: any): AppSnapshot {
    if (!rawSnapshot || typeof rawSnapshot !== 'object') {
      throw new MigrationError('Raw snapshot content is not an object.');
    }

    const version = typeof rawSnapshot.schemaVersion === 'number' ? rawSnapshot.schemaVersion : 1;

    if (version > SchemaMigration.CURRENT_SCHEMA_VERSION) {
      throw new MigrationError(
        `Unsupported schema version ${version}. Current system version is ${SchemaMigration.CURRENT_SCHEMA_VERSION}.`
      );
    }

    let current = JSON.parse(JSON.stringify(rawSnapshot));

    // 目前系统版本为 1，如以后升级至 v2，在此按序链式执行:
    // if (version < 2) { current = this.migrateV1ToV2(current); }

    const valResult = validateAppSnapshot(current as AppSnapshot);
    if (!valResult.valid) {
      throw new MigrationError(`Migrated snapshot validation failed: ${valResult.errors.join('; ')}`);
    }

    return current as AppSnapshot;
  }
}

/**
 * DiskStore 实现 - 三阶段落盘、主备双文件容错退避
 */
export class DiskStore implements Store {
  public readonly mainFilename: string;
  public readonly backupFilename: string;
  public readonly tempFilename: string;
  private readonly listeners: Set<() => void> = new Set();

  constructor(
    private readonly fileStore: FileStore,
    mainFilename: string = 'usage-data.json',
    backupFilename: string = 'usage-data.backup.json',
    tempFilename: string = 'usage-data.tmp.json'
  ) {
    this.mainFilename = mainFilename;
    this.backupFilename = backupFilename;
    this.tempFilename = tempFilename;
  }

  public subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  public getSnapshotPathInfo(): { main: string; backup: string; temp: string } {
    return {
      main: this.mainFilename,
      backup: this.backupFilename,
      temp: this.tempFilename,
    };
  }

  /**
   * 强类型 Type Guard 校验 AppSnapshot
   */
  public validate(snapshot: unknown): snapshot is AppSnapshot {
    if (!snapshot || typeof snapshot !== 'object') {
      return false;
    }
    const result = validateAppSnapshot(snapshot as AppSnapshot);
    return result.valid;
  }

  /**
   * 三阶段原子落盘写文件
   * 阶段 1: 写入 temp 文件
   * 阶段 2: 读取 temp 文件并执行 validate
   * 阶段 3: 备份现有的 main 文件到 backup，再原子替换 main 文件
   */
  public async save(snapshot: AppSnapshot): Promise<void> {
    // 0. 入参初步校验
    const inputVal = validateAppSnapshot(snapshot);
    if (!inputVal.valid) {
      throw new FlushValidationError(`Input snapshot is invalid: ${inputVal.errors.join('; ')}`, inputVal.errors);
    }

    const content = JSON.stringify(snapshot, null, 2);

    // 1. 写入临时文件 .tmp
    await this.fileStore.writeText(this.tempFilename, content);

    // 2. 重新读取 .tmp 文件并进行 validate 校验
    const tempContent = await this.fileStore.readText(this.tempFilename);
    if (!tempContent) {
      throw new FlushValidationError('Temp file read back returned empty content.');
    }

    let parsedTemp: unknown;
    try {
      parsedTemp = JSON.parse(tempContent);
    } catch (e: any) {
      throw new FlushValidationError(`Temp file JSON parse error: ${e?.message || e}`);
    }

    const tempVal = validateAppSnapshot(parsedTemp as AppSnapshot);
    if (!tempVal.valid) {
      throw new FlushValidationError(`Temp snapshot schema validation failed: ${tempVal.errors.join('; ')}`, tempVal.errors);
    }

    // 3. 校验通过，备份现有的主快照到 .backup
    const mainExists = await this.fileStore.exists(this.mainFilename);
    if (mainExists) {
      await this.fileStore.copy(this.mainFilename, this.backupFilename);
    }

    // 4. 原子替换 / 重命名 .tmp -> main
    await this.fileStore.rename(this.tempFilename, this.mainFilename);

    // 5. 通知订阅者快照已更新
    for (const listener of Array.from(this.listeners)) {
      try {
        listener();
      } catch {
        // 隔离订阅者异常
      }
    }
  }

  /**
   * 启动载入快照与退避容错逻辑
   */
  public async load(): Promise<AppSnapshot> {
    const mainExists = await this.fileStore.exists(this.mainFilename);
    const backupExists = await this.fileStore.exists(this.backupFilename);

    // 1. 若主文件与备份文件均不存在 -> 完全首次安装
    if (!mainExists && !backupExists) {
      const initialSnapshot = createInitialAppSnapshot();
      await this.save(initialSnapshot);
      return initialSnapshot;
    }

    // 2. 尝试读取主快照文件
    if (mainExists) {
      try {
        const mainContent = await this.fileStore.readText(this.mainFilename);
        if (mainContent) {
          const parsed = JSON.parse(mainContent);
          const valRes = validateAppSnapshot(parsed);
          if (valRes.valid) {
            return parsed as AppSnapshot;
          }
        }
      } catch {
        // 主文件读取或解析失败，降级处理
      }

      // 主文件存在但解析/校验失败：备份现场留存
      try {
        const corruptFilename = `usage-data.corrupt.${Date.now()}.json`;
        await this.fileStore.rename(this.mainFilename, corruptFilename);
      } catch {
        // 留存现场若失败不阻断继续读取备份
      }
    }

    // 3. 尝试读取备份快照文件
    if (backupExists) {
      try {
        const backupContent = await this.fileStore.readText(this.backupFilename);
        if (backupContent) {
          const parsedBackup = JSON.parse(backupContent);
          const valRes = validateAppSnapshot(parsedBackup);
          if (valRes.valid) {
            // 从备份文件恢复
            const recoveredSnapshot = parsedBackup as AppSnapshot;
            // 写入更新回主文件
            await this.save(recoveredSnapshot);
            return recoveredSnapshot;
          }
        }
      } catch {
        // 备份读取或解析失败
      }
    }

    // 4. 主文件与备份文件均损坏或不可用！绝对不用默认空快照覆盖，抛出致命异常
    throw new FatalStoreCorruptError(
      'Both main snapshot and backup snapshot are damaged or invalid! Process halted to prevent data loss.'
    );
  }
}
