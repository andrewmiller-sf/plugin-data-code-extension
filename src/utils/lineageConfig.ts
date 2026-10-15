/*
 * Copyright 2026, Salesforce, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { promises as fs } from 'node:fs';
import { type LineageEntry } from './lineageRunner.js';

export type LineageDiff = {
  added: string[];
  removed: string[];
  changed: string[];
};

/**
 * How long lineage confirmation prompts wait before declining. The sf default of 10s is too short to
 * review the warnings and diff. Must stay finite: Node fires timers over ~24.8 days after 1ms.
 */
export const LINEAGE_CONFIRM_TIMEOUT_MS = 10 * 60 * 1000;

/** Objects referenced by lineage but missing from `permissions`, i.e. a 1041/1042 at deploy. */
export type LineagePermissionGaps = {
  targets: string[];
  sources: string[];
};

/** The `dataLineage` entries in a config, or `[]` when the section is absent or malformed. */
export function readLineage(config: Record<string, unknown>): LineageEntry[] {
  const section = config.dataLineage;
  if (!Array.isArray(section)) return [];
  return section.filter(
    (entry): entry is LineageEntry =>
      typeof entry === 'object' &&
      entry !== null &&
      typeof (entry as LineageEntry).targetField === 'string' &&
      Array.isArray((entry as LineageEntry).sourceFields) &&
      (entry as LineageEntry).sourceFields.every((field) => typeof field === 'string')
  );
}

/** True when the config has a `dataLineage` section that isn't an empty array. */
export function hasLineageSection(config: Record<string, unknown>): boolean {
  const section = config.dataLineage;
  return section !== undefined && !(Array.isArray(section) && section.length === 0);
}

/**
 * True when the config's `dataLineage` has entries `readLineage` drops, or repeats a target
 * field. Targets compare case-insensitively, as deploy validation does.
 */
export function hasInvalidLineage(config: Record<string, unknown>): boolean {
  const section = config.dataLineage;
  if (section === undefined) return false;
  if (!Array.isArray(section)) return true;
  const entries = readLineage(config);
  if (entries.length !== section.length) return true;
  return new Set(entries.map((entry) => entry.targetField.toLowerCase())).size !== entries.length;
}

/** Per-target difference between the current `dataLineage` and a generated one. */
export function diffLineage(current: LineageEntry[], generated: LineageEntry[]): LineageDiff {
  const key = (entry: LineageEntry): string => [...entry.sourceFields].sort().join('\n');
  const before = new Map(current.map((entry) => [entry.targetField, key(entry)]));
  const after = new Map(generated.map((entry) => [entry.targetField, key(entry)]));
  const diff: LineageDiff = { added: [], removed: [], changed: [] };
  for (const [target, sources] of after) {
    if (!before.has(target)) diff.added.push(target);
    else if (before.get(target) !== sources) diff.changed.push(target);
  }
  for (const target of before.keys()) {
    if (!after.has(target)) diff.removed.push(target);
  }
  return diff;
}

export function isEmptyDiff(diff: LineageDiff): boolean {
  return diff.added.length === 0 && diff.removed.length === 0 && diff.changed.length === 0;
}

/** Number of (target, source) field pairs; Core stores one mapping row per pair. */
export function countPairs(entries: LineageEntry[]): number {
  return entries.reduce((total, entry) => total + entry.sourceFields.length, 0);
}

/** `config` with `dataLineage` replaced wholesale; every other key is kept in place. */
export function replaceLineage(config: Record<string, unknown>, entries: LineageEntry[]): Record<string, unknown> {
  return { ...config, dataLineage: entries };
}

/**
 * Objects that `targets` / `sources` name but `permissions.write.*` / `permissions.read.*`
 * don't. Object names compare case-insensitively.
 */
export function findPermissionGaps(
  config: Record<string, unknown>,
  targets: Iterable<string>,
  sources: Iterable<string>
): LineagePermissionGaps {
  const permissions = (config.permissions ?? {}) as Record<string, unknown>;
  const writable = permittedObjects(permissions.write);
  const readable = permittedObjects(permissions.read);
  return {
    targets: missingFrom(writable, targets),
    sources: missingFrom(readable, sources),
  };
}

/**
 * Objects referenced by the config's own `dataLineage` that its `permissions` no longer
 * cover. Object-level only: a field that stopped being produced is not detected.
 */
export function findStaleLineage(config: Record<string, unknown>): LineagePermissionGaps {
  const entries = readLineage(config);
  return findPermissionGaps(
    config,
    entries.map((entry) => objectOf(entry.targetField)),
    entries.flatMap((entry) => entry.sourceFields.map(objectOf))
  );
}

/** Number of `dataLineage` entries that reference any of the given objects. */
export function countEntriesReferencing(config: Record<string, unknown>, objects: string[]): number {
  const names = new Set(objects.map((name) => name.toLowerCase()));
  return readLineage(config).filter(
    (entry) =>
      names.has(objectOf(entry.targetField).toLowerCase()) ||
      entry.sourceFields.some((field) => names.has(objectOf(field).toLowerCase()))
  ).length;
}

/** Write config.json with a 2-space indent and a trailing newline. */
export async function writeConfigJson(configPath: string, config: Record<string, unknown>): Promise<void> {
  await fs.writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
}

function objectOf(field: string): string {
  const dot = field.indexOf('.');
  return dot === -1 ? field : field.slice(0, dot);
}

function permittedObjects(section: unknown): Set<string> {
  const names = new Set<string>();
  if (typeof section !== 'object' || section === null) return names;
  for (const kind of ['dlo', 'dmo']) {
    const list = (section as Record<string, unknown>)[kind];
    if (!Array.isArray(list)) continue;
    for (const name of list) {
      if (typeof name === 'string') names.add(name.toLowerCase());
    }
  }
  return names;
}

function missingFrom(permitted: Set<string>, objects: Iterable<string>): string[] {
  const missing = new Set<string>();
  for (const name of objects) {
    if (!permitted.has(name.toLowerCase())) missing.add(name);
  }
  return [...missing].sort();
}
