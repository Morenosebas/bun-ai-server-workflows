/**
 * Pollinations Image Service
 * Text-to-image and image-to-image generation using Pollinations.ai
 * Supports generating multiple images in parallel via n option
 */

import type { ImageService, ImageOptions, ImageResult } from '../../lib/types';
import {
  pollinationsProvider,
  type PollinationsImageParams,
  POLLINATIONS_DEFAULTS,
} from '../../provider/pollinations';
import type { PerspectiveConfig } from '../../workflows/types';

/** Extended options that may include perspective configs from workflow */
interface ExtendedImageOptions extends ImageOptions {
  _perspectiveConfigs?: PerspectiveConfig[];
}

/**
 * Convert generic ImageOptions to Pollinations-specific params
 */
function mapOptionsToParams(options?: ImageOptions): PollinationsImageParams {
  if (!options) return {};

  const params: PollinationsImageParams = {};

  // Standard options
  if (options.width !== undefined) params.width = options.width;
  if (options.height !== undefined) params.height = options.height;

  // Pollinations-specific options
  if (options.model !== undefined) params.model = options.model;
  if (options.seed !== undefined) params.seed = options.seed;
  if (options.enhance !== undefined) params.enhance = options.enhance;
  if (options.negative_prompt !== undefined) params.negative_prompt = options.negative_prompt;
  if (options.safe !== undefined) params.safe = options.safe;
  if (options.quality !== undefined) params.quality = options.quality;

  // Handle sourceImages for image-to-image
  if (options.sourceImages !== undefined) {
    params.image = Array.isArray(options.sourceImages)
      ? options.sourceImages.join('|')
      : options.sourceImages;
  }

  return params;
}

/**
 * Generate a random seed for image generation
 */
function generateSeed(): number {
  return Math.floor(Math.random() * 1000000);
}

/**
 * Pollinations Image Service
 * 
 * Features:
 * - Text-to-image generation
 * - Image-to-image transformation (via sourceImages)
 * - Multiple image generation (via n option) with parallel execution
 * - Multiple models: klein-large (default), flux, turbo, gptimage, etc.
 * - Returns public URLs directly (no storage needed)
 * 
 * @example
 * // Text-to-image
 * await pollinationsImageService.generate('a cat in space', { width: 1024, height: 1024 });
 * 
 * @example
 * // Image-to-image
 * await pollinationsImageService.generate('make it cyberpunk style', {
 *   sourceImages: 'https://example.com/original.jpg'
 * });
 * 
 * @example
 * // Multiple variations
 * await pollinationsImageService.generate('a sunset over mountains', { n: 3 });
 */
export const pollinationsImageService: ImageService = {
  name: 'Pollinations',
  category: 'image',

  async generate(prompt: string, options?: ImageOptions): Promise<ImageResult> {
    const extendedOptions = options as ExtendedImageOptions | undefined;
    const perspectiveConfigs = extendedOptions?._perspectiveConfigs;
    const count = Math.min(3, Math.max(1, options?.n ?? 1));
    
    const params = mapOptionsToParams(options);
    
    // Set default model if not specified
    if (!params.model) {
      params.model = POLLINATIONS_DEFAULTS.model;
    }

    // Debug logging
    console.log(`[Pollinations] generate llamado con n=${options?.n}, count=${count}, tieneConfigs=${!!perspectiveConfigs}, longitudConfigs=${perspectiveConfigs?.length ?? 0}`);

    // Single image generation (only when count is 1 AND no perspective configs)
    if (count === 1 && (!perspectiveConfigs || perspectiveConfigs.length === 0)) {
      const url = await pollinationsProvider.generateImage(prompt, params);
      return {
        urls: [url],
        revised_prompt: options?.enhance ? undefined : undefined,
      };
    }

    // Multiple image generation with parallel execution
    // Use the larger of count or perspectiveConfigs length
    const numToGenerate = perspectiveConfigs?.length ? Math.max(count, perspectiveConfigs.length) : count;
    const baseSeed = params.seed ?? generateSeed();
    
    console.log(`[Pollinations] Generando ${numToGenerate} imágenes en paralelo`);
    
    const generationPromises = Array.from({ length: numToGenerate }, async (_, i) => {
      // Use perspective-specific config if available
      const perspectiveConfig = perspectiveConfigs?.[i];
      const imagePrompt = perspectiveConfig?.positive_prompt ?? prompt;
      
      const imageParams: PollinationsImageParams = {
        ...params,
        seed: baseSeed + i * 1000, // Vary seed for different results
        negative_prompt: perspectiveConfig?.negative_prompt ?? params.negative_prompt,
        enhance: perspectiveConfig 
          ? perspectiveConfig.denoising_strength > 0.5 
          : params.enhance,
      };

      const url = await pollinationsProvider.generateImage(imagePrompt, imageParams);
      
      return {
        url,
        seed: imageParams.seed,
        prompt: imagePrompt,
        model: imageParams.model,
        reasoning: perspectiveConfig?.reasoning,
      };
    });

    const results = await Promise.all(generationPromises);

    return {
      urls: results.map(r => r.url),
      metadata: results.map(r => ({
        seed: r.seed,
        prompt: r.prompt,
        model: r.model,
        reasoning: r.reasoning,
      })),
    };
  },
};
