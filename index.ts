import { groqService } from "./services/text_to_text/groq";
import { cerebrasService } from "./services/text_to_text/cerebras";
import { pollinationsTextService } from "./services/text_to_text/pollinations";
import { geminiService } from "./services/text_to_text/gemini";
import { groqVisionService } from "./services/vision_to_text/groq";
import { pollinationsImageService } from "./services/image_to_image/pollinations";
import {
  registry,
  TextServiceExecutor,
  VisionServiceExecutor,
  ImageServiceExecutor,
  VideoServiceExecutor,
  AudioServiceExecutor,
  AIServiceError,
  log,
  logError,
  logRequest,
  validateApiKey,
  isPublicRoute,
} from "./lib";
import type { ChatMessage, VisionMessage } from "./lib";
import {
  workflowRegistry,
  getWorkflowExecutor,
  type WorkflowEvent,
} from "./workflows";

// Register all services
registry
  .register(groqService)
  .register(cerebrasService)
  .register(pollinationsTextService)
  .register(geminiService)
  .register(groqVisionService)
  .register(pollinationsImageService);
// .register(dalleService)      // future: image
// .register(stabilityService)  // future: image
// .register(runwayService)     // future: video

const executorConfig = {
  maxRetries: 3,
  baseDelayMs: 500,
  maxDelayMs: 5000,
};

// Create executors for each category (only instantiate if services exist)
const textExecutor = new TextServiceExecutor(
  registry.getAll("text"),
  executorConfig,
);

// Lazy executors for categories that may not have services yet
const getVisionExecutor = () =>
  new VisionServiceExecutor(registry.getAll("vision"), executorConfig);
const getImageExecutor = () =>
  new ImageServiceExecutor(registry.getAll("image"), executorConfig);
const getVideoExecutor = () =>
  new VideoServiceExecutor(registry.getAll("video"), executorConfig);
const getAudioExecutor = () =>
  new AudioServiceExecutor(registry.getAll("audio"), executorConfig);

// Workflow executor (shared instance)
const workflowExecutor = getWorkflowExecutor();

const server = Bun.serve({
  port: process.env.PORT ?? 3000,
  idleTimeout: 255, // 5 minutes - needed for long SSE connections (workflows)
  async fetch(req) {
    const start = performance.now();
    const { pathname } = new URL(req.url);
    const ip = this.requestIP(req)?.address;

    // Capture request body for logging (clone to avoid consuming it)
    let requestParams: Record<string, any> | undefined; 
    if (req.method === 'POST' && req.headers.get('content-type')?.includes('application/json')) {
      try {
        const clonedReq = req.clone();
        requestParams = await clonedReq.json() as Record<string, any>;
      } catch {
        // Ignore JSON parsing errors for logging
      }
    }

    const response = await handleRequest(req, pathname);

    logRequest({
      method: req.method,
      path: pathname,
      status: response.status,
      duration: Math.round(performance.now() - start),
      ip,
      params: requestParams,
    });

    return response;
  },
});

