import type {
  ChatMessage,
  VisionMessage,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  AudioOptions,
  AudioResult,
  ServiceCategory,
} from '../lib/types';

// ============ Workflow Status ============

export type WorkflowStatusType = 'pending' | 'queued' | 'running' | 'completed' | 'failed';

export interface WorkflowStatus {
  id: string;
  name: string;
  status: WorkflowStatusType;
  currentStep: number;
  totalSteps: number;
  steps: StepStatus[];
  input: unknown;
  result?: unknown;
  error?: WorkflowError;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface StepStatus {
  index: number;
  name: string;
  category: ServiceCategory;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  service?: string;
  result?: unknown;
  error?: WorkflowError;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
}

export interface WorkflowError {
  message: string;
  code?: string;
  step?: number;
  service?: string;
}

// ============ Step Definitions ============

/** Input types for each service category */
export type StepInputMap = {
  text: { messages: ChatMessage[] };
  vision: { messages: VisionMessage[] };
  image: { prompt: string; options?: ImageOptions };
  video: { prompt: string; options?: VideoOptions };
  audio: { input: string; options?: AudioOptions };
  embedding: { input: string | string[] };
};

/** Output types for each service category */
export type StepOutputMap = {
  text: string; // Accumulated from stream
  vision: string; // Accumulated from stream
  image: ImageResult;
  video: VideoResult;
  audio: AudioResult;
  embedding: number[][];
};

/** Transformer function between steps */
export type StepTransformer<TIn, TOut> = (input: TIn, context: WorkflowContext) => TOut | Promise<TOut>;

/** Configuration for a single workflow step */
export interface WorkflowStepConfig<
  TCategory extends ServiceCategory = ServiceCategory,
  TIn = unknown,
> {
  name: string;
  category: TCategory;
  /** Static input or function to compute input from previous result */
  input: StepInputMap[TCategory] | StepTransformer<TIn, StepInputMap[TCategory]>;
  /** Optional timeout override for this step (ms) */
  timeoutMs?: number;
  /** Skip this step if condition returns false */
  skipIf?: (context: WorkflowContext) => boolean | Promise<boolean>;
}

/** Runtime context passed to transformers */
export interface WorkflowContext {
  workflowId: string;
  workflowName: string;
  /** Original workflow input */
  input: unknown;
  /** Results from all completed steps (by index) */
  results: Map<number, unknown>;
  /** Results from all completed steps (by name) */
  resultsByName: Map<string, unknown>;
  /** Current step index */
  currentStep: number;
  /** Get result from previous step */
  previousResult: <T = unknown>() => T | undefined;
  /** Get result from specific step by index */
  getResult: <T = unknown>(index: number) => T | undefined;
  /** Get result from specific step by name */
  getResultByName: <T = unknown>(name: string) => T | undefined;
}

// ============ Workflow Definition ============

export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: WorkflowStepConfig[];
  /** Global timeout for entire workflow (ms) */
  timeoutMs?: number;
  /** Default step timeout (ms) */
  defaultStepTimeoutMs?: number;
}

// ============ SSE Events ============

export type WorkflowEventType =
  | 'workflow:queued'
  | 'workflow:started'
  | 'workflow:complete'
  | 'workflow:failed'
  | 'step:started'
  | 'step:complete'
  | 'step:failed'
  | 'step:skipped';

export interface WorkflowEvent {
  type: WorkflowEventType;
  workflowId: string;
  timestamp: number;
  data: WorkflowEventData;
}

export type WorkflowEventData =
  | WorkflowQueuedData
  | WorkflowStartedData
  | WorkflowCompleteData
  | WorkflowFailedData
  | StepStartedData
  | StepCompleteData
  | StepFailedData
  | StepSkippedData;

export interface WorkflowQueuedData {
  name: string;
  position: number;
}

export interface WorkflowStartedData {
  name: string;
  totalSteps: number;
}

export interface WorkflowCompleteData {
  result: unknown;
  durationMs: number;
}

export interface WorkflowFailedData {
  error: WorkflowError;
  durationMs: number;
}

export interface StepStartedData {
  step: number;
  name: string;
  category: ServiceCategory;
  totalSteps: number;
}

export interface StepCompleteData {
  step: number;
  name: string;
  category: ServiceCategory;
  service: string;
  result: unknown;
  durationMs: number;
}

export interface StepFailedData {
  step: number;
  name: string;
  category: ServiceCategory;
  error: WorkflowError;
}

export interface StepSkippedData {
  step: number;
  name: string;
  category: ServiceCategory;
  reason: string;
}

// ============ Workflow Job (internal) ============

export interface WorkflowJob {
  id: string;
  definition: WorkflowDefinition;
  input: unknown;
  createdAt: number;
}

// ============ Config ============

export interface WorkflowConfig {
  maxConcurrent: number;
  stepTimeoutMs: number;
  totalTimeoutMs: number;
  resultTtlSeconds: number;
  redisUrl?: string;
}

export const defaultWorkflowConfig: WorkflowConfig = {
  maxConcurrent: Number(process.env.WORKFLOW_MAX_CONCURRENT) || 5,
  stepTimeoutMs: Number(process.env.WORKFLOW_STEP_TIMEOUT_MS) || 120000, // 2 min for img2img
  totalTimeoutMs: Number(process.env.WORKFLOW_TOTAL_TIMEOUT_MS) || 300000,
  resultTtlSeconds: Number(process.env.WORKFLOW_RESULT_TTL_SECONDS) || 604800, // 1 week
  redisUrl: process.env.REDIS_URL,
};

// ============ Multi-Image Creative Director Types ============

export interface MultiImageInput {
  input_images: Array<{
    id: number;
    data: string; // URL or Base64
    is_main?: boolean;
  }>;
  user_intent: string;
  /** Number of perspective variations to generate (1-3, default: 1) */
  perspectivas?: number;
}

export interface ImageAnalysis {
  id: number;
  is_main: boolean;
  description: string;
}

export interface GenerationConfig {
  reasoning: string;
  positive_prompt: string;
  negative_prompt: string;
  denoising_strength: number;
}

/** Configuration for a single perspective variation */
export interface PerspectiveConfig {
  perspective_id: number;
  reasoning: string;
  positive_prompt: string;
  negative_prompt: string;
  denoising_strength: number;
}

/** Result from the creative director workflow with metadata per perspective */
export interface CreativeDirectorResult {
  perspectives: Array<{
    url: string;
    prompt: string;
    reasoning: string;
    seed?: number;
    model?: string;
  }>;
}
