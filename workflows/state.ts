import type {
  WorkflowStatus,
  WorkflowEvent,
  WorkflowConfig,
  defaultWorkflowConfig,
} from './types';
import { log, logError } from '../lib/date';

type EventCallback = (event: WorkflowEvent) => void;

/**
 * Interface for workflow state management.
 * Implementations handle storage and event distribution.
 */
export interface WorkflowStateManager {
  /** Create a new workflow status entry */
  create(status: WorkflowStatus): Promise<void>;
  /** Get workflow status by ID */
  get(id: string): Promise<WorkflowStatus | null>;
  /** Update workflow status */
  update(id: string, updates: Partial<WorkflowStatus>): Promise<void>;
  /** Delete workflow status */
  delete(id: string): Promise<void>;
  /** Emit an event for a workflow */
  emit(event: WorkflowEvent): Promise<void>;
  /** Subscribe to events for a workflow */
  subscribe(workflowId: string, callback: EventCallback): () => void;
  /** Get all active workflow IDs */
  getActiveIds(): Promise<string[]>;
  /** List all workflows (with optional filters) */
  list(options?: { status?: string; limit?: number }): Promise<WorkflowStatus[]>;
  /** Cleanup expired workflows */
  cleanup(): Promise<number>;
  /** Close connections */
  close(): Promise<void>;
}

// ============ Memory Implementation ============

/**
 * In-memory state manager for workflows.
 * Simple implementation without persistence.
 */
export class MemoryStateManager implements WorkflowStateManager {
  private states = new Map<string, WorkflowStatus>();
  private subscribers = new Map<string, Set<EventCallback>>();
  private ttlMs: number;
  private cleanupInterval?: ReturnType<typeof setInterval>;

  constructor(config: { resultTtlSeconds: number }) {
    this.ttlMs = config.resultTtlSeconds * 1000;
    // Run cleanup every minute
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  async create(status: WorkflowStatus): Promise<void> {
    this.states.set(status.id, status);
  }

  async get(id: string): Promise<WorkflowStatus | null> {
    return this.states.get(id) ?? null;
  }

  async update(id: string, updates: Partial<WorkflowStatus>): Promise<void> {
    const current = this.states.get(id);
    if (current) {
      this.states.set(id, { ...current, ...updates, updatedAt: Date.now() });
    }
  }

  async delete(id: string): Promise<void> {
    this.states.delete(id);
    this.subscribers.delete(id);
  }

  async emit(event: WorkflowEvent): Promise<void> {
    const subs = this.subscribers.get(event.workflowId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event);
        } catch (err) {
          logError(`[Workflow] Error en callback de evento:`, err);
        }
      }
    }
  }

  subscribe(workflowId: string, callback: EventCallback): () => void {
    if (!this.subscribers.has(workflowId)) {
      this.subscribers.set(workflowId, new Set());
    }
    this.subscribers.get(workflowId)!.add(callback);

    return () => {
      const subs = this.subscribers.get(workflowId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.subscribers.delete(workflowId);
        }
      }
    };
  }

  async getActiveIds(): Promise<string[]> {
    const active: string[] = [];
    for (const [id, status] of this.states) {
      if (status.status === 'running' || status.status === 'queued' || status.status === 'pending') {
        active.push(id);
      }
    }
    return active;
  }

  async list(options?: { status?: string; limit?: number }): Promise<WorkflowStatus[]> {
    let workflows = Array.from(this.states.values());
    
    // Filter by status if provided
    if (options?.status) {
      workflows = workflows.filter(w => w.status === options.status);
    }
    
    // Sort by createdAt descending (newest first)
    workflows.sort((a, b) => b.createdAt - a.createdAt);
    
    // Apply limit
    if (options?.limit && options.limit > 0) {
      workflows = workflows.slice(0, options.limit);
    }
    
    return workflows;
  }

  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, status] of this.states) {
      const isTerminal = status.status === 'completed' || status.status === 'failed';
      const isExpired = now - status.updatedAt > this.ttlMs;

      if (isTerminal && isExpired) {
        this.states.delete(id);
        this.subscribers.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log(`[Workflow] Se limpiaron ${cleaned} workflows expirados`);
    }

    return cleaned;
  }

  async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.states.clear();
    this.subscribers.clear();
  }
}

