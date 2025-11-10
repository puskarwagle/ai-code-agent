/**
 * Bot-related type definitions
 */

export interface BotFiles {
  yaml: string;
  typescript: string;
  botName: string;
}

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

export interface StepExecutionResult {
  success: boolean;
  event?: string;
  error?: string;
  screenshot?: Buffer;
  page_state?: {
    title: string;
    url: string;
    html: string;
  };
}

export interface BotGenerationContext {
  intent: string;
  url: string;
  generated_steps: GeneratedStepInfo[];
  current_step: number;
}

export interface GeneratedStepInfo {
  step_number: number;
  yaml: string;
  typescript: string;
  execution_result?: StepExecutionResult;
  action_description: string;
}