async function handleRequest(
  req: Request,
  pathname: string,
): Promise<Response> {
  // Auth middleware - skip for public routes
  if (!isPublicRoute(pathname)) {
    const auth = validateApiKey(req);
    if (!auth.success) {
      return auth.error!;
    }
  }

  // Health check / service info
  if (req.method === "GET" && pathname === "/") {
    return Response.json({
      status: "ok",
      services: registry.getStats(),
      categories: registry.getCategories(),
    });
  }

  // Text generation (chat)
  if (req.method === "POST" && pathname === "/text") {
    return handleTextGeneration(req);
  }

  // Legacy endpoint - redirects to /text
  if (req.method === "POST" && pathname === "/chat") {
    return handleTextGeneration(req);
  }

  // Vision analysis (image understanding)
  if (req.method === "POST" && pathname === "/vision") {
    return handleVisionAnalysis(req);
  }

  // Image generation
  if (req.method === "POST" && pathname === "/image") {
    return handleImageGeneration(req);
  }

  // Video generation
  if (req.method === "POST" && pathname === "/video") {
    return handleVideoGeneration(req);
  }

  // Audio generation
  if (req.method === "POST" && pathname === "/audio") {
    return handleAudioGeneration(req);
  }

  // Workflow endpoints
  // GET /workflow - list available workflows
  if (req.method === "GET" && pathname === "/workflow") {
    return Response.json({
      workflows: workflowRegistry.getAll(),
      queue: workflowExecutor.getQueueSize(),
      running: workflowExecutor.getRunningCount(),
    });
  }

  // GET /workflow/history - list executed workflows
  if (req.method === "GET" && pathname === "/workflow/history") {
    const url = new URL(req.url);
    const status = url.searchParams.get("status") || undefined;
    const limit = parseInt(url.searchParams.get("limit") || "50", 10);
    
    const workflows = await workflowExecutor.listWorkflows({ status, limit });
    return Response.json({
      workflows,
      total: workflows.length,
    });
  }

  // POST /workflow/:name - start a workflow
  const workflowStartMatch = pathname.match(/^\/workflow\/([^/]+)$/);
  if (req.method === "POST" && workflowStartMatch) {
    return handleWorkflowStart(req, workflowStartMatch[1]!);
  }

  // GET /workflow/:id/status - get workflow status
  const workflowStatusMatch = pathname.match(/^\/workflow\/([^/]+)\/status$/);
  if (req.method === "GET" && workflowStatusMatch) {
    return handleWorkflowStatus(workflowStatusMatch[1]!);
  }

  // GET /workflow/:id/stream - SSE stream for workflow events
  const workflowStreamMatch = pathname.match(/^\/workflow\/([^/]+)\/stream$/);
  if (req.method === "GET" && workflowStreamMatch) {
    return handleWorkflowStream(workflowStreamMatch[1]!);
  }

  return new Response("No encontrado", { status: 404 });
}

