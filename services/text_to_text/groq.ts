import { Groq } from 'groq-sdk';
import type { TextService, ChatMessage } from '../../lib/types';

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

export const groqService: TextService = {
  name: 'Groq',
  category: 'text',
  async chat(messages: ChatMessage[]) {
    const chatCompletion = await groq.chat.completions.create({
      messages,
      model: "llama-3.1-8b-instant",
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

