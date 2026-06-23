import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmdirSync, writeFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { ListInstancesResult, WorkflowInstance, WorkflowStatus } from '../types.js';
import { assertInstanceSize } from './limits.js';
import { recordEvent } from './event-log.js';
import { assertAlias, assertInstanceId, isInstanceId, safeJoin } from './security.js';

function instancesDir(overrides: ConfigOverrides = {}): string {
  return getConfig(overrides).dataDir;
}

function instancePath(id: string, overrides: ConfigOverrides = {}): string {
  assertInstanceId(id);
  return safeJoin(instancesDir(overrides), `${id}.json`);
}

function lockPath(id: string, overrides: ConfigOverrides = {}): string {
  assertInstanceId(id);
  return safeJoin(instancesDir(overrides), `${id}.lock`);
}

function withInstanceLock<T>(id: string, overrides: ConfigOverrides, fn: () => T): T {
  const path = lockPath(id, overrides);
  try {
    mkdirSync(path);
  } catch {
    throw new Error(`INSTANCE_LOCKED: ${id}`);
  }
  try {
    return fn();
  } finally {
    try { rmdirSync(path); } catch { /* best effort cleanup */ }
  }
}

export function newInstanceId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `wf_${stamp}_${uuidv4().slice(0, 6)}`;
}

export interface SaveInstanceOptions {
  expectedVersion?: number;
}

export function saveInstance(instance: WorkflowInstance, overrides: ConfigOverrides = {}, options: SaveInstanceOptions = {}): WorkflowInstance {
  const dir = instancesDir(overrides);
  mkdirSync(dir, { recursive: true });
  return withInstanceLock(instance.id, overrides, () => {
    const finalPath = instancePath(instance.id, overrides);
    const exists = existsSync(finalPath);

    if (exists) {
      const current = loadInstance(instance.id, overrides);
      if (options.expectedVersion !== undefined && current.version !== options.expectedVersion) {
        try {
          recordEvent('instance.conflict_detected', instance.id, { expectedVersion: options.expectedVersion, actualVersion: current.version }, undefined, overrides);
        } catch {
          // Preserve the conflict error even if audit logging is unavailable.
        }
        throw new Error(`INSTANCE_VERSION_CONFLICT: Instance changed, reload before retrying`);
      }
      instance.version = current.version + 1;
    } else {
      instance.version = instance.version || 1;
    }

    assertInstanceSize(instance);
    const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(instance, null, 2), 'utf-8');
    renameSync(tmpPath, finalPath);
    return instance;
  });
}

export function loadInstance(id: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  const path = instancePath(id, overrides);
  if (!existsSync(path)) throw new Error(`Instance not found: ${id}`);
  try {
    return normalizeInstance(JSON.parse(readFileSync(path, 'utf-8')) as WorkflowInstance);
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Instance file is corrupted: ${path}. ${cause}`);
  }
}

function normalizeInstance(instance: WorkflowInstance): WorkflowInstance {
  return {
    ...instance,
    version: instance.version || 1,
    prompt_overrides: instance.prompt_overrides ?? {},
    token_usage: instance.token_usage ?? { total_consumed: 0, per_step: {} },
  };
}

export function listInstances(filter: { status?: WorkflowStatus | 'all'; template?: string } = {}, overrides: ConfigOverrides = {}): ListInstancesResult {
  const dir = instancesDir(overrides);
  if (!existsSync(dir)) return { instances: [], warnings: [] };

  const warnings: string[] = [];
  let instances = readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const path = safeJoin(dir, file);
      try {
        return normalizeInstance(JSON.parse(readFileSync(path, 'utf-8')) as WorkflowInstance);
      } catch (err) {
        const cause = err instanceof Error ? err.message : String(err);
        warnings.push(`Skipped corrupted instance ${path}: ${cause}`);
        return null;
      }
    })
    .filter((instance): instance is WorkflowInstance => instance !== null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  if (filter.status && filter.status !== 'all') {
    instances = instances.filter(instance => instance.status === filter.status);
  }
  if (filter.template) {
    instances = instances.filter(instance => instance.template === filter.template);
  }

  return { instances, warnings };
}

export function loadInstanceByAlias(alias: string, overrides: ConfigOverrides = {}): WorkflowInstance | null {
  assertAlias(alias);
  return listInstances({ status: 'all' }, overrides).instances.find(instance => instance.alias === alias) ?? null;
}

export function resolveInstance(idOrAlias: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  if (isInstanceId(idOrAlias)) return loadInstance(idOrAlias, overrides);
  return loadInstanceByAlias(idOrAlias, overrides) ?? (() => { throw new Error(`Instance not found: ${idOrAlias}`); })();
}

export function ensureAliasAvailable(alias: string, currentInstanceId?: string, overrides: ConfigOverrides = {}): void {
  assertAlias(alias);
  const existing = loadInstanceByAlias(alias, overrides);
  if (existing && existing.id !== currentInstanceId) {
    throw new Error(`Alias already bound to instance ${existing.id}: ${alias}`);
  }
}

export function bindAlias(instanceId: string, alias: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  assertAlias(alias);
  const instance = loadInstance(instanceId, overrides);
  ensureAliasAvailable(alias, instanceId, overrides);
  const expectedVersion = instance.version;
  instance.alias = alias;
  instance.updated_at = new Date().toISOString();
  const saved = saveInstance(instance, overrides, { expectedVersion });
  recordEvent('alias.bound', saved.id, { alias }, undefined, overrides);
  return saved;
}