async function handleTextGeneration(req: Request): Promise<Response> {
  try {
    const { messages } = (await req.json()) as { messages: ChatMessage[] };
    const { result: stream, service } = await textExecutor.execute(messages);
    console.log("Servicio usado:", service);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-AI-Service": service,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

async function handleVisionAnalysis(req: Request): Promise<Response> {
  try {
    if (!registry.hasCategory("vision")) {
      throw new AIServiceError(
        "No hay servicios de análisis de visión configurados",
        "registry",
        "SERVICE_ERROR",
      );
    }

    const { messages } = (await req.json()) as { messages: VisionMessage[] };
    const { result: stream, service } = await getVisionExecutor().execute(messages);
    console.log("Servicio usado:", service);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-AI-Service": service,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}

async function handleImageGeneration(req: Request): Promise<Response> {
  try {
    if (!registry.hasCategory("image")) {
      throw new AIServiceError(
        "No hay servicios de generación de imágenes configurados",
        "registry",
        "SERVICE_ERROR",
      );
    }

    const { prompt, options } = (await req.json()) as {
      prompt: string;
      options?: any;
    };
    const { result, service } = await getImageExecutor().execute({
      prompt,
      options,
    });

    return Response.json({ ...result, service });
  } catch (err) {
    return handleError(err);
  }
}

async function handleVideoGeneration(req: Request): Promise<Response> {
  try {
    if (!registry.hasCategory("video")) {
      throw new AIServiceError(
        "No hay servicios de generación de video configurados",
        "registry",
        "SERVICE_ERROR",
      );
    }

    const { prompt, options } = (await req.json()) as {
      prompt: string;
      options?: any;
    };
    const { result, service } = await getVideoExecutor().execute({
      prompt,
      options,
    });

    return Response.json({ ...result, service });
  } catch (err) {
    return handleError(err);
  }
}

async function handleAudioGeneration(req: Request): Promise<Response> {
  try {
    if (!registry.hasCategory("audio")) {
      throw new AIServiceError(
        "No hay servicios de generación de audio configurados",
        "registry",
        "SERVICE_ERROR",
      );
    }

    const { input, options } = (await req.json()) as {
      input: string;
      options?: any;
    };
    const { result, service } = await getAudioExecutor().execute({
      input,
      options,
    });

    return Response.json({ ...result, service });
  } catch (err) {
    return handleError(err);
  }
}

// ============ Workflow Handlers ============

async function handleWorkflowStart(req: Request, workflowName: string): Promise<Response> {
  try {
    const definition = workflowRegistry.get(workflowName);
    if (!definition) {
      return Response.json(
        { error: `Workflow "${workflowName}" no encontrado`, disponibles: workflowRegistry.list() },
        { status: 404 }
      );
    }

    const body = await req.json() as { input: unknown };
    const workflowId = await workflowExecutor.submit(definition, body.input);

    return Response.json({
      workflowId,
      name: workflowName,
      status: 'queued',
      statusUrl: `/workflow/${workflowId}/status`,
      streamUrl: `/workflow/${workflowId}/stream`,
    }, { status: 202 });
  } catch (err) {
    return handleError(err);
  }
}

async function handleWorkflowStatus(workflowId: string): Promise<Response> {
  try {
    const status = await workflowExecutor.getStatus(workflowId);
    if (!status) {
      return Response.json(
        { error: `Workflow "${workflowId}" no encontrado` },
        { status: 404 }
      );
    }

    return Response.json(status);
  } catch (err) {
    return handleError(err);
  }
}

function handleWorkflowStream(workflowId: string): Response {
  const encoder = new TextEncoder();
  let isClosed = false;

  const stream = new ReadableStream({
    start(controller) {
      // Send initial connection event
      const sendEvent = (event: string, data: unknown) => {
        if (isClosed) return; // Guard against closed controller
        try {
          controller.enqueue(encoder.encode(`event: ${event}\n`));
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          // Controller might be closed, ignore
          isClosed = true;
        }
      };

      const safeClose = () => {
        if (isClosed) return;
        isClosed = true;
        try {
          controller.close();
        } catch {
          // Already closed
        }
      };

      sendEvent('connected', { workflowId, timestamp: Date.now() });

      // Check if workflow exists and get current status
      workflowExecutor.getStatus(workflowId).then(status => {
        if (!status) {
          sendEvent('error', { message: `Workflow "${workflowId}" no encontrado` });
          safeClose();
          return;
        }

        // Send current status
        sendEvent('status', status);

        // If already completed or failed, close stream
        if (status.status === 'completed' || status.status === 'failed') {
          safeClose();
          return;
        }

        // Subscribe to events
        const unsubscribe = workflowExecutor.subscribe(workflowId, (event: WorkflowEvent) => {
          sendEvent(event.type, event.data);

          // Close stream when workflow completes or fails
          if (event.type === 'workflow:complete' || event.type === 'workflow:failed') {
            setTimeout(() => {
              unsubscribe();
              safeClose();
            }, 100);
          }
        });
      }).catch(err => {
        sendEvent('error', { message: err instanceof Error ? err.message : 'Error desconocido' });
        safeClose();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Workflow-Id': workflowId,
    },
  });
}

function handleError(err: unknown): Response {
  if (err instanceof AIServiceError) {
    const status =
      err.code === "RATE_LIMITED"
        ? 429
        : err.code === "AUTH_FAILED"
          ? 401
          : err.code === "INVALID_REQUEST"
            ? 400
            : 503;

    return Response.json(err.toJSON(), { status });
  }

  logError("Error inesperado:", err);
  return Response.json({ error: "Error interno del servidor" }, { status: 500 });
}

log(`Servidor corriendo en ${server.url}`);
log(`Servicios disponibles: ${JSON.stringify(registry.getStats())}`);
