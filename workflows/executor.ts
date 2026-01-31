import type {
  WorkflowDefinition,
  WorkflowStatus,
  WorkflowJob,
  WorkflowEvent,
  WorkflowContext,
  WorkflowConfig,
  StepStatus,
  StepInputMap,
  WorkflowStepConfig,
} from './types';
import { defaultWorkflowConfig } from './types';
import { streamToString } from './transformers';
import { getStateManager, type WorkflowStateManager } from './state';
import { registry } from '../lib/registry';
import {
  TextServiceExecutor,
  VisionServiceExecutor,
  ImageServiceExecutor,
  VideoServiceExecutor,
  AudioServiceExecutor,
} from '../lib/executor';
import { AIServiceError } from '../lib/errors';
import { log, logError } from '../lib/date';

/**
 * Executes workflows with concurrency control and event emission.
 */
export class WorkflowExecutor {
  private config: WorkflowConfig;
  private state: WorkflowStateManager;
  private queue: WorkflowJob[] = [];
  private running = new Map<string, Promise<void>>();
  private executorConfig = { maxRetries: 3, baseDelayMs: 500, maxDelayMs: 5000 };

  constructor(config: Partial<WorkflowConfig> = {}) {
    this.config = { ...defaultWorkflowConfig, ...config };
    this.state = getStateManager(this.config);
  }

  /**
   * Submit a workflow for execution.
   * Returns immediately with workflow ID.
   */
  async submit(definition: WorkflowDefinition, input: unknown): Promise<string> {
    const id = crypto.randomUUID();
    const now = Date.now();

    const job: WorkflowJob = {
      id,
      definition,
      input,
      createdAt: now,
    };

    // Initialize step statuses
    const steps: StepStatus[] = definition.steps.map((step, index) => ({
      index,
      name: step.name,
      category: step.category,
      status: 'pending',
    }));

    const status: WorkflowStatus = {
      id,
      name: definition.name,
      status: 'pending',
      currentStep: 0,
      totalSteps: definition.steps.length,
      steps,
      input,
      createdAt: now,
      updatedAt: now,
    };

    await this.state.create(status);

    // Check if we can run immediately or need to queue
    if (this.running.size < this.config.maxConcurrent) {
      this.startExecution(job);
      await this.emitEvent(id, 'workflow:started', {
        name: definition.name,
        totalSteps: definition.steps.length,
      });
    } else {
      this.queue.push(job);
      await this.state.update(id, { status: 'queued' });
      await this.emitEvent(id, 'workflow:queued', {
        name: definition.name,
        position: this.queue.length,
      });
    }

    return id;
  }

  /**
   * Get workflow status by ID.
   */
  async getStatus(id: string): Promise<WorkflowStatus | null> {
    return this.state.get(id);
  }

  /**
   * List all workflows with optional filters.
   */
  async listWorkflows(options?: { status?: string; limit?: number }): Promise<WorkflowStatus[]> {
    return this.state.list(options);
  }

  /**
   * Subscribe to workflow events.
   */
  subscribe(workflowId: string, callback: (event: WorkflowEvent) => void): () => void {
    return this.state.subscribe(workflowId, callback);
  }

  /**
   * Get current queue size.
   */
  getQueueSize(): number {
    return this.queue.length;
  }

  /**
   * Get number of running workflows.
   */
  getRunningCount(): number {
    return this.running.size;
  }

  private startExecution(job: WorkflowJob): void {
    const promise = this.executeWorkflow(job)
      .catch(err => {
        logError(`[Workflow] Error de ejecución para ${job.id}:`, err);
      })
      .finally(() => {
        this.running.delete(job.id);
        this.processQueue();
      });

    this.running.set(job.id, promise);
  }

  private processQueue(): void {
    while (this.queue.length > 0 && this.running.size < this.config.maxConcurrent) {
      const job = this.queue.shift()!;
      this.startExecution(job);
      
      // Emit started event
      this.emitEvent(job.id, 'workflow:started', {
        name: job.definition.name,
        totalSteps: job.definition.steps.length,
      }).catch(err => logError(`[Workflow] Error al emitir evento started:`, err));
    }
  }

