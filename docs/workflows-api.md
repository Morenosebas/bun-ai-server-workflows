# Workflows API - Multi-Image Creative Director

Sistema de flujos de trabajo que encadena múltiples servicios de IA. Los workflows se ejecutan en background y puedes monitorear su progreso en tiempo real vía SSE.

## Características

- ⚡ **Ejecución asíncrona**: Retorna `workflowId` inmediatamente, no bloquea
- 📡 **Progreso en tiempo real**: Suscríbete vía SSE para cada paso
- 💾 **Persistencia opcional**: Con Redis los workflows sobreviven reinicios
- 🚦 **Límite de concurrencia**: Máximo 5 workflows simultáneos
- ⏱️ **Timeouts**: 60s por paso, 3 minutos total (configurable)

---

## Endpoints

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| `GET` | `/workflows` | Lista workflows disponibles |
| `POST` | `/workflow/:name` | Inicia un workflow |
| `GET` | `/workflow/:id` | Estado actual del workflow |
| `GET` | `/workflow/:id/stream` | SSE con progreso en tiempo real |

---

## Workflow: `multi-image-creative-director`

Analiza múltiples imágenes, entiende la relación entre ellas según tu intención, y genera una nueva imagen usando la principal como base (img2img).

### Input

```typescript
interface WorkflowInput {
  input_images: Array<{
    id: number;
    data: string;      // URL de la imagen
    is_main?: boolean; // true = imagen base para transformar
  }>;
  user_intent: string; // Qué quieres lograr
}
```

### Output

```typescript
interface ImageResult {
  urls: string[];        // URLs de la imagen generada
  revised_prompt?: string;
}
```

### Pasos del Pipeline

| # | Paso | Descripción |
|---|------|-------------|
| 1 | `analyze-images` | Vision AI analiza cada imagen (objeto, contexto, estilo) |
| 2 | `creative-director` | LLM genera configuración (prompt, negative, strength) |
| 3 | `generate-final` | Genera imagen usando la `is_main` como base |

### Casos de Uso

| Escenario | Imágenes | Intención | Resultado |
|-----------|----------|-----------|-----------|
| **Refuerzo de Producto** | 3 fotos del mismo zapato | "Mejorar calidad" | Imagen HD con todos los detalles |
| **Transferencia de Estilo** | 1 zapato + 1 playa | "Poner en la playa" | Zapato en escena de playa |
| **Cambio de Contexto** | 1 reloj + 1 espacio | "Mostrar flotando en el espacio" | Reloj en ambiente espacial |

---

## Implementación Frontend

### TypeScript/React - Ejemplo Completo

```typescript
// types.ts
interface WorkflowInput {
  input_images: Array<{
    id: number;
    data: string;
    is_main?: boolean;
  }>;
  user_intent: string;
}

interface WorkflowStartResponse {
  workflowId: string;
  name: string;
  status: 'queued' | 'pending';
  statusUrl: string;
  streamUrl: string;
}

interface StepEvent {
  step: number;
  name: string;
  category?: string;
  service?: string;
  durationMs?: number;
  result?: any;
  error?: { message: string; code?: string };
}

interface WorkflowCompletedEvent {
  workflowId: string;
  result: { urls: string[] };
  totalDurationMs: number;
}

interface WorkflowStatus {
  id: string;
  name: string;
  status: 'pending' | 'queued' | 'running' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  steps: Array<{
    index: number;
    name: string;
    category: string;
    status: string;
    result?: any;
    durationMs?: number;
  }>;
  result?: { urls: string[] };
  error?: { message: string };
}
```

### Hook: useWorkflow (React)

