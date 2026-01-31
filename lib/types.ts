export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

/** Supported service categories - extend as needed */
export type ServiceCategory = 'text' | 'image' | 'video' | 'audio' | 'vision' | 'embedding';

/** Base interface for all AI services */
export interface BaseService {
  name: string;
  category: ServiceCategory;
}

/** Text generation service (chat/completion) */
export interface TextService extends BaseService {
  category: 'text';
  chat: (messages: ChatMessage[]) => Promise<AsyncIterable<string>>;
}

/** Vision analysis service (image understanding) */
export interface VisionService extends BaseService {
  category: 'vision';
  analyze: (messages: VisionMessage[]) => Promise<AsyncIterable<string>>;
}

export interface VisionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | Array<{ type: 'text' | 'image_url'; text?: string; image_url?: { url: string } }>;
}

/** Image generation service */
export interface ImageService extends BaseService {
  category: 'image';
  generate: (prompt: string, options?: ImageOptions) => Promise<ImageResult>;
}

export interface ImageOptions {
  width?: number;
  height?: number;
  style?: string;
  n?: number;
  // Pollinations-specific options (optional)
  /** AI model to use (e.g., 'klein-large', 'flux', 'turbo', 'gptimage') */
  model?: string;
  /** Random seed for reproducible results (-1 for random) */
  seed?: number;
  /** Let AI improve your prompt for better results */
  enhance?: boolean;
  /** What to avoid in the generated image */
  negative_prompt?: string;
  /** Enable safety content filters */
  safe?: boolean;
  /** Image quality level (gptimage only) */
  quality?: 'low' | 'medium' | 'high' | 'hd';
  /** Reference image URL(s) for image-to-image generation */
  sourceImages?: string | string[];
}

export interface ImageResult {
  urls: string[];
  revised_prompt?: string;
  /** Metadata for each generated image (when using n > 1) */
  metadata?: Array<{
    seed?: number;
    prompt?: string;
    model?: string;
    reasoning?: string;
  }>;
}

/** Video generation service */
export interface VideoService extends BaseService {
  category: 'video';
  generate: (prompt: string, options?: VideoOptions) => Promise<VideoResult>;
}

export interface VideoOptions {
  duration?: number;
  fps?: number;
  resolution?: string;
}

export interface VideoResult {
  url: string;
  duration: number;
}

/** Audio generation service (TTS, music) */
export interface AudioService extends BaseService {
  category: 'audio';
  generate: (input: string, options?: AudioOptions) => Promise<AudioResult>;
}

export interface AudioOptions {
  voice?: string;
  speed?: number;
  format?: 'mp3' | 'wav' | 'opus';
}

export interface AudioResult {
  url: string;
  duration: number;
}

/** Embedding service */
export interface EmbeddingService extends BaseService {
  category: 'embedding';
  embed: (input: string | string[]) => Promise<number[][]>;
}

/** Union of all service types */
export type AIService = TextService | VisionService | ImageService | VideoService | AudioService | EmbeddingService;

/** Legacy alias for backward compatibility */
export type ChatService = TextService;