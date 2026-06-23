import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { ListInstancesResult, WorkflowInstance, WorkflowStatus } from '../types.js';

function instancesDir(overrides: ConfigOverrides = {}): string {
  return getConfig(overrides).dataDir;
}

function instancePath(id: string, overrides: ConfigOverrides = {}): string {
  return join(instancesDir(overrides), `${id}.json`);
}

export function newInstanceId(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `wf_${stamp}_${uuidv4().slice(0, 6)}`;
}

export function saveInstance(instance: WorkflowInstance, overrides: ConfigOverrides = {}): void {
  const dir = instancesDir(overrides);
  mkdirSync(dir, { recursive: true });
  const finalPath = instancePath(instance.id, overrides);
  const tmpPath = `${finalPath}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmpPath, JSON.stringify(instance, null, 2), 'utf-8');
  renameSync(tmpPath, finalPath);
}

export function loadInstance(id: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  const path = instancePath(id, overrides);
  if (!existsSync(path)) throw new Error(`Instance not found: ${id}`);
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as WorkflowInstance;
  } catch (err) {
    const cause = err instanceof Error ? err.message : String(err);
    throw new Error(`Instance file is corrupted: ${path}. ${cause}`);
  }
}

export function listInstances(filter: { status?: WorkflowStatus | 'all'; template?: string } = {}, overrides: ConfigOverrides = {}): ListInstancesResult {
  const dir = instancesDir(overrides);
  if (!existsSync(dir)) return { instances: [], warnings: [] };

  const warnings: string[] = [];
  let instances = readdirSync(dir)
    .filter(file => file.endsWith('.json'))
    .map(file => {
      const path = join(dir, file);
      try {
        return JSON.parse(readFileSync(path, 'utf-8')) as WorkflowInstance;
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
  return listInstances({ status: 'all' }, overrides).instances.find(instance => instance.alias === alias) ?? null;
}

export function resolveInstance(idOrAlias: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  const byAlias = loadInstanceByAlias(idOrAlias, overrides);
  if (byAlias) return byAlias;
  return loadInstance(idOrAlias, overrides);
}

export function ensureAliasAvailable(alias: string, currentInstanceId?: string, overrides: ConfigOverrides = {}): void {
  const existing = loadInstanceByAlias(alias, overrides);
  if (existing && existing.id !== currentInstanceId) {
    throw new Error(`Alias already bound to instance ${existing.id}: ${alias}`);
  }
}

export function bindAlias(instanceId: string, alias: string, overrides: ConfigOverrides = {}): WorkflowInstance {
  if (!alias.trim()) throw new Error('Alias must not be empty');
  const instance = loadInstance(instanceId, overrides);
  ensureAliasAvailable(alias, instanceId, overrides);
  instance.alias = alias;
  instance.updated_at = new Date().toISOString();
  saveInstance(instance, overrides);
  return instance;
}