// ============ Redis Implementation ============

/**
 * Redis-based state manager for workflows.
 * Provides persistence and cross-instance event distribution via pub/sub.
 */
export class RedisStateManager implements WorkflowStateManager {
  private redis: import('bun').RedisClient;
  private redisUrl: string;
  private subscriber?: import('bun').RedisClient;
  private localSubscribers = new Map<string, Set<EventCallback>>();
  private ttlSeconds: number;
  private keyPrefix = 'workflow:';
  private channelPrefix = 'workflow:events:';

  constructor(redisUrl: string, config: { resultTtlSeconds: number }) {
    const { RedisClient } = require('bun') as typeof import('bun');
    this.redisUrl = redisUrl;
    this.redis = new RedisClient(redisUrl);
    this.ttlSeconds = config.resultTtlSeconds;
  }

  private key(id: string): string {
    return `${this.keyPrefix}${id}`;
  }

  private channel(id: string): string {
    return `${this.channelPrefix}${id}`;
  }

  async create(status: WorkflowStatus): Promise<void> {
    await this.redis.set(this.key(status.id), JSON.stringify(status));
    await this.redis.expire(this.key(status.id), this.ttlSeconds);
    // Track active workflows
    await this.redis.sadd('workflow:active', status.id);
  }

  async get(id: string): Promise<WorkflowStatus | null> {
    const data = await this.redis.get(this.key(id));
    return data ? JSON.parse(data) : null;
  }

  async update(id: string, updates: Partial<WorkflowStatus>): Promise<void> {
    const current = await this.get(id);
    if (current) {
      const updated = { ...current, ...updates, updatedAt: Date.now() };
      await this.redis.set(this.key(id), JSON.stringify(updated));
      
      // Update TTL on completion
      if (updates.status === 'completed' || updates.status === 'failed') {
        await this.redis.expire(this.key(id), this.ttlSeconds);
        await this.redis.srem('workflow:active', id);
      }
    }
  }

  async delete(id: string): Promise<void> {
    await this.redis.del(this.key(id));
    await this.redis.srem('workflow:active', id);
  }

  async emit(event: WorkflowEvent): Promise<void> {
    // Publish to Redis for cross-instance distribution
    await this.redis.publish(this.channel(event.workflowId), JSON.stringify(event));
    
    // Also notify local subscribers directly
    const subs = this.localSubscribers.get(event.workflowId);
    if (subs) {
      for (const callback of subs) {
        try {
          callback(event);
        } catch (err) {
          logError(`[Workflow] Error en callback de evento:`, err);
        }
      }
    }
  }

  subscribe(workflowId: string, callback: EventCallback): () => void {
    // Track local subscriber
    if (!this.localSubscribers.has(workflowId)) {
      this.localSubscribers.set(workflowId, new Set());
    }
    this.localSubscribers.get(workflowId)!.add(callback);

    // Note: Redis pub/sub is used for cross-instance communication
    // For single instance, local subscribers are sufficient
    // The ensureSubscriber call is intentionally not awaited to avoid blocking
    this.ensureSubscriber(workflowId).catch(err => {
      // Log but don't fail - local subscribers will still work
      logError(`[Workflow] Suscripción Redis falló (eventos locales aún funcionan):`, err);
    });

    return () => {
      const subs = this.localSubscribers.get(workflowId);
      if (subs) {
        subs.delete(callback);
        if (subs.size === 0) {
          this.localSubscribers.delete(workflowId);
        }
      }
    };
  }

  private async ensureSubscriber(workflowId: string): Promise<void> {
    // Skip Redis pub/sub for now - local subscribers handle single instance
    // TODO: Implement proper Bun Redis pub/sub when API is clarified
    // For now, rely on local subscribers which work fine for single instance
    if (!this.subscriber) {
      log(`[Workflow] Redis pub/sub deshabilitado - usando solo distribución de eventos local`);
    }
  }

  async getActiveIds(): Promise<string[]> {
    const members = await this.redis.smembers('workflow:active');
    return members ?? [];
  }

