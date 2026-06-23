import { resolve, sep } from 'path';

const TEMPLATE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const STEP_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const INSTANCE_ID_RE = /^wf_\d{14}_[A-Za-z0-9-]{6}$/;
const ALIAS_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const WINDOWS_RESERVED_NAMES = new Set(['CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4', 'COM5', 'COM6', 'COM7', 'COM8', 'COM9', 'LPT1', 'LPT2', 'LPT3', 'LPT4', 'LPT5', 'LPT6', 'LPT7', 'LPT8', 'LPT9']);

function hasReservedName(value: string): boolean {
  const base = value.split('.')[0].toUpperCase();
  return WINDOWS_RESERVED_NAMES.has(base) || value.startsWith('.');
}

export function assertTemplateName(name: string): void {
  if (!TEMPLATE_NAME_RE.test(name) || hasReservedName(name)) throw new Error(`INVALID_TEMPLATE_NAME: ${name}`);
}

export function assertStepId(id: string): void {
  if (!STEP_ID_RE.test(id) || hasReservedName(id)) throw new Error(`INVALID_STEP_ID: ${id}`);
}

export function assertInstanceId(id: string): void {
  if (!INSTANCE_ID_RE.test(id)) throw new Error(`INVALID_INSTANCE_ID: ${id}`);
}

export function assertAlias(alias: string): void {
  if (!ALIAS_RE.test(alias) || hasReservedName(alias)) throw new Error(`INVALID_ALIAS: ${alias}`);
}

export function isInstanceId(value: string): boolean {
  return INSTANCE_ID_RE.test(value);
}

export function safeJoin(baseDir: string, ...segments: string[]): string {
  const base = resolve(baseDir);
  const target = resolve(base, ...segments);
  if (target !== base && !target.startsWith(base.endsWith(sep) ? base : `${base}${sep}`)) {
    throw new Error(`PATH_OUTSIDE_BASE_DIR: ${target}`);
  }
  return target;
}
