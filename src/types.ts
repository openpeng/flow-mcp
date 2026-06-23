export interface ParamDef {
  type: string;
  required: boolean;
  default?: string;
  description?: string;
  pattern?: string;
}

export type ParamsDef = Record<string, ParamDef>;

export interface ConditionDef {
  natural?: string;
  check?: string;
  help?: string;
}

export type Condition = string | ConditionDef;

export interface RequiredOutputDef {
  type?: string;
  min_length?: number;
  pattern?: string;
  help?: string;
}

export type RequiredOutput = string | RequiredOutputDef;

export interface WorkflowStep {
  id: string;
  name: string;
  checkpoint?: {
    required_outputs?: RequiredOutput[] | Record<string, RequiredOutputDef>;
    conditions?: Condition[];
  };
  next: string | null | Record<string, string>;
}

export interface TokenBudget {
  total: number;
  per_step?: number;
}

export interface WorkflowTemplate {
  name: string;
  description: string;
  params: string[] | ParamsDef;
  steps: WorkflowStep[];
  token_budget?: TokenBudget;
}

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped';
export type WorkflowStatus = 'active' | 'completed';

export interface StepInstance {
  status: StepStatus;
  started_at?: string;
  completed_at?: string;
  outputs?: Record<string, unknown>;
  confirmed_conditions?: string[];
}

export interface WorkflowInstance {
  id: string;
  template: string;
  params: Record<string, string>;
  status: WorkflowStatus;
  current_step: string;
  created_at: string;
  updated_at: string;
  steps: Record<string, StepInstance>;
  prompt_overrides: Record<string, string>;
  alias?: string;
  token_usage?: {
    total_consumed: number;
    per_step: Record<string, number>;
  };
}

export interface OflowConfig {
  homeDir: string;
  flowsDir: string;
  dataDir: string;
}

export interface TemplateSummary {
  name: string;
  description: string;
  step_count: number;
  path: string;
  invalid?: boolean;
  error?: string;
}

export interface ListInstancesResult {
  instances: WorkflowInstance[];
  warnings: string[];
}

export interface CheckpointValidationError {
  kind: 'required_output' | 'type' | 'min_length' | 'pattern' | 'condition' | 'check' | 'expression';
  field?: string;
  message: string;
  help?: string;
}

export interface CheckpointValidationResult {
  ok: boolean;
  errors: CheckpointValidationError[];
}

export interface AdvanceOptions {
  condition_result?: string;
  confirmed_conditions?: string[];
  token_consumed?: number;
}

export interface WorkflowCurrentResult {
  instance: WorkflowInstance;
  step: WorkflowStep;
  prompt: string;
}

export interface WorkflowAdvanceResult {
  completed: boolean;
  instance: WorkflowInstance;
  next_step?: WorkflowStep;
  next_prompt?: string;
}

export interface CreateTemplateOptions {
  name: string;
  description: string;
  params: ParamsDef;
  steps: WorkflowStep[];
  prompts: Record<string, string>;
  token_budget?: TokenBudget;
  overwrite?: boolean;
}
