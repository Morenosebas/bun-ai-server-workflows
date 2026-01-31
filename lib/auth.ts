import { AIServiceError } from './errors';

const API_KEY = process.env.API_KEY;

export interface AuthResult {
  success: boolean;
  error?: Response;
}

/**
 * Validates the API key from the request header.
 * Expects: Authorization: Bearer <api_key>
 */
export function validateApiKey(req: Request): AuthResult {
  // Skip auth if no API_KEY is configured (development mode)
  if (!API_KEY) {
    return { success: true };
  }

  const authHeader = req.headers.get('Authorization');
  
  if (!authHeader) {
    return {
      success: false,
      error: Response.json(
        { error: 'Falta el header Authorization' },
        { status: 401 }
      ),
    };
  }

  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return {
      success: false,
      error: Response.json(
        { error: 'Formato de Authorization inválido. Esperado: Bearer <api_key>' },
        { status: 401 }
      ),
    };
  }

  if (token !== API_KEY) {
    return {
      success: false,
      error: Response.json(
        { error: 'API key inválida' },
        { status: 403 }
      ),
    };
  }

  return { success: true };
}

/**
 * List of public routes that don't require authentication
 */
const PUBLIC_ROUTES = ['/', '/health'];

/**
 * Check if a route is public (no auth required)
 */
export function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.includes(pathname);
}