```typescript
// hooks/useWorkflow.ts
import { useState, useCallback, useRef } from 'react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8085';
const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

type WorkflowState = 'idle' | 'starting' | 'running' | 'completed' | 'failed';

interface UseWorkflowReturn {
  state: WorkflowState;
  currentStep: number;
  totalSteps: number;
  stepName: string;
  result: { urls: string[] } | null;
  error: string | null;
  progress: number; // 0-100
  startWorkflow: (input: WorkflowInput) => Promise<void>;
  cancel: () => void;
}

export function useWorkflow(): UseWorkflowReturn {
  const [state, setState] = useState<WorkflowState>('idle');
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(3);
  const [stepName, setStepName] = useState('');
  const [result, setResult] = useState<{ urls: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const cancel = useCallback(() => {
    eventSourceRef.current?.close();
    setState('idle');
  }, []);

  const startWorkflow = useCallback(async (input: WorkflowInput) => {
    // Reset state
    setState('starting');
    setCurrentStep(0);
    setStepName('');
    setResult(null);
    setError(null);

    try {
      // 1. Start workflow
      const response = await fetch(`${API_URL}/workflow/multi-image-creative-director`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_KEY}`,
        },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Failed to start workflow');
      }

      const { workflowId, streamUrl } = await response.json() as WorkflowStartResponse;

      // 2. Connect to SSE stream
      setState('running');
      const eventSource = new EventSource(`${API_URL}${streamUrl}`);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('workflow:started', (e) => {
        const data = JSON.parse(e.data);
        setTotalSteps(data.totalSteps);
      });

      eventSource.addEventListener('step:started', (e) => {
        const data: StepEvent = JSON.parse(e.data);
        setCurrentStep(data.step);
        setStepName(data.name);
      });

      eventSource.addEventListener('step:completed', (e) => {
        const data: StepEvent = JSON.parse(e.data);
        setCurrentStep(data.step + 1);
      });

      eventSource.addEventListener('workflow:completed', (e) => {
        const data: WorkflowCompletedEvent = JSON.parse(e.data);
        setResult(data.result);
        setState('completed');
        eventSource.close();
      });

      eventSource.addEventListener('step:error', (e) => {
        const data: StepEvent = JSON.parse(e.data);
        setError(`Error en ${data.name}: ${data.error?.message}`);
      });

      eventSource.addEventListener('workflow:failed', (e) => {
        const data = JSON.parse(e.data);
        setError(data.error?.message || 'Workflow failed');
        setState('failed');
        eventSource.close();
      });

      eventSource.onerror = () => {
        setError('Connection lost');
        setState('failed');
        eventSource.close();
      };

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
      setState('failed');
    }
  }, []);

  const progress = totalSteps > 0 ? Math.round((currentStep / totalSteps) * 100) : 0;

  return {
    state,
    currentStep,
    totalSteps,
    stepName,
    result,
    error,
    progress,
    startWorkflow,
    cancel,
  };
}
```

### Componente React de Ejemplo

```tsx
// components/CreativeDirector.tsx
import { useState } from 'react';
import { useWorkflow } from '../hooks/useWorkflow';

const STEP_LABELS: Record<string, string> = {
  'analyze-images': '🔍 Analizando imágenes...',
  'creative-director': '🎨 Generando configuración creativa...',
  'generate-final': '🖼️ Generando imagen final...',
};

