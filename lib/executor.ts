import type { 
  TextService, 
  VisionService,
  ImageService, 
  VideoService, 
  AudioService,
  ChatMessage,
  VisionMessage,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  AudioOptions,
  AudioResult,
  BaseService 
} from './types';
import { AIServiceError, classifyError, isRetryable } from './errors';
import { log, logError } from './date';

export interface ExecutorConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
}

const defaultConfig: ExecutorConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

/** 
 * Base executor with retry/fallback logic.
 * Extend this class and implement `executeService` for each service category.
 */
export abstract class BaseServiceExecutor<TService extends BaseService, TInput, TOutput> {
  protected services: TService[];
  protected currentIndex = 0;
  protected config: ExecutorConfig;
  protected abstract categoryName: string;

  constructor(services: TService[], config: Partial<ExecutorConfig> = {}) {
    if (services.length === 0) {
      throw new AIServiceError(
        `${this.constructor.name} requiere al menos un servicio`,
        'config',
        'INVALID_REQUEST'
      );
    }
    this.services = services;
    this.config = { ...defaultConfig, ...config };
  }

  protected getNextService(): TService {
    const service = this.services[this.currentIndex]!;
    this.currentIndex = (this.currentIndex + 1) % this.services.length;
    return service;
  }

  protected delay(attempt: number): Promise<void> {
    const ms = Math.min(
      this.config.baseDelayMs * Math.pow(2, attempt),
      this.config.maxDelayMs
    );
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Implement the actual service call for each category */
  protected abstract executeService(service: TService, input: TInput): Promise<TOutput>;

  async execute(input: TInput): Promise<{ result: TOutput; service: string }> {
    const errors: AIServiceError[] = [];
    const attemptedServices = new Set<string>();

    for (let attempt = 0; attempt < this.config.maxRetries; attempt++) {
      const service = this.getNextService();
      
      if (attemptedServices.has(service.name) && attemptedServices.size < this.services.length) {
        continue;
      }
      attemptedServices.add(service.name);

      try {
        log(`[${this.categoryName}] Intento ${attempt + 1}: Usando ${service.name}`);
        const result = await this.executeService(service, input);
        return { result, service: service.name };
      } catch (err) {
        const classifiedError = classifyError(err, service.name);
        errors.push(classifiedError);
        
        logError(`[${this.categoryName}] ${service.name} falló:`, classifiedError.toJSON());

        if (!isRetryable(classifiedError.code)) {
          log(`[${this.categoryName}] Error no reintentable (${classifiedError.code}), fallando inmediatamente`);
          throw classifiedError;
        }

        if (attempt < this.config.maxRetries - 1) {
          log(`[${this.categoryName}] Reintentando (intento ${attempt + 1}/${this.config.maxRetries})`);
          await this.delay(attempt);
        } else {
          log(`[${this.categoryName}] Todos los ${this.config.maxRetries} intentos agotados`);
        }
      }
    }

    throw new AIServiceError(
      `Todos los servicios de ${this.categoryName} fallaron después de ${this.config.maxRetries} intentos`,
      errors.map(e => e.serviceName).join(', '),
      'SERVICE_ERROR',
      errors
    );
  }
}

// ============ Concrete Implementations ============

export class TextServiceExecutor extends BaseServiceExecutor<
  TextService, 
  ChatMessage[], 
  AsyncIterable<string>
> {
  protected categoryName = 'text';

  protected async executeService(service: TextService, messages: ChatMessage[]) {
    return service.chat(messages);
  }
}

export class VisionServiceExecutor extends BaseServiceExecutor<
  VisionService,
  VisionMessage[],
  AsyncIterable<string>
> {
  protected categoryName = 'vision';

  protected async executeService(service: VisionService, messages: VisionMessage[]) {
    return service.analyze(messages);
  }
}

export interface ImageInput {
  prompt: string;
  options?: ImageOptions;
}

export class ImageServiceExecutor extends BaseServiceExecutor<
  ImageService,
  ImageInput,
  ImageResult
> {
  protected categoryName = 'image';

  protected async executeService(service: ImageService, input: ImageInput) {
    return service.generate(input.prompt, input.options);
  }
}

export interface VideoInput {
  prompt: string;
  options?: VideoOptions;
}

export class VideoServiceExecutor extends BaseServiceExecutor<
  VideoService,
  VideoInput,
  VideoResult
> {
  protected categoryName = 'video';

  protected async executeService(service: VideoService, input: VideoInput) {
    return service.generate(input.prompt, input.options);
  }
}

export interface AudioInput {
  input: string;
  options?: AudioOptions;
}

export class AudioServiceExecutor extends BaseServiceExecutor<
  AudioService,
  AudioInput,
  AudioResult
> {
  protected categoryName = 'audio';

  protected async executeService(service: AudioService, input: AudioInput) {
    return service.generate(input.input, input.options);
  }
}
