import { format } from 'date-fns';
import { toZonedTime } from 'date-fns-tz';

const TIMEZONE = 'America/Bogota';

export function now(): Date {
  return toZonedTime(new Date(), TIMEZONE);
}

export function timestamp(): string {
  return format(now(), "yyyy-MM-dd'T'HH:mm:ss.SSSxxx");
}

export function log(message: string): void {
  console.log(`[${timestamp()}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
  console.error(`[${timestamp()}] ${message}`, error ?? '');
}

export interface RequestLogInfo {
  method: string;
  path: string;
  status: number;
  duration: number;
  ip?: string;
  params?: Record<string, any>;
}

export function logRequest(info: RequestLogInfo): void {
  const statusColor = info.status >= 500 ? '\x1b[31m' : // red
                      info.status >= 400 ? '\x1b[33m' : // yellow
                      info.status >= 300 ? '\x1b[36m' : // cyan
                      '\x1b[32m'; // green
  const reset = '\x1b[0m';
  
  const ip = info.ip ? `${info.ip} - ` : '';
  
  let params = '';
  if (info.params) {
    const MAX_TEXT_LENGTH = 100;
    const truncated = { ...info.params };
    
    // Truncate long text fields
    if (typeof truncated.prompt === 'string' && truncated.prompt.length > MAX_TEXT_LENGTH) {
      truncated.prompt = truncated.prompt.slice(0, MAX_TEXT_LENGTH) + '...';
    }
    if (typeof truncated.input === 'string' && truncated.input.length > MAX_TEXT_LENGTH) {
      truncated.input = truncated.input.slice(0, MAX_TEXT_LENGTH) + '...';
    }
    
    params = ` | params: ${JSON.stringify(truncated)}`;
  }
  
  console.log(
    `[${timestamp()}] ${ip}${info.method} ${info.path} ${statusColor}${info.status}${reset} ${info.duration}ms${params}`
  );
}
