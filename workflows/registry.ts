import type { WorkflowDefinition } from './types';
import { log } from '../lib/date';

/**
 * Registry for predefined workflows.
 * Manages workflow definitions by name.
 */
export class WorkflowRegistry {
  private workflows = new Map<string, WorkflowDefinition>();

  /**
   * Register a workflow definition.
   * @returns this for chaining
   */
  register(definition: WorkflowDefinition): this {
    if (this.workflows.has(definition.name)) {
      log(`[WorkflowRegistry] Sobrescribiendo workflow: ${definition.name}`);
    } else {
      log(`[WorkflowRegistry] Workflow registrado: ${definition.name} (${definition.steps.length} pasos)`);
    }
    this.workflows.set(definition.name, definition);
    return this;
  }

  /**
   * Get a workflow definition by name.
   */
  get(name: string): WorkflowDefinition | undefined {
    return this.workflows.get(name);
  }

  /**
   * Check if a workflow exists.
   */
  has(name: string): boolean {
    return this.workflows.has(name);
  }

  /**
   * Get all registered workflow names.
   */
  list(): string[] {
    return Array.from(this.workflows.keys());
  }

  /**
   * Get all workflow definitions with metadata.
   */
  getAll(): Array<{
    name: string;
    description?: string;
    steps: number;
  }> {
    return Array.from(this.workflows.values()).map(w => ({
      name: w.name,
      description: w.description,
      steps: w.steps.length,
    }));
  }

  /**
   * Remove a workflow by name.
   */
  unregister(name: string): boolean {
    const deleted = this.workflows.delete(name);
    if (deleted) {
      log(`[WorkflowRegistry] Workflow desregistrado: ${name}`);
    }
    return deleted;
  }

  /**
   * Clear all workflows.
   */
  clear(): void {
    this.workflows.clear();
    log(`[WorkflowRegistry] Todos los workflows eliminados`);
  }
}

// Singleton instance
export const workflowRegistry = new WorkflowRegistry();
