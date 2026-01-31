/**
 * Google Gemini Text Service
 * Streaming chat completions using @google/genai SDK
 */

import { GoogleGenAI } from "@google/genai";
import type { TextService, ChatMessage } from "../../lib/types";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

/**
 * Convert ChatMessage format to Gemini Content format
 */
function messagesToContents(messages: ChatMessage[]) {
  // Extract system message if present
  const systemMessage = messages.find((m) => m.role === "system");
  const chatMessages = messages.filter((m) => m.role !== "system");

  // Convert to Gemini format
  const contents = chatMessages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  return {
    contents,
    systemInstruction: systemMessage?.content,
  };
}

/**
 * Google Gemini Text Service
 *
 * Features:
 * - Official Google GenAI SDK
 * - Streaming responses
 * - Model: gemini-2.0-flash (default)
 * - Supports system instructions
 *
 * @example
 * const stream = await geminiService.chat([
 *   { role: 'system', content: 'You are a helpful assistant.' },
 *   { role: 'user', content: 'Hello!' }
 * ]);
 * for await (const chunk of stream) {
 *   process.stdout.write(chunk);
 * }
 */
export const geminiService: TextService = {
  name: "Gemini",
  category: "text",

  async chat(messages: ChatMessage[]) {
    const { contents, systemInstruction } = messagesToContents(messages);

    const response = await ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      contents,
      config: {
        ...(systemInstruction && { systemInstruction }),
        maxOutputTokens: 8000,
        temperature: 0.7,
      },
    });

    return (async function* () {
      for await (const chunk of response) {
        yield chunk.text || "";
      }
    })();
  },
};
