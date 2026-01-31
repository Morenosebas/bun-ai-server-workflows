/**
 * Pollinations.ai Provider Types
 * @see https://gen.pollinations.ai - API Documentation
 */

/** Configuration for the Pollinations provider */
export interface PollinationsConfig {
  /** Base URL for the Pollinations API */
  baseUrl: string;
  /** API key for authentication (optional - Pollinations has free tier) */
  apiKey?: string;
  /** Request timeout in milliseconds (default: 60000 for high-quality images) */
  timeout: number;
}

/** Image generation parameters for Pollinations API */
export interface PollinationsImageParams {
  /** AI model to use (default: klein-large) */
  model?: string;
  /** Image width in pixels */
  width?: number;
  /** Image height in pixels */
  height?: number;
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
  image?: string;
}

/** Available image models in Pollinations */
export type PollinationsImageModel =
  | 'klein-large'      // FLUX.2 Klein 9B - Higher quality (default)
  | 'flux'             // FLUX - Standard quality
  | 'turbo'            // Fast generation
  | 'gptimage'         // GPT-based image generation
  | 'gptimage-large'   // GPT-based large
  | 'kontext'          // Kontext model
  | 'seedream'         // Seedream model
  | 'seedream-pro'     // Seedream Pro
  | 'nanobanana'       // Nanobanana
  | 'nanobanana-pro'   // Nanobanana Pro
  | 'zimage';          // Z-Image

/** Text generation parameters for Pollinations API (OpenAI-compatible) */
export interface PollinationsTextParams {
  /** AI model to use (default: gemini-flash) */
  model?: PollinationsTextModel;
  /** Controls creativity (0.0=strict, 2.0=creative) */
  temperature?: number;
  /** Maximum tokens to generate */
  max_tokens?: number;
  /** Random seed for reproducible results */
  seed?: number;
  /** System prompt to set context/behavior */
  system?: string;
  /** Return response in JSON format */
  json_mode?: boolean;
}

/** Available text models in Pollinations */
export type PollinationsTextModel =
  | 'gemini-fast'     // Google Gemini Flash (default)
  | 'gemini'           // Google Gemini
  | 'gemini-large'     // Google Gemini Large
  | 'gemini-search'    // Gemini with Google Search
  | 'openai'           // OpenAI GPT
  | 'openai-large'     // OpenAI GPT Large
  | 'claude'           // Anthropic Claude
  | 'claude-large'     // Anthropic Claude Large
  | 'mistral'          // Mistral AI
  | 'llama'            // Meta LLaMA
  | 'deepseek'         // DeepSeek
  | 'qwen';            // Alibaba Qwen

/** Default configuration values */
export const POLLINATIONS_DEFAULTS = {
  baseUrl: 'https://gen.pollinations.ai',
  timeout: 60_000, // 60 seconds - fail faster on unavailable models
  model: 'klein-large' as const,
  textModel: 'gemini-fast' as const,
  width: 1024,
  height: 1024,
} as const;
