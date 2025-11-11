import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
// Overlay removed - not needed for bot generation

export interface WorkflowStep {
  step: number;
  func: string;
  transitions: Record<string, string>;
  timeout: number;
  on_timeout_event: string;
}

export interface WorkflowConfig {
  workflow_meta: {
    title: string;
    description: string;
    start_step: string;
  };
  steps_config: Record<string, WorkflowStep>;
}

export interface WorkflowContext {
  [key: string]: any;
}

export type StepFunction = (ctx: WorkflowContext) => AsyncGenerator<string, void, unknown>;

export interface BotProgressEvent {
  type: 'step_start' | 'step_complete' | 'transition' | 'error' | 'info' | 'job_stat';
  timestamp: number;
  step?: string;
  stepNumber?: number;
  funcName?: string;
  transition?: string;
  message?: string;
  data?: any;
}

export class WorkflowEngine {
  private config: WorkflowConfig;
  private stepFunctions: Map<string, StepFunction> = new Map();
  private currentStep: string;
  private context: WorkflowContext = {};
  private botId: string;
  private eventsFilePath: string;

  constructor(configPath: string) {
    const configContent = fs.readFileSync(configPath, 'utf8');
    this.config = yaml.load(configContent) as WorkflowConfig;
    this.currentStep = this.config.workflow_meta.start_step;

    // Generate unique bot ID
    this.botId = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.eventsFilePath = ''; // Not used anymore, keeping for compatibility

    // Emit initial event
    this.emitProgress({
      type: 'info',
      timestamp: Date.now(),
      message: `Bot initialized: ${this.config.workflow_meta.title}`,
      data: { botId: this.botId }
    });
  }

  private emitProgress(event: BotProgressEvent): void {
    // Disabled - too verbose
  }

  getBotId(): string {
    return this.botId;
  }

  registerStepFunction(stepName: string, func: StepFunction): void {
    this.stepFunctions.set(stepName, func);
  }

  setContext(key: string, value: any): void {
    this.context[key] = value;
  }

  getContext(): WorkflowContext {
    return this.context;
  }

  async executeStep(stepName: string): Promise<string> {
    const stepConfig = this.config.steps_config[stepName];
    if (!stepConfig) {
      throw new Error(`Step '${stepName}' not found in configuration`);
    }

    const stepFunction = this.stepFunctions.get(stepConfig.func);
    if (!stepFunction) {
      throw new Error(`Function '${stepConfig.func}' not registered`);
    }

    try {
      const generator = stepFunction(this.context);
      const timeoutPromise = new Promise<string>((resolve) => {
        setTimeout(() => resolve(stepConfig.on_timeout_event), stepConfig.timeout * 1000);
      });

      const result = await Promise.race([
        this.executeGenerator(generator),
        timeoutPromise
      ]);

      // Overlay code removed - not needed for bot generation flow

      return result;
    } catch (error) {
      console.error(`[Workflow] Error in step '${stepName}':`, error);
      throw error;
    }
  }

  private async executeGenerator(generator: AsyncGenerator<string, void, unknown>): Promise<string> {
    const result = await generator.next();
    return result.value || 'unknown';
  }

  async run(): Promise<void> {
    console.log(`🤖 ${this.config.workflow_meta.title}`);

    let currentStepName = this.currentStep;
    const maxSteps = 1200; // Prevent infinite loops - limit workflow steps
    let stepCount = 0;

    while (currentStepName !== 'done' && stepCount < maxSteps) {
      stepCount++;

      const event = await this.executeStep(currentStepName);
      const stepConfig = this.config.steps_config[currentStepName];

      if (stepConfig.transitions[event]) {
        currentStepName = stepConfig.transitions[event];
      } else {
        console.warn(`❌ No transition found for event '${event}' in step '${currentStepName}'`);
        break;
      }

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (stepCount >= maxSteps) {
      console.warn('❌ Maximum step count reached, stopping workflow');
    }

    console.log('✅ Workflow completed');

    // Emit workflow completion event
    this.emitProgress({
      type: 'info',
      timestamp: Date.now(),
      message: 'Workflow completed successfully',
      data: { totalSteps: stepCount }
    });
  }
}