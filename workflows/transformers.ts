import type { ChatMessage, VisionMessage, ImageResult } from '../lib/types';
import type { StepInputMap, WorkflowContext } from './types';

/**
 * Accumulates an async iterable of strings into a single string.
 * Used for text/vision services that return streams.
 */
export async function streamToString(stream: AsyncIterable<string>): Promise<string> {
  const chunks: string[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

/**
 * Creates a simple user message from text.
 */
export function textToChatMessage(text: string): ChatMessage {
  return { role: 'user', content: text };
}

/**
 * Creates chat messages array from text.
 */
export function textToChatMessages(text: string): StepInputMap['text'] {
  return { messages: [textToChatMessage(text)] };
}

/**
 * Creates a vision message with an image URL.
 */
export function imageUrlToVisionMessage(
  imageUrl: string,
  prompt: string = 'Describe this image in detail.'
): VisionMessage {
  return {
    role: 'user',
    content: [
      { type: 'image_url', image_url: { url: imageUrl } },
      { type: 'text', text: prompt },
    ],
  };
}

/**
 * Creates vision messages array from image URL.
 */
export function imageUrlToVisionMessages(
  imageUrl: string,
  prompt?: string
): StepInputMap['vision'] {
  return { messages: [imageUrlToVisionMessage(imageUrl, prompt)] };
}

/**
 * Extracts the first image URL from an ImageResult.
 */
export function imageResultToUrl(result: ImageResult): string {
  if (!result.urls || result.urls.length === 0) {
    throw new Error('ImageResult no contiene URLs');
  }
  return result.urls[0]!;
}

/**
 * Creates image generation input from text.
 */
export function textToImageInput(prompt: string): StepInputMap['image'] {
  return { prompt };
}

/**
 * Creates audio generation input from text.
 */
export function textToAudioInput(text: string): StepInputMap['audio'] {
  return { input: text };
}

// ============ Composite Transformers ============

/**
 * Transformer: Previous text result → Image prompt
 * Use when the previous step is text and next step is image.
 */
export function previousTextToImageInput(
  _input: unknown,
  context: WorkflowContext
): StepInputMap['image'] {
  const text = context.previousResult<string>();
  if (!text) {
    throw new Error('No hay resultado de texto previo disponible para generación de imagen');
  }
  return textToImageInput(text);
}

/**
 * Transformer: Previous image result → Vision messages
 * Use when the previous step is image and next step is vision.
 */
export function previousImageToVisionInput(
  prompt: string = 'Describe this image in detail.'
): (_input: unknown, context: WorkflowContext) => StepInputMap['vision'] {
  return (_input, context) => {
    const imageResult = context.previousResult<ImageResult>();
    if (!imageResult) {
      throw new Error('No hay resultado de imagen previo disponible para análisis de visión');
    }
    return imageUrlToVisionMessages(imageResultToUrl(imageResult), prompt);
  };
}

/**
 * Transformer: Previous text result → Audio input
 * Use when the previous step is text/vision and next step is audio.
 */
export function previousTextToAudioInput(
  _input: unknown,
  context: WorkflowContext
): StepInputMap['audio'] {
  const text = context.previousResult<string>();
  if (!text) {
    throw new Error('No hay resultado de texto previo disponible para generación de audio');
  }
  return textToAudioInput(text);
}

/**
 * Transformer: Workflow input → Chat messages
 * Use for first text step that uses workflow input directly.
 */
export function inputToChatMessages(
  input: unknown,
  _context: WorkflowContext
): StepInputMap['text'] {
  if (typeof input === 'string') {
    return textToChatMessages(input);
  }
  if (typeof input === 'object' && input !== null && 'messages' in input) {
    return input as StepInputMap['text'];
  }
  throw new Error('Input inválido para mensajes de chat: se esperaba string o { messages: ChatMessage[] }');
}

/**
 * Transformer: Workflow input → Image prompt
 * Use for first image step that uses workflow input directly.
 */
export function inputToImageInput(
  input: unknown,
  _context: WorkflowContext
): StepInputMap['image'] {
  if (typeof input === 'string') {
    return textToImageInput(input);
  }
  if (typeof input === 'object' && input !== null && 'prompt' in input) {
    return input as StepInputMap['image'];
  }
  throw new Error('Input inválido para generación de imagen: se esperaba string o { prompt: string }');
}

// ============ Helper to create custom transformers ============

/**
 * Creates a transformer that extracts a value from the previous step result
 * and transforms it into the input for the next step.
 */
export function createTransformer<TCategory extends keyof StepInputMap>(
  transform: (previousResult: unknown, context: WorkflowContext) => StepInputMap[TCategory]
): (_input: unknown, context: WorkflowContext) => StepInputMap[TCategory] {
  return (_input, context) => transform(context.previousResult(), context);
}
