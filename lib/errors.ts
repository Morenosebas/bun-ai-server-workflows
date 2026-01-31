export class AIServiceError extends Error {
  constructor(
    message: string,
    public readonly serviceName: string,
    public readonly code: AIErrorCode,
    public override readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "AIServiceError";
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      service: this.serviceName,
      code: this.code,
    };
  }
}

export type AIErrorCode =
  | "RATE_LIMITED"
  | "AUTH_FAILED"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT"
  | "INVALID_REQUEST"
  | "SERVICE_ERROR"
  | "NETWORK_ERROR";

export function classifyError(
  error: unknown,
  serviceName: string,
): AIServiceError {
  const message = error instanceof Error ? error.message : String(error);
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("rate") || lowerMessage.includes("429")) {
    return new AIServiceError(
      "Límite de peticiones excedido",
      serviceName,
      "RATE_LIMITED",
      error,
    );
  }
  if (
    lowerMessage.includes("auth") ||
    lowerMessage.includes("401") ||
    lowerMessage.includes("api key")
  ) {
    return new AIServiceError(
      "Error de autenticación",
      serviceName,
      "AUTH_FAILED",
      error,
    );
  }
  if (lowerMessage.includes("model") || lowerMessage.includes("not found")) {
    return new AIServiceError(
      "Modelo no disponible",
      serviceName,
      "MODEL_UNAVAILABLE",
      error,
    );
  }
  if (lowerMessage.includes("timeout") || lowerMessage.includes("timed out")) {
    return new AIServiceError("Tiempo de espera agotado", serviceName, "TIMEOUT", error);
  }
  if (lowerMessage.includes("invalid") || lowerMessage.includes("400")) {
    return new AIServiceError(
      "Solicitud inválida",
      serviceName,
      "INVALID_REQUEST",
      error,
    );
  }
  if (
    lowerMessage.includes("network") ||
    lowerMessage.includes("fetch") ||
    lowerMessage.includes("econnrefused")
  ) {
    return new AIServiceError(
      "Error de red",
      serviceName,
      "NETWORK_ERROR",
      error,
    );
  }

  return new AIServiceError(message, serviceName, "SERVICE_ERROR", error);
}

/** Errors that should trigger fallback to next service */
export function isRetryable(code: AIErrorCode): boolean {
  return [
    "RATE_LIMITED",
    "TIMEOUT",
    "SERVICE_ERROR",
    "NETWORK_ERROR",
    "MODEL_UNAVAILABLE",
  ].includes(code);
}
