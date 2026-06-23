export const MAX_PROMPT_BYTES = 256 * 1024;
export const MAX_OUTPUTS_BYTES = 512 * 1024;
export const MAX_INSTANCE_BYTES = 1024 * 1024;
export const OUTPUT_PREVIEW_CHARS = 200;

export interface OutputSummary {
  output_keys: string[];
  outputs_preview: Record<string, string>;
}

export function byteLength(value: unknown): number {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Buffer.byteLength(text ?? '', 'utf-8');
}

export function assertPromptSize(prompt: string): void {
  const size = byteLength(prompt);
  if (size > MAX_PROMPT_BYTES) throw new Error(`PROMPT_TOO_LARGE: ${size} > ${MAX_PROMPT_BYTES}`);
}

export function assertOutputsSize(outputs: Record<string, unknown>): void {
  const size = byteLength(outputs);
  if (size > MAX_OUTPUTS_BYTES) throw new Error(`OUTPUTS_TOO_LARGE: ${size} > ${MAX_OUTPUTS_BYTES}`);
}

export function assertInstanceSize(instance: unknown): void {
  const size = byteLength(instance);
  if (size > MAX_INSTANCE_BYTES) throw new Error(`INSTANCE_TOO_LARGE: ${size} > ${MAX_INSTANCE_BYTES}`);
}

export function summarizeOutputs(outputs?: Record<string, unknown>): OutputSummary | undefined {
  if (!outputs) return undefined;
  const previews: Record<string, string> = {};
  for (const [key, value] of Object.entries(outputs)) {
    const raw = typeof value === 'string' ? value : JSON.stringify(value);
    const text = raw ?? '';
    previews[key] = text.length > OUTPUT_PREVIEW_CHARS ? `${text.slice(0, OUTPUT_PREVIEW_CHARS)}…` : text;
  }
  return { output_keys: Object.keys(outputs), outputs_preview: previews };
}
