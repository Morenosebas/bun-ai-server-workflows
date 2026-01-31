/**
 * Pollinations.ai Provider
 * HTTP client for Pollinations API with timeout and error handling
 */

import { classifyError } from '../../lib/errors';
import type { ChatMessage } from '../../lib/types';
import {
  type PollinationsConfig,
  type PollinationsImageParams,
  type PollinationsTextParams,
  POLLINATIONS_DEFAULTS,
} from './types';

// Re-export types for convenience
export * from './types';

/** Pollinations API client */
export class PollinationsProvider {
  private readonly config: PollinationsConfig;

  constructor(config?: Partial<PollinationsConfig>) {
    this.config = {
      baseUrl: config?.baseUrl ?? POLLINATIONS_DEFAULTS.baseUrl,
      apiKey: config?.apiKey ?? process.env.POLLINATIONS_API_KEY,
      timeout: config?.timeout ?? POLLINATIONS_DEFAULTS.timeout,
    };
  }

  /**
   * Build a public URL for image generation
   * This URL can be used directly in <img> tags or returned to clients
   */
  buildImageUrl(prompt: string, params?: PollinationsImageParams): string {
    const searchParams = new URLSearchParams();

    // Add model (default: klein-large)
    searchParams.set('model', params?.model ?? POLLINATIONS_DEFAULTS.model);

    // Add optional parameters if provided
    if (params?.width !== undefined) {
      searchParams.set('width', String(params.width));
    }
    if (params?.height !== undefined) {
      searchParams.set('height', String(params.height));
    }
    if (params?.seed !== undefined) {
      searchParams.set('seed', String(params.seed));
    }
    if (params?.enhance !== undefined) {
      searchParams.set('enhance', String(params.enhance));
    }
    if (params?.negative_prompt !== undefined) {
      searchParams.set('negative_prompt', params.negative_prompt);
    }
    if (params?.safe !== undefined) {
      searchParams.set('safe', String(params.safe));
    }
    if (params?.quality !== undefined) {
      searchParams.set('quality', params.quality);
    }
    if (params?.image !== undefined) {
      searchParams.set('image', params.image);
    }

    // Add API key if available
    if (this.config.apiKey) {
      searchParams.set('key', this.config.apiKey);
    }

    const encodedPrompt = encodeURIComponent(prompt);
    return `${this.config.baseUrl}/image/${encodedPrompt}?${searchParams.toString()}`;
  }

  /**
   * Generate an image and validate the response
   * Returns the public URL after confirming the image was generated successfully
   */
  async generateImage(
    prompt: string,
    params?: PollinationsImageParams,
  ): Promise<string> {
    const url = this.buildImageUrl(prompt, params);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {};
      
      // Add auth header if API key is available
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error desconocido');
        throw new Error(`Error de API Pollinations (${response.status}): ${errorText}`);
      }

      // Image generated successfully - return the public URL
      // The URL is deterministic and cacheable by Pollinations
      return url;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw classifyError(new Error('Tiempo de espera agotado'), 'Pollinations');
      }
      throw classifyError(error, 'Pollinations');
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Stream chat completions using OpenAI-compatible endpoint
   * Returns an async generator that yields text chunks
   */
  async *streamChat(
    messages: ChatMessage[],
    params?: PollinationsTextParams,
  ): AsyncGenerator<string> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      // Add auth header if API key is available
      if (this.config.apiKey) {
        headers['Authorization'] = `Bearer ${this.config.apiKey}`;
      }

      const body = {
        model: params?.model ?? POLLINATIONS_DEFAULTS.textModel,
        messages,
        stream: true,
        ...(params?.temperature !== undefined && { temperature: params.temperature }),
        ...(params?.max_tokens !== undefined && { max_tokens: params.max_tokens }),
        ...(params?.seed !== undefined && { seed: params.seed }),
        ...(params?.json_mode && { response_format: { type: 'json_object' } }),
      };

      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Error desconocido');
        throw new Error(`Error de API Pollinations (${response.status}): ${errorText}`);
      }

      if (!response.body) {
        throw new Error('No se recibió cuerpo de respuesta');
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') return;

            try {
              const parsed = JSON.parse(data);
              const content = parsed.choices?.[0]?.delta?.content;
              if (content) yield content;
            } catch {
              // Skip malformed JSON chunks
            }
          }
        }
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw classifyError(new Error('Tiempo de espera agotado'), 'Pollinations');
      }
      throw classifyError(error, 'Pollinations');
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

/** Default provider instance */
export const pollinationsProvider = new PollinationsProvider();
