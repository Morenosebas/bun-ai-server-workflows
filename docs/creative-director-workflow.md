# Multi-Image Creative Director Workflow

Workflow que analiza múltiples imágenes y genera 1-3 variaciones de perspectiva usando img2img. La IA actúa como Director Creativo.

## Input Esperado

```typescript
interface MultiImageInput {
  input_images: Array<{
    id: number;
    data: string;      // URL de la imagen
    is_main?: boolean; // true para la imagen principal (base del img2img)
  }>;
  user_intent: string;     // "Pon este producto en una playa al atardecer"
  perspectivas?: number;   // 1-3 (default: 1) - cuántas variaciones generar
}
```

### Ejemplo de Request

```json
{
  "input_images": [
    { "id": 1, "data": "https://example.com/producto.jpg", "is_main": true },
    { "id": 2, "data": "https://example.com/referencia-playa.jpg" }
  ],
  "user_intent": "Coloca este producto en una playa tropical al atardecer",
  "perspectivas": 3
}
```

### Campos

| Campo | Tipo | Requerido | Descripción |
|-------|------|-----------|-------------|
| `input_images` | Array | ✅ | Lista de imágenes (mín. 1, máx. recomendado 3) |
| `input_images[].id` | number | ✅ | Identificador único de la imagen |
| `input_images[].data` | string | ✅ | URL de la imagen |
| `input_images[].is_main` | boolean | ❌ | `true` para la imagen base del img2img (default: primera) |
| `user_intent` | string | ✅ | Descripción del resultado deseado |
| `perspectivas` | number | ❌ | Cantidad de variaciones a generar (1-3, default: 1) |

---

## Output Devuelto

```typescript
interface ImageResult {
  urls: string[];  // Array con 1-3 URLs según perspectivas solicitadas
  metadata?: Array<{
    seed?: number;      // Seed usado para reproducibilidad
    prompt?: string;    // Prompt generado por el Creative Director
    model?: string;     // Modelo usado (nanobanana-pro)
    reasoning?: string; // Explicación de la perspectiva elegida
  }>;
}
```

### Ejemplo de Response

```json
{
  "urls": [
    "https://pollinations.ai/image/...",
    "https://pollinations.ai/image/...",
    "https://pollinations.ai/image/..."
  ],
  "metadata": [
    {
      "seed": 123456,
      "prompt": "elegant watch on tropical beach, frontal view, centered composition, soft diffused golden hour light, sharp focus on main subject, crystal clear water...",
      "model": "nanobanana-pro",
      "reasoning": "Vista frontal con luz dorada suave para resaltar los detalles del producto"
    },
    {
      "seed": 124456,
      "prompt": "elegant watch on tropical beach, slight 45-degree angle, dramatic high-contrast lighting with deep shadows, subtle depth of field...",
      "model": "nanobanana-pro",
      "reasoning": "Vista lateral con iluminación dramática para crear profundidad y dinamismo"
    },
    {
      "seed": 125456,
      "prompt": "elegant watch on tropical beach, elevated overhead perspective, bird's eye view, natural ambient daylight, wide depth of field...",
      "model": "nanobanana-pro",
      "reasoning": "Vista aérea con luz natural para mostrar el contexto completo de la escena"
    }
  ]
}
```

---

## Variaciones por Perspectiva

Cada perspectiva varía en tres dimensiones para crear diversidad visual manteniendo la esencia de la escena:

