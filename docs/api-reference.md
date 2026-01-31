# API Reference

## Base URL

```
http://localhost:3000
```

## Authentication

All endpoints except `/` and `/health` require API key authentication.

**Header format:**
```
Authorization: Bearer <your_api_key>
```

**Example:**
```bash
curl -X POST http://localhost:3000/text \
  -H "Authorization: Bearer your_secret_api_key_here" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hola"}]}'
```

**Frontend example (JavaScript):**
```javascript
const response = await fetch('http://localhost:3000/text', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${import.meta.env.VITE_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ messages }),
});
```

> **Note:** If `API_KEY` is not set in the backend `.env`, authentication is disabled (development mode).

## Endpoints

### Health Check

```http
GET /
```

**Response:**
```json
{
  "status": "ok",
  "services": {
    "text": ["Groq", "Cerebras"],
    "vision": ["Groq Vision"],
    "image": ["Pollinations"]
  },
  "categories": ["text", "vision", "image"]
}
```

---

### Text Generation (Chat)

```http
POST /text
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "messages": [
    { "role": "system", "content": "Eres un asistente útil." },
    { "role": "user", "content": "Hola, ¿cómo estás?" }
  ]
}
```

**Response:** Server-Sent Events stream (`text/event-stream`)

**Headers de Respuesta:**
- `X-AI-Service`: Nombre del servicio que procesó la petición

**Ejemplo con curl:**
```bash
curl -X POST http://localhost:3000/text \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hola"}]}'
```

---

### Vision Analysis (Image Understanding)

```http
POST /vision
Authorization: Bearer <api_key>
Content-Type: application/json
```

**Request Body:**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "¿Qué hay en esta imagen?" },
        { "type": "image_url", "image_url": { "url": "https://example.com/image.jpg" } }
      ]
    }
  ]
}
```

**Alternative format (multiple images):**
```json
{
  "messages": [
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "Compara estas dos imágenes" },
        { "type": "image_url", "image_url": { "url": "https://example.com/image1.jpg" } },
        { "type": "image_url", "image_url": { "url": "https://example.com/image2.jpg" } }
      ]
    }
  ]
}
```

**Response:** Server-Sent Events stream (`text/event-stream`)

**Headers de Respuesta:**
- `X-AI-Service`: Nombre del servicio que procesó la petición

**Modelo usado:** `meta-llama/llama-4-scout-17b-16e-instruct` (Groq)

**Ejemplo con curl:**
```bash
curl -X POST http://localhost:3000/vision \
  -H "Authorization: Bearer your_api_key" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [{
      "role": "user",
      "content": [
        {"type": "text", "text": "Describe esta imagen"},
        {"type": "image_url", "image_url": {"url": "https://example.com/cat.jpg"}}
      ]
    }]
  }'
```

---

### Image Generation

```http
POST /image
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Un gato astronauta en el espacio",
  "options": {
    "width": 1024,
    "height": 1024,
    "style": "vivid",
    "n": 1
  }
}
```

**Response:**
```json
{
  "urls": ["https://..."],
  "revised_prompt": "A cat astronaut floating in space...",
  "service": "DALL-E"
}
```

---

### Video Generation

```http
POST /video
Content-Type: application/json
```

**Request Body:**
```json
{
  "prompt": "Un timelapse de una flor creciendo",
  "options": {
    "duration": 4,
    "fps": 24,
    "resolution": "1080p"
  }
}
```

**Response:**
```json
{
  "url": "https://...",
  "duration": 4,
  "service": "Runway"
}
```

---

### Audio Generation

```http
POST /audio
Content-Type: application/json
```

**Request Body:**
```json
{
  "input": "Hola, este es un texto para convertir a voz",
  "options": {
    "voice": "es-CO-female",
    "speed": 1.0,
    "format": "mp3"
  }
}
```

**Response:**
```json
{
  "url": "https://...",
  "duration": 3.5,
  "service": "ElevenLabs"
}
```

---

## Códigos de Error

| Código | Significado |
|--------|-------------|
| 400 | Request inválido |
| 401 | API key inválida o no configurada |
| 404 | Endpoint no encontrado |
| 429 | Rate limit excedido |
| 500 | Error interno del servidor |
| 503 | Todos los servicios fallaron |

**Formato de Error:**
```json
{
  "name": "AIServiceError",
  "message": "Rate limit exceeded",
  "service": "Groq",
  "code": "RATE_LIMITED"
}
```

## Variables de Entorno

```env
# Requeridas
PORT=3000
GROQ_API_KEY=...
CEREBRAS_API_KEY=...

# Opcionales (según servicios habilitados)
OPENAI_API_KEY=...
STABILITY_API_KEY=...
RUNWAY_API_KEY=...
ELEVENLABS_API_KEY=...
```
