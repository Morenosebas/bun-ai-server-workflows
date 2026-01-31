/**
 * Pollinations Text Service
 * Streaming chat completions using Pollinations.ai (OpenAI-compatible API)
 */

import type { TextService, ChatMessage } from '../../lib/types';
import {
  pollinationsProvider,
  type PollinationsTextParams,
  POLLINATIONS_DEFAULTS,
} from '../../provider/pollinations';

/**
 * Pollinations Text Service
 * 
 * Features:
 * - OpenAI-compatible chat completions
 * - Streaming responses via SSE
 * - Multiple models: gemini-flash (default), openai, claude, mistral, etc.
 * - Free tier available (with rate limits)
 * 
 * @example
 * // Basic chat
 * const stream = await pollinationsTextService.chat([
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 */
export const pollinationsTextService: TextService = {
  name: 'Pollinations',
  category: 'text',

  async chat(messages: ChatMessage[]) {
    const params: PollinationsTextParams = {
      model: POLLINATIONS_DEFAULTS.textModel, // gemini-flash by default
      temperature: 0.7,
    };

    return pollinationsProvider.streamChat(messages, params);
  },
};