  private async executeWorkflow(job: WorkflowJob): Promise<void> {
    const { id, definition, input } = job;
    const startTime = Date.now();

    await this.state.update(id, { status: 'running' });

    // Create workflow context
    const results = new Map<number, unknown>();
    const resultsByName = new Map<string, unknown>();

    const context: WorkflowContext = {
      workflowId: id,
      workflowName: definition.name,
      input,
      results,
      resultsByName,
      currentStep: 0,
      previousResult: <T>() => {
        if (context.currentStep === 0) return undefined;
        return results.get(context.currentStep - 1) as T;
      },
      getResult: <T>(index: number) => results.get(index) as T,
      getResultByName: <T>(name: string) => resultsByName.get(name) as T,
    };

    // Setup total timeout
    const timeoutMs = definition.timeoutMs ?? this.config.totalTimeoutMs;
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Workflow tiempo de espera agotado después de ${timeoutMs}ms`));
      }, timeoutMs);
    });

    try {
      await Promise.race([
        this.executeSteps(job, context),
        timeoutPromise,
      ]);

      const finalResult = results.get(definition.steps.length - 1);
      const durationMs = Date.now() - startTime;

      await this.state.update(id, {
        status: 'completed',
        result: finalResult,
        completedAt: Date.now(),
      });

      await this.emitEvent(id, 'workflow:complete', {
        result: finalResult,
        durationMs,
      });

      log(`[Workflow] ${definition.name} (${id}) completado en ${durationMs}ms`);
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      const durationMs = Date.now() - startTime;

      await this.state.update(id, {
        status: 'failed',
        error: {
          message: error.message,
          code: err instanceof AIServiceError ? err.code : undefined,
          step: context.currentStep,
        },
        completedAt: Date.now(),
      });

      await this.emitEvent(id, 'workflow:failed', {
        error: {
          message: error.message,
          code: err instanceof AIServiceError ? err.code : undefined,
          step: context.currentStep,
        },
        durationMs,
      });

      logError(`[Workflow] ${definition.name} (${id}) falló en el paso ${context.currentStep}:`, error);
    }
  }

  private async executeSteps(job: WorkflowJob, context: WorkflowContext): Promise<void> {
    const { id, definition } = job;

    for (let i = 0; i < definition.steps.length; i++) {
      context.currentStep = i;
      const stepConfig = definition.steps[i]!;
      const stepTimeoutMs = stepConfig.timeoutMs ?? 
        definition.defaultStepTimeoutMs ?? 
        this.config.stepTimeoutMs;

      // Check skip condition
      if (stepConfig.skipIf) {
        const shouldSkip = await stepConfig.skipIf(context);
        if (shouldSkip) {
          await this.updateStepStatus(id, i, { status: 'skipped' });
          await this.emitEvent(id, 'step:skipped', {
            step: i,
            name: stepConfig.name,
            category: stepConfig.category,
            reason: 'skipIf condition returned true',
          });
          continue;
        }
      }

      // Update status to running
      await this.state.update(id, { currentStep: i });
      await this.updateStepStatus(id, i, { status: 'running', startedAt: Date.now() });
      await this.emitEvent(id, 'step:started', {
        step: i,
        name: stepConfig.name,
        category: stepConfig.category,
        totalSteps: definition.steps.length,
      });

      try {
        // Execute step with timeout
        const stepPromise = this.executeStep(stepConfig, context);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Paso "${stepConfig.name}" tiempo agotado después de ${stepTimeoutMs}ms`));
          }, stepTimeoutMs);
        });

        const { result, service } = await Promise.race([stepPromise, timeoutPromise]);
        const completedAt = Date.now();

        // Store result
        context.results.set(i, result);
        context.resultsByName.set(stepConfig.name, result);

        // Update step status
        const stepStatus = await this.state.get(id);
        const startedAt = stepStatus?.steps[i]?.startedAt ?? completedAt;

        await this.updateStepStatus(id, i, {
          status: 'completed',
          service,
          result,
          completedAt,
          durationMs: completedAt - startedAt,
        });

        await this.emitEvent(id, 'step:complete', {
          step: i,
          name: stepConfig.name,
          category: stepConfig.category,
          service,
          result,
          durationMs: completedAt - startedAt,
        });

        log(`[Workflow] ${definition.name} paso ${i + 1}/${definition.steps.length} (${stepConfig.name}) completado vía ${service}`);
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));

        await this.updateStepStatus(id, i, {
          status: 'failed',
          error: {
            message: error.message,
            code: err instanceof AIServiceError ? err.code : undefined,
            service: err instanceof AIServiceError ? err.serviceName : undefined,
          },
          completedAt: Date.now(),
        });

        await this.emitEvent(id, 'step:failed', {
          step: i,
          name: stepConfig.name,
          category: stepConfig.category,
          error: {
            message: error.message,
            code: err instanceof AIServiceError ? err.code : undefined,
          },
        });

        throw err; // Re-throw to fail the workflow
      }
    }
  }

  private async executeStep(
    stepConfig: WorkflowStepConfig,
    context: WorkflowContext
  ): Promise<{ result: unknown; service: string }> {
    // Resolve input
    const input = typeof stepConfig.input === 'function'
      ? await stepConfig.input(context.input, context)
      : stepConfig.input;

    // Execute based on category
    switch (stepConfig.category) {
      case 'text': {
        const executor = new TextServiceExecutor(
          registry.getAll('text'),
          this.executorConfig
        );
        const { result: stream, service } = await executor.execute(
          (input as StepInputMap['text']).messages
        );
        const text = await streamToString(stream);
        return { result: text, service };
      }

      case 'vision': {
        const executor = new VisionServiceExecutor(
          registry.getAll('vision'),
          this.executorConfig
        );
        const { result: stream, service } = await executor.execute(
          (input as StepInputMap['vision']).messages
        );
        const text = await streamToString(stream);
        return { result: text, service };
      }

      case 'image': {
        const executor = new ImageServiceExecutor(
          registry.getAll('image'),
          this.executorConfig
        );
        const imageInput = input as StepInputMap['image'];
        const { result, service } = await executor.execute({
          prompt: imageInput.prompt,
          options: imageInput.options,
        });
        return { result, service };
      }

      case 'video': {
        const executor = new VideoServiceExecutor(
          registry.getAll('video'),
          this.executorConfig
        );
        const videoInput = input as StepInputMap['video'];
        const { result, service } = await executor.execute({
          prompt: videoInput.prompt,
          options: videoInput.options,
        });
        return { result, service };
      }

      case 'audio': {
        const executor = new AudioServiceExecutor(
          registry.getAll('audio'),
          this.executorConfig
        );
        const audioInput = input as StepInputMap['audio'];
        const { result, service } = await executor.execute({
          input: audioInput.input,
          options: audioInput.options,
        });
        return { result, service };
      }

      default:
        throw new Error(`Categoría de paso no soportada: ${stepConfig.category}`);
    }
  }

  private async updateStepStatus(
    workflowId: string,
    stepIndex: number,
    updates: Partial<StepStatus>
  ): Promise<void> {
    const status = await this.state.get(workflowId);
    if (status && status.steps[stepIndex]) {
      status.steps[stepIndex] = { ...status.steps[stepIndex], ...updates };
      await this.state.update(workflowId, { steps: status.steps });
    }
  }

  private async emitEvent(
    workflowId: string,
    type: WorkflowEvent['type'],
    data: WorkflowEvent['data']
  ): Promise<void> {
    await this.state.emit({
      type,
      workflowId,
      timestamp: Date.now(),
      data,
    });
  }
}

// Singleton instance
let executor: WorkflowExecutor | null = null;

/**
 * Get or create the workflow executor singleton.
 */
export function getWorkflowExecutor(config?: Partial<WorkflowConfig>): WorkflowExecutor {
  if (!executor) {
    executor = new WorkflowExecutor(config);
  }
  return executor;
}

/**
 * Reset the executor (for testing).
 */
export function resetWorkflowExecutor(): void {
  executor = null;
}
