import { CapabilityAssessment, ICapabilitiesDetector, RuntimeMode } from '../domain/capabilities';
import { DomainCommandQueue } from './DomainCommandQueue';

export type AppStatus =
  | 'UNINITIALIZED'
  | 'INITIALIZING'
  | 'RUNNING'
  | 'DEGRADED'
  | 'FATAL_ERROR'
  | 'STOPPED';

export type BootStep =
  | 'CAPABILITIES_DETECTION'
  | 'LOAD_SNAPSHOT'
  | 'SCHEMA_MIGRATION'
  | 'CRASH_RECOVERY'
  | 'INIT_ADAPTER'
  | 'START_SERVICES'
  | 'RENDER_UI';

export interface BootStepResult {
  step: BootStep;
  success: boolean;
  message?: string;
}

export interface AppDependencies {
  capabilitiesDetector: ICapabilitiesDetector;
  loadSnapshot?: () => Promise<void>;
  runMigration?: () => Promise<void>;
  performCrashRecovery?: () => Promise<void>;
  initPhotoshopAdapter?: () => Promise<void>;
  startServicesAndReadActiveDoc?: () => Promise<void>;
  renderUI?: (status: AppStatus, assessment?: CapabilityAssessment) => Promise<void>;
  commandQueue?: DomainCommandQueue;
}

export class AppController {
  private status: AppStatus = 'UNINITIALIZED';
  private mode: RuntimeMode = 'UNAVAILABLE';
  private assessment: CapabilityAssessment | null = null;
  private readonly commandQueue: DomainCommandQueue;
  private readonly dependencies: AppDependencies;
  private completedSteps: BootStepResult[] = [];

  constructor(dependencies: AppDependencies) {
    this.dependencies = dependencies;
    this.commandQueue = dependencies.commandQueue || new DomainCommandQueue();
  }

  public getStatus(): AppStatus {
    return this.status;
  }

  public getMode(): RuntimeMode {
    return this.mode;
  }

  public getAssessment(): CapabilityAssessment | null {
    return this.assessment;
  }

  public getCommandQueue(): DomainCommandQueue {
    return this.commandQueue;
  }

  public getCompletedSteps(): ReadonlyArray<BootStepResult> {
    return [...this.completedSteps];
  }

  /**
   * 插件 7 步 Boot 引导主流程
   */
  public async boot(): Promise<{ success: boolean; status: AppStatus; mode: RuntimeMode }> {
    if (this.status !== 'UNINITIALIZED' && this.status !== 'STOPPED') {
      throw new Error(`Cannot boot AppController when status is ${this.status}`);
    }

    this.status = 'INITIALIZING';
    this.completedSteps = [];

    try {
      // 1. 能力探测 (Capabilities Detection)
      const assessment = await this.dependencies.capabilitiesDetector.detect();
      this.assessment = assessment;
      this.mode = assessment.mode;

      this.completedSteps.push({
        step: 'CAPABILITIES_DETECTION',
        success: true,
        message: `Mode evaluated as ${assessment.mode}`,
      });

      // 若评级为 UNAVAILABLE，直接终止后置步骤，切入 FATAL_ERROR
      if (assessment.mode === 'UNAVAILABLE') {
        this.status = 'FATAL_ERROR';
        await this.safeRenderUI();
        return { success: false, status: this.status, mode: this.mode };
      }

      // 2. 恢复快照 (Load Snapshot)
      if (this.dependencies.loadSnapshot) {
        await this.dependencies.loadSnapshot();
      }
      this.completedSteps.push({ step: 'LOAD_SNAPSHOT', success: true });

      // 3. 数据迁移 (Schema Migration)
      if (this.dependencies.runMigration) {
        await this.dependencies.runMigration();
      }
      this.completedSteps.push({ step: 'SCHEMA_MIGRATION', success: true });

      // 4. 崩溃恢复 (Crash Recovery)
      if (this.dependencies.performCrashRecovery) {
        await this.dependencies.performCrashRecovery();
      }
      this.completedSteps.push({ step: 'CRASH_RECOVERY', success: true });

      // 5. 初始化 Adapter (Init Photoshop Adapter)
      if (this.dependencies.initPhotoshopAdapter) {
        await this.dependencies.initPhotoshopAdapter();
      }
      this.completedSteps.push({ step: 'INIT_ADAPTER', success: true });

      // 6. 启动服务 & 读取活动文档 (Start Services & Active Document)
      if (this.dependencies.startServicesAndReadActiveDoc) {
        await this.dependencies.startServicesAndReadActiveDoc();
      }
      this.completedSteps.push({ step: 'START_SERVICES', success: true });

      // 确定最终状态
      this.status = this.mode === 'DEGRADED' ? 'DEGRADED' : 'RUNNING';

      // 7. 渲染 UI (Render UI)
      await this.safeRenderUI();
      this.completedSteps.push({ step: 'RENDER_UI', success: true });

      return { success: true, status: this.status, mode: this.mode };
    } catch (error: any) {
      this.status = 'FATAL_ERROR';
      this.completedSteps.push({
        step: this.getCurrentFailedStep(),
        success: false,
        message: error?.message || String(error),
      });

      await this.safeRenderUI();
      return { success: false, status: this.status, mode: this.mode };
    }
  }

  /**
   * 停止插件服务并清理资源
   */
  public async stop(): Promise<void> {
    this.status = 'STOPPED';
    this.commandQueue.clearPendingTasks('AppController stopped');
  }

  private getCurrentFailedStep(): BootStep {
    const executed = this.completedSteps.map((s) => s.step);
    const allSteps: BootStep[] = [
      'CAPABILITIES_DETECTION',
      'LOAD_SNAPSHOT',
      'SCHEMA_MIGRATION',
      'CRASH_RECOVERY',
      'INIT_ADAPTER',
      'START_SERVICES',
      'RENDER_UI',
    ];
    for (const step of allSteps) {
      if (!executed.includes(step)) {
        return step;
      }
    }
    return 'RENDER_UI';
  }

  private async safeRenderUI(): Promise<void> {
    if (this.dependencies.renderUI) {
      try {
        await this.dependencies.renderUI(this.status, this.assessment || undefined);
      } catch (uiErr) {
        console.error('Failed to render UI during boot pipeline:', uiErr);
      }
    }
  }
}