| # | Ángulo | Iluminación | Enfoque |
|---|--------|-------------|---------|
| 1 | Frontal, centrado | Soft golden hour (difusa) | Sharp focus en sujeto |
| 2 | 45° lateral, dinámico | Dramática con sombras profundas | DOF sutil (fondo blur) |
| 3 | Overhead/aérea (bird's eye) | Natural ambiente, uniforme | Wide DOF (todo enfocado) |

### Descripción de Variaciones

**Perspectiva 1 - Frontal Clásica**
- Vista frontal centrada, composición equilibrada
- Iluminación suave tipo golden hour para resaltar detalles
- Enfoque nítido en el sujeto principal

**Perspectiva 2 - Lateral Dinámica**
- Ángulo de 45 grados para añadir dinamismo
- Iluminación dramática con alto contraste y sombras profundas
- Profundidad de campo sutil para separar sujeto del fondo

**Perspectiva 3 - Aérea Contextual**
- Vista desde arriba (bird's eye view)
- Iluminación natural y uniforme
- Todo en foco para mostrar el contexto completo

---

## Flujo Interno

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  analyze-images │ ──▶ │  creative-director  │ ──▶ │ generate-perspectives│
│    (vision)     │     │       (text)        │     │       (image)       │
└─────────────────┘     └─────────────────────┘     └─────────────────────┘
       │                         │                          │
       ▼                         ▼                          ▼
  JSON con análisis       Array de configs          URLs + metadata
  de cada imagen          por perspectiva           (paralelo con n)
```

### Paso 1: `analyze-images` (Vision)
- Analiza todas las imágenes de entrada con IA de visión
- Identifica objetos, contexto, materiales, colores
- Output: JSON array con descripción detallada de cada imagen

### Paso 2: `creative-director` (Text)
- Recibe el análisis visual + user_intent + perspectivas
- Genera configuración específica para cada perspectiva:
  - `positive_prompt`: Prompt optimizado para Stable Diffusion
  - `negative_prompt`: Términos a evitar
  - `denoising_strength`: Intensidad de transformación
  - `reasoning`: Explicación de la decisión creativa

### Paso 3: `generate-perspectives` (Image)
- Genera todas las imágenes en **paralelo** usando `Promise.all`
- Usa la imagen principal como source para img2img
- Cada imagen tiene seed diferente para variación
- Retorna URLs + metadata completo

---

## Timeouts y Configuración

| Parámetro | Valor | Descripción |
|-----------|-------|-------------|
| Timeout total | 240s (4 min) | Tiempo máximo para todo el workflow |
| Step timeout | 120s (2 min) | Tiempo máximo por paso |
| Modelo img2img | `nanobanana-pro` | Optimizado para transformaciones |
| Generación | Paralela | Las 3 imágenes se generan simultáneamente |

---

## Uso via API

### Iniciar Workflow

```bash
curl -X POST http://localhost:3000/workflow/multi-image-creative-director \
  -H "Content-Type: application/json" \
  -d '{
    "input_images": [
      { "id": 1, "data": "https://example.com/producto.jpg", "is_main": true },
      { "id": 2, "data": "https://example.com/referencia.jpg" }
    ],
    "user_intent": "Producto en playa tropical al atardecer",
    "perspectivas": 2
  }'
```

**Response:**
```json
{ "workflowId": "wf_abc123" }
```

### Obtener Estado

```bash
curl http://localhost:3000/workflow/wf_abc123
```

### Stream de Progreso (SSE)

```bash
curl http://localhost:3000/workflow/wf_abc123/stream
```

**Eventos SSE:**
```
event: workflow:started
data: {"workflowId":"wf_abc123","name":"multi-image-creative-director","totalSteps":3}

event: step:started
data: {"step":0,"name":"analyze-images","category":"vision"}

event: step:complete
data: {"step":0,"name":"analyze-images","service":"Groq","durationMs":2340}

event: step:started
data: {"step":1,"name":"creative-director","category":"text"}

event: step:complete
data: {"step":1,"name":"creative-director","service":"Groq","durationMs":1850}

event: step:started
data: {"step":2,"name":"generate-perspectives","category":"image"}

event: step:complete
data: {"step":2,"name":"generate-perspectives","service":"Pollinations","durationMs":45230,"result":{...}}

event: workflow:complete
data: {"workflowId":"wf_abc123","result":{...},"durationMs":49420}
```

---

## Estrategias del Creative Director

El Creative Director analiza la relación entre las imágenes y aplica una de dos estrategias:

### Escenario A: Product Reinforcement
**Cuando:** Las imágenes 2 y 3 son el MISMO objeto desde otros ángulos

**Acción:** Usa las imágenes adicionales para enriquecer la descripción del producto (texturas, logos, detalles no visibles en imagen 1)

### Escenario B: Style Transfer
**Cuando:** Las imágenes 2 y 3 son paisajes, texturas o referencias artísticas

**Acción:** Usa las imágenes de referencia para definir el fondo y la iluminación, ignorando sus objetos

---

## Tipos TypeScript

```typescript
// workflows/types.ts

export interface MultiImageInput {
  input_images: Array<{
    id: number;
    data: string;
    is_main?: boolean;
  }>;
  user_intent: string;
  perspectivas?: number;
}

export interface PerspectiveConfig {
  perspective_id: number;
  reasoning: string;
  positive_prompt: string;
  negative_prompt: string;
  denoising_strength: number;
}

export interface CreativeDirectorResult {
  perspectives: Array<{
    url: string;
    prompt: string;
    reasoning: string;
    seed?: number;
    model?: string;
  }>;
}
```

```typescript
// lib/types.ts

export interface ImageResult {
  urls: string[];
  revised_prompt?: string;
  metadata?: Array<{
    seed?: number;
    prompt?: string;
    model?: string;
    reasoning?: string;
  }>;
}
```