  async list(options?: { status?: string; limit?: number }): Promise<WorkflowStatus[]> {
    // Get all workflow keys - exclude the 'active' set and channel keys
    const pattern = `${this.keyPrefix}*`;
    log(`[Workflow] Querying Redis with pattern: "${pattern}"`);
    
    const keys = await this.redis.keys(pattern);
    
    log(`[Workflow] Redis keys() returned type: ${typeof keys}, isArray: ${Array.isArray(keys)}`);
    log(`[Workflow] Redis keys value: `+ keys);
    log(`[Workflow] Found ${keys?.length ?? 0} keys`);
    
    if (keys && keys.length > 0) {
      log(`[Workflow] First 5 keys: ${keys.slice(0, 5).join(', ')}`);
    }
    
    if (!keys || keys.length === 0) {
      log(`[Workflow] Returning empty array - no keys found`);
      return [];
    }

    // Filter out non-workflow keys (sets, channels, etc.)
    const workflowKeys = keys.filter(key => {
      // Exclude workflow:active (it's a set) and workflow:events:* (channels)
      const isActive = key === 'workflow:active';
      const isChannel = key.startsWith(this.channelPrefix);
      const keep = !isActive && !isChannel;
      if (!keep) {
        log(`[Workflow] Filtering out: ${key}`);
      }
      return keep;
    });

    log(`[Workflow] After filtering: ${workflowKeys.length} workflow keys`);

    // Fetch all workflows
    const workflows: WorkflowStatus[] = [];
    for (const key of workflowKeys) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          const status = JSON.parse(data) as WorkflowStatus;
          // Filter by status if provided
          if (!options?.status || status.status === options.status) {
            workflows.push(status);
            log(`[Workflow] Added workflow ${status.id} with status ${status.status}`);
          } else {
            log(`[Workflow] Skipped workflow ${status.id} - status ${status.status} doesn't match filter ${options.status}`);
          }
        } else {
          log(`[Workflow] Key ${key} returned null/empty data`);
        }
      } catch (err) {
        // Skip invalid entries or keys that aren't strings
        logError(`[Workflow] Error leyendo clave ${key}:`, err);
      }
    }

    log(`[Workflow] Returning ${workflows.length} workflows (filter: ${options?.status ?? 'all'})`);

    // Sort by createdAt descending (newest first)
    workflows.sort((a, b) => b.createdAt - a.createdAt);

    // Apply limit
    if (options?.limit && options.limit > 0) {
      return workflows.slice(0, options.limit);
    }

    return workflows;
  }

  async cleanup(): Promise<number> {
    // Redis handles TTL automatically, but we clean up the active set
    const activeIds = await this.getActiveIds();
    let cleaned = 0;

    for (const id of activeIds) {
      const exists = await this.redis.exists(this.key(id));
      if (!exists) {
        await this.redis.srem('workflow:active', id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      log(`[Workflow] Se limpiaron ${cleaned} referencias de workflows obsoletas`);
    }

    return cleaned;
  }

  async close(): Promise<void> {
    this.redis.close();
    if (this.subscriber) {
      this.subscriber.close();
    }
    this.localSubscribers.clear();
  }
}

// ============ Factory ============

let stateManager: WorkflowStateManager | null = null;

/**
 * Get or create the workflow state manager.
 * Uses Redis if REDIS_URL is set, otherwise uses in-memory storage.
 */
export function getStateManager(config: WorkflowConfig): WorkflowStateManager {
  if (stateManager) {
    return stateManager;
  }

  if (config.redisUrl) {
    log(`[Workflow] Usando gestor de estado Redis`);
    stateManager = new RedisStateManager(config.redisUrl, {
      resultTtlSeconds: config.resultTtlSeconds,
    });
  } else {
    log(`[Workflow] Usando gestor de estado en memoria`);
    stateManager = new MemoryStateManager({
      resultTtlSeconds: config.resultTtlSeconds,
    });
  }

  return stateManager;
}

/**
 * Reset the state manager (for testing).
 */
export async function resetStateManager(): Promise<void> {
  if (stateManager) {
    await stateManager.close();
    stateManager = null;
  }
}
