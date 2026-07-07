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

export interface EvidenceDef {
  key: string;
  required?: boolean;
  description?: string;
}

export interface ApprovalDef {
  key: string;
  required?: boolean;
  description?: string;
}

export interface CheckpointDef {
  required_outputs?: RequiredOutput[] | Record<string, RequiredOutputDef>;
  optional_outputs?: Record<string, RequiredOutputDef>;
  evidence?: EvidenceDef[];
  approvals?: ApprovalDef[];
  conditions?: Condition[];
}

export interface WorkflowStep {
  id: string;
  name: string;
  checkpoint?: CheckpointDef;
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
  /** Phase 8: 模板路由元数据 — AI 自动发现和匹配模板 */
  routing?: TemplateRouting;
}

/** Phase 8: 模板路由元数据 */
export interface TemplateRouting {
  /** 触发关键词 */
  keywords: string[];
  /** 单行简短描述（~30字，用于路由表紧凑展示） */
  description_short: string;
  /** 正则触发模式（可选） */
  triggers?: string[];
  /** 优先级（数值越大越优先） */
  priority: number;
}

/** Phase 8: 模板路由匹配结果 */
export interface TemplateRouteMatch {
  template: string;
  description: string;
  description_short: string;
  score: number;
  keywords_matched: string[];
  priority: number;
  step_count?: number;
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
  version: number;
  steps: Record<string, StepInstance>;
  prompt_overrides: Record<string, string>;
  template_snapshot: WorkflowTemplate;
  prompt_snapshots: Record<string, string>;
  alias?: string;
  token_usage?: {
    total_consumed: number;
    per_step: Record<string, number>;
  };
}

export type WorkflowEventType =
  | 'workflow.started'
  | 'step.started'
  | 'step.completed'
  | 'step.validation_failed'
  | 'workflow.completed'
  | 'prompt.overridden'
  | 'alias.bound'
  | 'instance.conflict_detected';

export interface WorkflowEvent {
  id: string;
  instance_id: string;
  type: WorkflowEventType;
  step_id?: string;
  timestamp: string;
  payload?: unknown;
}

export interface ToolErrorEnvelope {
  code: string;
  message: string;
  details?: unknown;
}

export type ToolEnvelope<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: ToolErrorEnvelope };

export interface OflowConfig {
  homeDir: string;
  flowsDir: string;
  dataDir: string;
}

export interface TemplateSummary {
  name: string;
  description: string;
  description_short?: string;
  step_count: number;
  path: string;
  invalid?: boolean;
  error?: string;
  /** Phase 8: 路由关键词（用于 AI 意图匹配） */
  keywords?: string[];
  priority?: number;
}

export interface ListInstancesResult {
  instances: WorkflowInstance[];
  warnings: string[];
}

export interface CheckpointValidationError {
  kind: 'required_output' | 'type' | 'min_length' | 'pattern' | 'condition' | 'check' | 'expression' | 'evidence' | 'approval';
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
  evidence?: Record<string, unknown>;
  approvals?: Record<string, unknown>;
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

export interface WorkflowEventsQuery {
  type?: WorkflowEventType;
  step_id?: string;
  limit?: number;
  since?: string;
  until?: string;
  only_failures?: boolean;
  include_payload?: boolean;
  summary?: boolean;
}

export type CheckpointReadiness = 'ready' | 'blocked' | 'warning';

export interface CheckpointInspectionResult {
  completed: string[];
  missing_required: string[];
  optional_missing: string[];
  missing_evidence: string[];
  missing_approvals: string[];
  can_advance: boolean;
  readiness: CheckpointReadiness;
  blocking_reasons: string[];
  suggestions: string[];
}

export type InboxPriority = 'low' | 'medium' | 'high' | 'blocking';

export interface InboxEntry {
  id: string;
  instance_id: string;
  source: 'manual' | 'git' | 'ci' | 'review' | 'tapd' | 'other';
  type: 'comment' | 'failure' | 'approval' | 'blocker' | 'info' | 'dependency';
  title: string;
  summary: string;
  action_required: boolean;
  status: 'new' | 'seen' | 'acted';
  timestamp: string;
  priority?: InboxPriority;
  step_id?: string;
  external_id?: string;
  url?: string;
  dedup_key?: string;
  dedup_strategy?: 'external_id' | 'fallback';
}

export type InboxStatus = InboxEntry['status'];

export interface InboxSummary {
  total: number;
  unread: number;
  action_required: number;
  blocking: number;
  high: number;
  by_status: Record<InboxStatus, number>;
  by_priority: Record<InboxPriority, number>;
  latest_timestamp?: string;
}

export type SuggestedActionRisk = 'low' | 'medium' | 'high' | 'blocking';

export interface SuggestedAction {
  action_type: string;
  title: string;
  reason: string;
  tool_hint?: string;
  risk: SuggestedActionRisk;
}

export interface DashboardProgress {
  total_steps: number;
  completed_steps: number;
  current_index: number;
  percent: number;
}

export interface DashboardRisk {
  level: SuggestedActionRisk;
  checkpoint_blocked: boolean;
  validation_failures: number;
  inbox_blocking: number;
  inbox_high: number;
}

export interface WorkflowDashboardResult {
  instance: {
    id: string;
    template: string;
    status: WorkflowStatus;
    current_step: string;
    version: number;
  };
  current_step: {
    id: string;
    name: string;
    checkpoint?: CheckpointDef;
  };
  progress: DashboardProgress;
  risk: DashboardRisk;
  prompt?: string;
  outputs: CheckpointInspectionResult;
  checkpoint: {
    readiness: CheckpointReadiness;
    can_advance: boolean;
    blocking_reasons: string[];
  };
  recent_events?: WorkflowEvent[];
  inbox?: InboxSummary & { entries?: InboxEntry[] };
  suggested_actions: SuggestedAction[];
  warnings: string[];
}

export type WorklogMode = 'summary' | 'full' | 'handoff' | 'release_note';

export interface WorkflowWorklogResult {
  markdown: string;
  summary: {
    completed_steps: number;
    failed_validations: number;
    latest_step: string;
  };
  path?: string;
}

export type ValidationIssueSeverity = 'error' | 'warning';

export interface ValidationIssue {
  code: string;
  message: string;
  step_id?: string;
  severity?: ValidationIssueSeverity;
  suggestion?: string;
}

export interface TemplateValidationResult {
  valid: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}
