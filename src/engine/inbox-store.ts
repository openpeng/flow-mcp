import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs';
import { dirname } from 'path';
import { v4 as uuidv4 } from 'uuid';
import { getConfig, type ConfigOverrides } from '../config.js';
import type { InboxEntry, InboxStatus, InboxSummary } from '../types.js';
import { assertInstanceId, safeJoin } from './security.js';

export interface InboxEntryInput {
  source: InboxEntry['source'];
  type: InboxEntry['type'];
  title: string;
  summary: string;
  action_required?: boolean;
  timestamp?: string;
  external_id?: string;
  url?: string;
}

export interface InboxListFilter {
  status?: InboxStatus;
  action_required?: boolean;
  limit?: number;
}

export interface InboxSaveResult {
  saved_count: number;
  duplicate_count: number;
  entries: InboxEntry[];
}

function inboxDir(overrides: ConfigOverrides = {}): string {
  return safeJoin(getConfig(overrides).dataDir, 'inbox');
}

function inboxPath(instanceId: string, overrides: ConfigOverrides = {}): string {
  assertInstanceId(instanceId);
  return safeJoin(inboxDir(overrides), `${instanceId}.json`);
}

export function saveInboxEntries(instanceId: string, entries: InboxEntryInput[], overrides: ConfigOverrides = {}): InboxSaveResult {
  assertInstanceId(instanceId);
  const existing = readInbox(instanceId, overrides);
  let savedCount = 0;
  let duplicateCount = 0;
  const saved: InboxEntry[] = [];

  for (const input of entries) {
    const timestamp = input.timestamp ?? new Date().toISOString();
    const { key, strategy } = dedup(input, timestamp);
    const duplicate = existing.find(entry => entry.dedup_key === key);
    if (duplicate) {
      duplicateCount++;
      saved.push(duplicate);
      continue;
    }
    const entry: InboxEntry = {
      id: `inbox_${uuidv4().slice(0, 12)}`,
      instance_id: instanceId,
      source: input.source,
      type: input.type,
      title: input.title,
      summary: input.summary,
      action_required: input.action_required ?? false,
      status: 'new',
      timestamp,
      ...(input.external_id ? { external_id: input.external_id } : {}),
      ...(input.url ? { url: input.url } : {}),
      dedup_key: key,
      dedup_strategy: strategy,
    };
    existing.push(entry);
    saved.push(entry);
    savedCount++;
  }

  writeInbox(instanceId, existing, overrides);
  return { saved_count: savedCount, duplicate_count: duplicateCount, entries: saved };
}

export function listInboxEntries(instanceId: string, filter: InboxListFilter = {}, overrides: ConfigOverrides = {}): InboxEntry[] {
  let entries = readInbox(instanceId, overrides)
    .filter(entry => !filter.status || entry.status === filter.status)
    .filter(entry => filter.action_required === undefined || entry.action_required === filter.action_required)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  if (filter.limit !== undefined) entries = entries.slice(0, normalizeLimit(filter.limit));
  return entries;
}

export function markInboxEntries(instanceId: string, ids: string[], status: InboxStatus, overrides: ConfigOverrides = {}): { updated_count: number; entries: InboxEntry[] } {
  const entries = readInbox(instanceId, overrides);
  const idSet = new Set(ids);
  let updated = 0;
  for (const entry of entries) {
    if (idSet.has(entry.id) && entry.status !== status) {
      entry.status = status;
      updated++;
    }
  }
  writeInbox(instanceId, entries, overrides);
  return { updated_count: updated, entries: entries.filter(entry => idSet.has(entry.id)) };
}

export function summarizeInbox(instanceId: string, overrides: ConfigOverrides = {}): InboxSummary {
  const entries = readInbox(instanceId, overrides);
  const byStatus: Record<InboxStatus, number> = { new: 0, seen: 0, acted: 0 };
  for (const entry of entries) byStatus[entry.status]++;
  return {
    total: entries.length,
    unread: byStatus.new,
    action_required: entries.filter(entry => entry.action_required && entry.status !== 'acted').length,
    by_status: byStatus,
    latest_timestamp: entries.map(entry => entry.timestamp).sort().at(-1),
  };
}

function readInbox(instanceId: string, overrides: ConfigOverrides): InboxEntry[] {
  const path = inboxPath(instanceId, overrides);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as InboxEntry[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeInbox(instanceId: string, entries: InboxEntry[], overrides: ConfigOverrides): void {
  const path = inboxPath(instanceId, overrides);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
  writeFileSync(tmp, JSON.stringify(entries, null, 2), 'utf-8');
  renameSync(tmp, path);
}

function dedup(input: InboxEntryInput, timestamp: string): { key: string; strategy: InboxEntry['dedup_strategy'] } {
  if (input.external_id) return { key: input.external_id, strategy: 'external_id' };
  return { key: `${input.source}:${input.type}:${input.title}:${timestamp.slice(0, 10)}`, strategy: 'fallback' };
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit < 1) throw new Error('INVALID_ARGUMENT: limit must be a positive number');
  return Math.min(Math.floor(limit), 200);
}
