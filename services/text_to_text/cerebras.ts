import Cerebras from "@cerebras/cerebras_cloud_sdk";
import type { TextService, ChatMessage } from "../../lib/types";

const cerebras = new Cerebras({
  apiKey: process.env.CEREBRAS_API_KEY,
});

export const cerebrasService: TextService = {
  name: "Cerebras",
  category: "text",
  async chat(messages: ChatMessage[]) {
    const stream = await cerebras.chat.completions.create({
      messages: messages as any,
      model: "llama3.1-8b",
      stream: true,
      max_completion_tokens: 8192,
      temperature: 0.6,
      top_p: 0.95,
    });

    return (async function* () {
      for await (const chunk of stream) {
        yield (chunk as any).choices[0]?.delta?.content || "";
      }
    })();
  },
};
