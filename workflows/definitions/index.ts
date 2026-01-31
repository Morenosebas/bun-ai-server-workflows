/**
 * Workflow Definitions
 * Barrel export for all predefined workflows
 */

import { workflowRegistry } from "../registry";

// Import workflows

// ============ Register All Workflows ============

workflowRegistry.register(multiImageCreativeDirector);

// ============ Exports ============

// Re-export individual workflows

// Export collection for direct access
export const definitions = {
  multiImageCreativeDirector,
};
