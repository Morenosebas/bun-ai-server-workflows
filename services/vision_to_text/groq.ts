import { Groq } from 'groq-sdk';
import type { VisionService, VisionMessage } from '../../lib/types';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const groqVisionService: VisionService = {
  name: 'Groq Vision',
  category: 'vision',
  async analyze(messages: VisionMessage[]) {
    const chatCompletion = await groq.chat.completions.create({
      messages: [...messages as any],
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      temperature: 0.6,
      max_completion_tokens: 8000,
      top_p: 1,
      stream: true,
      stop: null
    });
    
    return (async function* () {
      for await (const chunk of chatCompletion) {
        yield chunk.choices[0]?.delta?.content || ''
      }
    })()
  }
}

