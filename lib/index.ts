// Core exports
export { AIServiceError, classifyError, isRetryable } from './errors';
export type { AIErrorCode } from './errors';

export { ServiceRegistry, registry } from './registry';
export { 
  BaseServiceExecutor,
  TextServiceExecutor,
  VisionServiceExecutor,
  ImageServiceExecutor,
  VideoServiceExecutor,
  AudioServiceExecutor,
} from './executor';
export type { ExecutorConfig, ImageInput, VideoInput, AudioInput } from './executor';

export { now, timestamp, log, logError, logRequest } from './date';
export type { RequestLogInfo } from './date';

export { validateApiKey, isPublicRoute } from './auth';
export type { AuthResult } from './auth';

// Type exports
export type {
  ChatMessage,
  VisionMessage,
  ServiceCategory,
  BaseService,
  AIService,
  TextService,
  VisionService,
  ImageService,
  VideoService,
  AudioService,
  EmbeddingService,
  ImageOptions,
  ImageResult,
  VideoOptions,
  VideoResult,
  AudioOptions,
  AudioResult,
} from './types';
