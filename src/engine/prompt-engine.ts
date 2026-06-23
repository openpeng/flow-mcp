import type { WorkflowInstance } from '../types.js';

export function interpolate(text: string, vars: Record<string, unknown>): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (match, key: string) => {
    const value = key.trim().split('.').reduce<unknown>((obj, part) => {
      if (obj && typeof obj === 'object') {
        return (obj as Record<string, unknown>)[part];
      }
      return undefined;
    }, vars);

    return value !== undefined ? String(value) : match;
  });
}

export function buildPromptContext(instance: WorkflowInstance): Record<string, unknown> {
  const context: Record<string, unknown> = { ...instance.params, steps: {} };
  const steps = context.steps as Record<string, unknown>;
  for (const [id, step] of Object.entries(instance.steps)) {
    steps[id] = { outputs: step.outputs ?? {} };
  }
  return context;
}

export function renderPrompt(promptText: string, instance: WorkflowInstance): string {
  return interpolate(promptText, buildPromptContext(instance));
}