export function CreativeDirector() {
  const [images, setImages] = useState<Array<{ id: number; data: string; is_main: boolean }>>([]);
  const [intent, setIntent] = useState('');
  const workflow = useWorkflow();

  const addImage = (url: string, isMain = false) => {
    setImages(prev => [...prev, { 
      id: prev.length + 1, 
      data: url, 
      is_main: isMain || prev.length === 0 
    }]);
  };

  const handleSubmit = async () => {
    if (images.length === 0 || !intent) return;
    
    await workflow.startWorkflow({
      input_images: images,
      user_intent: intent,
    });
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">🎬 Creative Director AI</h1>

      {/* Image inputs */}
      <div className="space-y-4 mb-6">
        <label className="block text-sm font-medium">Imágenes</label>
        {images.map((img, i) => (
          <div key={img.id} className="flex items-center gap-2">
            <img src={img.data} className="w-16 h-16 object-cover rounded" />
            <span className="text-sm">
              {img.is_main ? '⭐ Principal' : `Soporte ${i + 1}`}
            </span>
          </div>
        ))}
        <input
          type="url"
          placeholder="Pega URL de imagen y presiona Enter"
          className="w-full p-2 border rounded"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              addImage((e.target as HTMLInputElement).value);
              (e.target as HTMLInputElement).value = '';
            }
          }}
        />
      </div>

      {/* Intent input */}
      <div className="mb-6">
        <label className="block text-sm font-medium mb-2">
          ¿Qué quieres lograr?
        </label>
        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Ej: Poner este producto en una playa al atardecer"
          className="w-full p-2 border rounded h-24"
        />
      </div>

      {/* Submit button */}
      <button
        onClick={handleSubmit}
        disabled={workflow.state === 'running' || images.length === 0 || !intent}
        className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium
                   disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {workflow.state === 'running' ? 'Procesando...' : '✨ Generar'}
      </button>

      {/* Progress */}
      {workflow.state === 'running' && (
        <div className="mt-6">
          <div className="flex justify-between text-sm mb-2">
            <span>{STEP_LABELS[workflow.stepName] || workflow.stepName}</span>
            <span>{workflow.progress}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${workflow.progress}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            Paso {workflow.currentStep + 1} de {workflow.totalSteps}
          </p>
        </div>
      )}

      {/* Result */}
      {workflow.state === 'completed' && workflow.result && (
        <div className="mt-6">
          <h3 className="font-medium mb-2">✅ Resultado</h3>
          <img
            src={workflow.result.urls[0]}
            alt="Generated"
            className="w-full rounded-lg shadow-lg"
          />
        </div>
      )}

      {/* Error */}
      {workflow.state === 'failed' && workflow.error && (
        <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-red-600">❌ {workflow.error}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Alternativa: Polling (sin SSE)

Si tu entorno no soporta SSE (ej: algunos proxies), usa polling:

```typescript
async function runWorkflowWithPolling(input: WorkflowInput): Promise<{ urls: string[] }> {
  // 1. Iniciar
  const startRes = await fetch(`${API_URL}/workflow/multi-image-creative-director`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ input }),
  });

  const { workflowId } = await startRes.json();

  // 2. Polling cada 2 segundos
  while (true) {
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(`${API_URL}/workflow/${workflowId}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` },
    });

    const status: WorkflowStatus = await statusRes.json();
    
    console.log(`[${status.currentStep}/${status.totalSteps}] ${status.status}`);

    if (status.status === 'completed') {
      return status.result!;
    }

    if (status.status === 'failed') {
      throw new Error(status.error?.message || 'Workflow failed');
    }
  }
}
```

---

## Eventos SSE

| Evento | Data | Descripción |
|--------|------|-------------|
| `workflow:started` | `{ workflowId, name, totalSteps }` | Workflow iniciado |
| `step:started` | `{ step, name, category }` | Paso iniciado |
| `step:completed` | `{ step, name, service, durationMs, result }` | Paso completado |
| `step:error` | `{ step, name, error: { message, code } }` | Error en paso (puede recuperarse) |
| `workflow:completed` | `{ workflowId, result, totalDurationMs }` | Workflow exitoso |
| `workflow:failed` | `{ workflowId, error: { message, step } }` | Workflow falló |

---

## Códigos de Error HTTP

| Código | Significado |
|--------|-------------|
| `202` | Workflow iniciado/encolado correctamente |
| `200` | Estado obtenido exitosamente |
| `400` | Input inválido (faltan imágenes o intención) |
| `401` | API Key inválida o faltante |
| `404` | Workflow no encontrado |
| `429` | Límite de concurrencia alcanzado |
| `500` | Error interno del servidor |

---

## Ejemplos cURL

### Iniciar workflow

```bash
curl -X POST http://localhost:8085/workflow/multi-image-creative-director \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -d '{
    "input": {
      "input_images": [
        { "id": 1, "data": "https://example.com/product.jpg", "is_main": true },
        { "id": 2, "data": "https://example.com/beach.jpg" }
      ],
      "user_intent": "Mostrar este producto en una playa tropical"
    }
  }'
```

### Consultar estado

```bash
curl http://localhost:8085/workflow/wf_abc123 \
  -H "Authorization: Bearer YOUR_API_KEY"
```

### Escuchar SSE (con curl)

```bash
curl -N http://localhost:8085/workflow/wf_abc123/stream \
  -H "Authorization: Bearer YOUR_API_KEY"
```

---

## Configuración del Servidor

Variables de entorno opcionales:

```env
REDIS_URL=redis://localhost:6379    # Habilita persistencia
WORKFLOW_MAX_CONCURRENT=5           # Máx. workflows simultáneos
WORKFLOW_STEP_TIMEOUT_MS=60000      # Timeout por paso (60s)
WORKFLOW_TOTAL_TIMEOUT_MS=180000    # Timeout total (3min)
WORKFLOW_RESULT_TTL_SECONDS=3600    # TTL de resultados (1h)
```

---

## Notas Importantes

1. **Imagen principal (`is_main: true`)**: Es la base para la transformación img2img. Si no se especifica, se usa la primera.

2. **URLs vs Base64**: El campo `data` acepta URLs públicas. Para Base64, usa el formato `data:image/jpeg;base64,...`

3. **Timeout**: El workflow tiene 3 minutos máximo. Para imágenes complejas, puede tomar 30-90 segundos.

4. **Resultados**: Se mantienen 1 hora en memoria (o Redis). Guarda las URLs generadas en tu sistema.

5. **Errores recuperables**: Si un paso falla por rate limit, el sistema reintenta automáticamente con otro proveedor.
