# Guía para Implementar Nuevos Servicios

Esta guía explica cómo agregar nuevos proveedores de IA al sistema de round-robin.

## Arquitectura

```
lib/
├── index.ts          # Barrel exports (import { registry } from './lib')
├── types.ts          # Interfaces de servicios
├── errors.ts         # Sistema de errores tipados
├── registry.ts       # ServiceRegistry singleton
├── executor.ts       # TextServiceExecutor con retry
└── date.ts           # Utilidades de fecha (timezone Colombia)
services/
├── text/             # Servicios de generación de texto (chat)
│   ├── groq.ts
│   └── cerebras.ts
├── image/            # Servicios de generación de imágenes
│   └── (ejemplo: dalle.ts, stability.ts)
├── video/            # Servicios de generación de video
│   └── (ejemplo: runway.ts)
└── audio/            # Servicios de generación de audio
    └── (ejemplo: elevenlabs.ts)
```

## Implementar un Servicio de Texto

Los servicios de texto usan **streaming** mediante async generators.

### 1. Crear el archivo del servicio

```typescript
// services/text/mi-servicio.ts
import type { TextService, ChatMessage } from '../../lib/types';

const client = new MiSDK({ apiKey: process.env.MI_API_KEY });

export const miServicio: TextService = {
  name: 'MiServicio',
  category: 'text',
  
  async chat(messages: ChatMessage[]) {
    const response = await client.chat.completions.create({
      messages,
      model: 'modelo-id',
      stream: true,
    });

    // Retornar async generator que yield strings
    return (async function* () {
      for await (const chunk of response) {
        yield chunk.choices[0]?.delta?.content || '';
      }
    })();
  }
};
```

### 2. Registrar en index.ts

```typescript
import { miServicio } from "./services/text/mi-servicio";

registry
  .register(groqService)
  .register(cerebrasService)
  .register(miServicio);  // Añadir aquí
```

### 3. Agregar API key al .env

```env
MI_API_KEY=tu_api_key_aqui
```

## Implementar un Servicio de Imagen

Los servicios de imagen retornan URLs de las imágenes generadas.

### 1. Crear el archivo del servicio

```typescript
// services/image/dalle.ts
import OpenAI from 'openai';
import type { ImageService, ImageOptions, ImageResult } from '../../lib/types';

const openai = new OpenAI();

export const dalleService: ImageService = {
  name: 'DALL-E',
  category: 'image',
  
  async generate(prompt: string, options?: ImageOptions): Promise<ImageResult> {
    const response = await openai.images.generate({
      model: 'dall-e-3',
      prompt,
      n: options?.n ?? 1,
      size: `${options?.width ?? 1024}x${options?.height ?? 1024}` as any,
      style: (options?.style as any) ?? 'vivid',
    });

    return {
      urls: response.data.map(img => img.url!),
      revised_prompt: response.data[0]?.revised_prompt,
    };
  }
};
```

### 2. Registrar en index.ts

```typescript
import { dalleService } from "./services/image/dalle";

registry
  .register(groqService)
  .register(cerebrasService)
  .register(dalleService);  // Añadir aquí
```

## Implementar un Servicio de Video

```typescript
// services/video/runway.ts
import type { VideoService, VideoOptions, VideoResult } from '../../lib/types';

export const runwayService: VideoService = {
  name: 'Runway',
  category: 'video',
  
  async generate(prompt: string, options?: VideoOptions): Promise<VideoResult> {
    const response = await fetch('https://api.runwayml.com/v1/generate', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt,
        duration: options?.duration ?? 4,
        fps: options?.fps ?? 24,
      }),
    });

    const data = await response.json();
    return {
      url: data.video_url,
      duration: data.duration,
    };
  }
};
```

## Implementar un Servicio de Audio

```typescript
// services/audio/elevenlabs.ts
import type { AudioService, AudioOptions, AudioResult } from '../../lib/types';

export const elevenlabsService: AudioService = {
  name: 'ElevenLabs',
  category: 'audio',
  
  async generate(input: string, options?: AudioOptions): Promise<AudioResult> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${options?.voice ?? 'default'}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text: input,
          voice_settings: { speed: options?.speed ?? 1.0 },
        }),
      }
    );

    const audioBuffer = await response.arrayBuffer();
    // Guardar o retornar URL según tu implementación
    
    return {
      url: 'url-del-audio-generado',
      duration: 0, // Calcular duración
    };
  }
};
```

## Interfaces de Tipos

Ver [lib/types.ts](../lib/types.ts) para todas las interfaces disponibles:

| Categoría | Interface | Método Principal |
|-----------|-----------|------------------|
| text | `TextService` | `chat(messages)` → `AsyncIterable<string>` |
| image | `ImageService` | `generate(prompt, options)` → `ImageResult` |
| video | `VideoService` | `generate(prompt, options)` → `VideoResult` |
| audio | `AudioService` | `generate(input, options)` → `AudioResult` |
| embedding | `EmbeddingService` | `embed(input)` → `number[][]` |

## API Endpoints

| Endpoint | Método | Body | Descripción |
|----------|--------|------|-------------|
| `/` | GET | - | Health check y servicios disponibles |
| `/text` | POST | `{ messages: ChatMessage[] }` | Generación de texto (streaming) |
| `/chat` | POST | `{ messages: ChatMessage[] }` | Alias de `/text` |
| `/image` | POST | `{ prompt: string, options?: ImageOptions }` | Generación de imagen |
| `/video` | POST | `{ prompt: string, options?: VideoOptions }` | Generación de video |
| `/audio` | POST | `{ input: string, options?: AudioOptions }` | Generación de audio |

## Manejo de Errores

Usa `classifyError()` de [lib/errors.ts](../lib/errors.ts) para clasificar errores de SDKs:

```typescript
import { classifyError } from '../lib/errors';

try {
  // llamada al SDK
} catch (err) {
  throw classifyError(err, 'MiServicio');
}
```

Códigos de error soportados:
- `RATE_LIMITED` → HTTP 429
- `AUTH_FAILED` → HTTP 401
- `INVALID_REQUEST` → HTTP 400
- `SERVICE_ERROR` → HTTP 503
