import type { ServiceCategory } from '../lib/types';
import type {
  WorkflowDefinition,
  WorkflowStepConfig,
  StepInputMap,
  StepTransformer,
  WorkflowContext,
} from './types';
import {
  inputToChatMessages,
  inputToImageInput,
  previousTextToImageInput,
  previousImageToVisionInput,
  previousTextToAudioInput,
} from './transformers';

/**
 * Fluent builder for creating workflow definitions.
 * 
 * @example
 * ```typescript
 * const workflow = new WorkflowBuilder('image-description')
 *   .description('Generate an image and describe it')
 *   .step('image', {
 *     name: 'generate',
 *     input: (input) => ({ prompt: input as string }),
 *   })
 *   .step('vision', {
 *     name: 'describe',
 *     input: previousImageToVisionInput('Describe this image'),
 *   })
 *   .build();
 * ```
 */
export class WorkflowBuilder {
  private definition: WorkflowDefinition;

  constructor(name: string) {
    this.definition = {
      name,
      steps: [],
    };
  }

  /**
   * Set workflow description.
   */
  description(desc: string): this {
    this.definition.description = desc;
    return this;
  }

  /**
   * Set global timeout for the entire workflow.
   */
  timeout(ms: number): this {
    this.definition.timeoutMs = ms;
    return this;
  }

  /**
   * Set default timeout for each step.
   */
  defaultStepTimeout(ms: number): this {
    this.definition.defaultStepTimeoutMs = ms;
    return this;
  }

  /**
   * Add a step to the workflow.
   */
  step<TCategory extends ServiceCategory>(
    category: TCategory,
    config: Omit<WorkflowStepConfig<TCategory>, 'category'>
  ): this {
    this.definition.steps.push({
      ...config,
      category,
    } as WorkflowStepConfig);
    return this;
  }

  /**
   * Add a text generation step.
   */
  text(
    name: string,
    input: StepInputMap['text'] | StepTransformer<unknown, StepInputMap['text']>,
    options?: Partial<Omit<WorkflowStepConfig<'text'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.step('text', { name, input, ...options });
  }

  /**
   * Add a text step that uses the workflow input directly.
   * Automatically converts string input to chat messages.
   */
  textFromInput(
    name: string = 'text',
    options?: Partial<Omit<WorkflowStepConfig<'text'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.text(name, inputToChatMessages, options);
  }

  /**
   * Add a vision analysis step.
   */
  vision(
    name: string,
    input: StepInputMap['vision'] | StepTransformer<unknown, StepInputMap['vision']>,
    options?: Partial<Omit<WorkflowStepConfig<'vision'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.step('vision', { name, input, ...options });
  }

  /**
   * Add a vision step that analyzes the previous image step result.
   */
  visionFromPreviousImage(
    name: string = 'analyze',
    prompt: string = 'Describe this image in detail.',
    options?: Partial<Omit<WorkflowStepConfig<'vision'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.vision(name, previousImageToVisionInput(prompt), options);
  }

  /**
   * Add an image generation step.
   */
  image(
    name: string,
    input: StepInputMap['image'] | StepTransformer<unknown, StepInputMap['image']>,
    options?: Partial<Omit<WorkflowStepConfig<'image'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.step('image', { name, input, ...options });
  }

  /**
   * Add an image step that uses the workflow input as prompt.
   */
  imageFromInput(
    name: string = 'generate',
    options?: Partial<Omit<WorkflowStepConfig<'image'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.image(name, inputToImageInput, options);
  }

  /**
   * Add an image step that uses the previous text step result as prompt.
   */
  imageFromPreviousText(
    name: string = 'generate',
    options?: Partial<Omit<WorkflowStepConfig<'image'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.image(name, previousTextToImageInput, options);
  }

  /**
   * Add a video generation step.
   */
  video(
    name: string,
    input: StepInputMap['video'] | StepTransformer<unknown, StepInputMap['video']>,
    options?: Partial<Omit<WorkflowStepConfig<'video'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.step('video', { name, input, ...options });
  }

  /**
   * Add an audio generation step.
   */
  audio(
    name: string,
    input: StepInputMap['audio'] | StepTransformer<unknown, StepInputMap['audio']>,
    options?: Partial<Omit<WorkflowStepConfig<'audio'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.step('audio', { name, input, ...options });
  }

  /**
   * Add an audio step that uses the previous text/vision step result.
   */
  audioFromPreviousText(
    name: string = 'speak',
    options?: Partial<Omit<WorkflowStepConfig<'audio'>, 'name' | 'category' | 'input'>>
  ): this {
    return this.audio(name, previousTextToAudioInput, options);
  }

  /**
   * Build and return the workflow definition.
   */
  build(): WorkflowDefinition {
    if (this.definition.steps.length === 0) {
      throw new Error(`Workflow "${this.definition.name}" must have at least one step`);
    }
    return { ...this.definition };
  }
}

/**
 * Creates a new workflow builder.
 * 
 * @example
 * ```typescript
 * const workflow = createWorkflow('my-workflow')
 *   .textFromInput('prompt')
 *   .imageFromPreviousText('generate')
 *   .visionFromPreviousImage('describe')
 *   .build();
 * ```
 */
export function createWorkflow(name: string): WorkflowBuilder {
  return new WorkflowBuilder(name);
}
