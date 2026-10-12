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
import { promises as fs, accessSync } from 'node:fs';
import path from 'node:path';
import { Messages, SfError } from '@salesforce/core';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'datacodeBinaryExecutor');

export type CodeType = 'script' | 'function';

export type DataAccessLayerCalls = {
  readDlo: Set<string>;
  readDmo: Set<string>;
  writeToDlo: Set<string>;
  writeToDmo: Set<string>;
};

export type ScanPermissions = {
  read: { dlo?: string[]; dmo?: string[] };
  write: { dlo?: string[]; dmo?: string[] };
};

export type NativeScanOptions = {
  workingDir: string;
  /** Path to the entrypoint file. Defaults to <workingDir>/payload/entrypoint.py. */
  entrypoint?: string;
  /** Path to write the updated config.json. Defaults to <dirname(entrypoint)>/config.json. */
  configFile?: string;
  dryRun?: boolean;
  noRequirements?: boolean;
  /** Override for the package type. If omitted, resolved via .datacustomcode_proj/sdk_config.json. */
  packageType?: CodeType;
  /**
   * Called with the updated config just before config.json is written (never on dry run).
   * Resolving `false` skips every write and marks the result `written: false`.
   */
  confirmWrite?: (updatedConfig: Record<string, unknown>) => Promise<boolean>;
};

export type NativeScanResult = {
  workingDirectory: string;
  entrypoint: string;
  configPath: string;
  config: Record<string, unknown>;
  filesScanned: string[];
  requirementsPath?: string;
  requirements?: string[];
  /** True when --dry-run prevented file writes. */
  dryRun: boolean;
  /** Set to false when `confirmWrite` declined the write. */
  written?: false;
};

const ENTRYPOINT_FILE = 'entrypoint.py';
const CONFIG_FILE = 'config.json';
const PAYLOAD_DIR = 'payload';
const REQUIREMENTS_FILE = 'requirements.txt';
const SDK_CONFIG_DIR = '.datacustomcode_proj';
const SDK_CONFIG_FILE = 'sdk_config.json';

const DATA_ACCESS_METHODS = new Set(['read_dlo', 'read_dmo', 'write_to_dlo', 'write_to_dmo']);

const EXCLUDED_PACKAGES = new Set<string>(['datacustomcode', 'pyspark']);

/** Mirror of `datacustomcode/scan.py:get_sdk_config_path`. */
export function getSdkConfigPath(baseDirectory: string): string {
  return path.join(baseDirectory, SDK_CONFIG_DIR, SDK_CONFIG_FILE);
}

/**
 * Mirror of `datacustomcode/scan.py:find_base_directory`.
 * Walks upward from the file's directory looking for the `.datacustomcode_proj` marker.
 * Falls back to the parent of `payload/` if the marker isn't found.
 */
export function findBaseDirectory(filePath: string): string {
  const startDir = path.dirname(path.resolve(filePath));
  let current = startDir;
  const root = path.parse(current).root;

  while (current !== root) {
    if (dirExistsSync(path.join(current, SDK_CONFIG_DIR))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (path.basename(startDir) === PAYLOAD_DIR) {
    return path.dirname(startDir);
  }
  return startDir;
}

/**
 * Mirror of `datacustomcode/scan.py:get_package_type`.
 * Reads the SDK config and returns its `type` field. Defaults to `script` when the SDK
 * config is missing (matches Python). Throws when the file exists but lacks `type`.
 */
export async function getPackageType(baseDirectory: string): Promise<CodeType> {
  const configPath = getSdkConfigPath(baseDirectory);
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return 'script';
    }
    throw err;
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new SfError(`Failed to parse JSON from ${configPath}: ${(err as Error).message}`, 'InvalidSdkConfig');
  }

  const type = parsed.type;
  if (typeof type !== 'string') {
    throw new SfError(
      `Package type not found in SDK config at ${configPath}. Please run 'sf data-code-extension <script|function> init' to initialize the project.`,
      'MissingPackageType'
    );
  }
  if (type !== 'script' && type !== 'function') {
    throw new SfError(`Invalid package type '${type}' in ${configPath}`, 'InvalidPackageType');
  }
  return type;
}

/**
 * AST-equivalent permission scanner.
 *
 * Mirror of `datacustomcode/scan.py:ClientMethodVisitor`. Collects calls to
 * `client.read_dlo`, `client.read_dmo`, `client.write_to_dlo`, `client.write_to_dmo`
 * and resolves the first argument when it is a string literal or a name bound earlier in
 * the file to a string literal. Validates the call set is consistent (replicates the
 * pydantic model_validator):
 * - Cannot read from DLO and DMO in the same file
 * - Must read from at least one DLO or DMO
 * - Cannot read DLO + write DMO (or vice versa)
 *
 * Implementation notes:
 * - Comments (`#`) and string literals (single, double, triple-quoted) are masked out
 * before regex matching so method-like text inside them doesn't register as a real
 * call. This mirrors Python's AST: `ast.parse` only sees executable code.
 * - Assignments and calls are interleaved in source order, so a call resolves an
 * identifier using the *most recent* binding at that point — not a file-wide pass.
 * Reassignments and post-call assignments behave correctly.
 */
export async function scanFile(filePath: string): Promise<DataAccessLayerCalls> {
  const code = await fs.readFile(filePath, 'utf8');
  const masked = computeCommentStringMask(code);

  const result: DataAccessLayerCalls = {
    readDlo: new Set<string>(),
    readDmo: new Set<string>(),
    writeToDlo: new Set<string>(),
    writeToDmo: new Set<string>(),
  };

  // Collect assignments and method calls as ordered events, then walk in source order.
  type AssignEvent = { kind: 'assign'; offset: number; name: string; value: string };
  type CallEvent = {
    kind: 'call';
    offset: number;
    method: string;
    literal?: string;
    ident?: string;
  };

  const events: Array<AssignEvent | CallEvent> = [];

  // `name = "literal"` — string-literal assignments (binding becomes that string).
  // Only string-literal assignments are tracked because call-site resolution only ever
  // uses string values; non-string RHS leaves the prior binding alone, mirroring Python's
  // AST visitor which records `None` for non-Constant RHS values and then never resolves
  // those identifiers at call sites.
  const stringAssignRegex = /^[ \t]*([A-Za-z_]\w*)\s*=\s*(?:"([^"\\]*)"|'([^'\\]*)')\s*(?:#.*)?$/gm;
  let m: RegExpExecArray | null;
  while ((m = stringAssignRegex.exec(code)) !== null) {
    if (masked[m.index]) continue; // assignment lives inside a comment/string
    events.push({ kind: 'assign', offset: m.index, name: m[1], value: m[2] ?? m[3] ?? '' });
  }

  const callRegex =
    /\.(?<method>read_dlo|read_dmo|write_to_dlo|write_to_dmo)\s*\(\s*(?:"(?<dq>[^"\\]*)"|'(?<sq>[^'\\]*)'|(?<ident>[A-Za-z_]\w*))/g;
  while ((m = callRegex.exec(code)) !== null) {
    if (masked[m.index]) continue; // call lives inside a comment/string
    const g = m.groups as { method: string; dq?: string; sq?: string; ident?: string };
    if (!DATA_ACCESS_METHODS.has(g.method)) continue;
    const literal = g.dq ?? g.sq;
    events.push({
      kind: 'call',
      offset: m.index,
      method: g.method,
      literal,
      ident: literal === undefined ? g.ident : undefined,
    });
  }

  events.sort((a, b) => a.offset - b.offset);

  const variableValues = new Map<string, string>();
  for (const ev of events) {
    if (ev.kind === 'assign') {
      variableValues.set(ev.name, ev.value);
      continue;
    }
    let name: string | undefined;
    if (ev.literal !== undefined) {
      name = ev.literal;
    } else if (ev.ident !== undefined) {
      name = variableValues.get(ev.ident);
    }
    if (!name) continue;

    switch (ev.method) {
      case 'read_dlo':
        result.readDlo.add(name);
        break;
      case 'read_dmo':
        result.readDmo.add(name);
        break;
      case 'write_to_dlo':
        result.writeToDlo.add(name);
        break;
      case 'write_to_dmo':
        result.writeToDmo.add(name);
        break;
    }
  }

  validateAccessLayer(result);
  return result;
}

/**
 * Build a boolean per-byte mask the same length as `code`. `mask[i] === true` means byte
 * `i` lies inside a `#` comment or any kind of string literal, so the scanner should
 * ignore matches starting at that offset.
 *
 * Recognized constructs (closely matching Python lexing for this scanner's purposes):
 * - `#` comment to end of line
 * - `"""..."""` and `'''...'''` triple-quoted strings (may span lines)
 * - `"..."` and `'...'` single-line strings, honoring `\\` escapes
 *
 * String prefixes (r/b/f/u, mixed-case) are not mistaken for opening quotes because we
 * only step into a string when we actually encounter a `"` or `'` byte; the prefix
 * letters stay in scan-eligible territory but contain no quote chars themselves.
 */
function computeCommentStringMask(code: string): boolean[] {
  const len = code.length;
  const mask = new Array<boolean>(len).fill(false);
  let i = 0;

  while (i < len) {
    const ch = code[i];
    // Comment: mark to end of line.
    if (ch === '#') {
      while (i < len && code[i] !== '\n') {
        mask[i] = true;
        i++;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      const triple = ch + ch + ch;
      if (code.startsWith(triple, i)) {
        // Triple-quoted: mark from opening triple through closing triple inclusive.
        const end = code.indexOf(triple, i + 3);
        const stop = end === -1 ? len : end + 3;
        for (let k = i; k < stop; k++) mask[k] = true;
        i = stop;
        continue;
      }
      // Single-line string: scan to matching unescaped quote on the same line.
      let j = i + 1;
      while (j < len && code[j] !== ch && code[j] !== '\n') {
        if (code[j] === '\\' && j + 1 < len) {
          j += 2;
        } else {
          j++;
        }
      }
      const stop = j < len && code[j] === ch ? j + 1 : j;
      for (let k = i; k < stop; k++) mask[k] = true;
      i = stop;
      continue;
    }
    i++;
  }

  return mask;
}

function validateAccessLayer(calls: DataAccessLayerCalls): void {
  if (calls.readDlo.size > 0 && calls.readDmo.size > 0) {
    throw new SfError('Cannot read from DLO and DMO in the same file.', 'InvalidEntrypoint');
  }
  if (calls.readDlo.size === 0 && calls.readDmo.size === 0) {
    throw new SfError('Must read from at least one DLO or DMO.', 'InvalidEntrypoint');
  }
  if (calls.readDlo.size > 0 && calls.writeToDmo.size > 0) {
    throw new SfError('Cannot read from DLO and write to DMO in the same file.', 'InvalidEntrypoint');
  }
  if (calls.readDmo.size > 0 && calls.writeToDlo.size > 0) {
    throw new SfError('Cannot read from DMO and write to DLO in the same file.', 'InvalidEntrypoint');
  }
}

let pipreqsMock: ((fileDir: string) => Promise<string>) | null = null;

/**
 * Set a mock function for pipreqs execution.
 * This is used for unit testing.
 *
 * @internal
 */
export function setPipreqsMock(mock: ((fileDir: string) => Promise<string>) | null): void {
  pipreqsMock = mock;
}

export async function executePipreqs(fileDir: string): Promise<string> {
  if (pipreqsMock) {
    return pipreqsMock(fileDir);
  }

  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);

  try {
    const { stdout } = await execFileAsync('pipreqs', ['--print', '--mode', 'no-pin', fileDir]);
    return stdout;
  } catch (error) {
    const err = error as { message: string; stderr?: string; stdout?: string };
    const details = err.stderr ?? err.stdout ?? err.message;
    throw new SfError(
      `Failed to scan imports using pipreqs: ${details}. Hint: ensure 'pipreqs' is installed in the Python environment.`,
      'PipreqsScanError'
    );
  }
}

/**
 * Mirror of `datacustomcode/scan.py:ImportVisitor.scan_file_for_imports`.
 *
 * This function uses pipreqs to scan Python files for external package dependencies.
 * - Scans all Python files in the directory
 * - Extracts import statements
 * - Filters out stdlib modules
 * - Filters out local modules
 */
export async function scanFileForImports(filePath: string): Promise<Set<string>> {
  const fileDir = path.dirname(filePath);
  const stdout = await executePipreqs(fileDir);

  const packages = new Set<string>();
  for (const line of stdout.split('\n')) {
    const pkg = line.trim().toLowerCase();
    if (pkg && !EXCLUDED_PACKAGES.has(pkg)) {
      packages.add(pkg);
    }
  }

  return packages;
}

/**
 * Mirror of `datacustomcode/scan.py:write_requirements_file`.
 * Writes (creating or merging with) `requirements.txt` in the parent directory of the
 * Python file. Returns the absolute path to the requirements file.
 */
export async function writeRequirementsFile(filePath: string): Promise<{ requirementsPath: string; merged: string[] }> {
  const imports = await scanFileForImports(filePath);
  const fileDir = path.dirname(filePath);
  const parentDir = fileDir ? path.dirname(fileDir) : '.';
  const requirementsPath = path.join(parentDir, REQUIREMENTS_FILE);

  const existing = new Set<string>();
  try {
    const raw = await fs.readFile(requirementsPath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed.length > 0) existing.add(trimmed);
    }
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  const merged = [...new Set([...existing, ...imports])].sort();
  await fs.writeFile(requirementsPath, merged.length > 0 ? `${merged.join('\n')}\n` : '', 'utf8');
  return { requirementsPath, merged };
}

/**
 * Mirror of `datacustomcode/scan.py:update_config`.
 *
 * Reads the existing config.json next to the entrypoint (or at `configLocation` when
 * provided), updates `entryPoint` to the entrypoint's basename, and for `script`
 * packages fills `dataspace` and the scanned read/write permissions.
 */
export async function updateConfig(
  entrypointPath: string,
  packageType: CodeType,
  configLocation?: string
): Promise<Record<string, unknown>> {
  const configPath = configLocation ?? path.join(path.dirname(entrypointPath), CONFIG_FILE);
  const existing = await readConfigJson(configPath);

  existing.entryPoint = path.basename(entrypointPath);

  if (packageType === 'script') {
    existing.dataspace = resolveDataspace(existing);
    const calls = await scanFile(entrypointPath);
    existing.permissions = buildPermissions(calls);
  }

  return existing;
}

/** Read and parse a package's config.json, with the errors `updateConfig` raises. */
export async function readConfigJson(configPath: string): Promise<Record<string, unknown>> {
  let raw: string;
  try {
    raw = await fs.readFile(configPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new SfError(`config.json not found at ${configPath}`, 'ConfigNotFound', [
        "Run 'data-code-extension <type> init' first to initialize the package",
        'Verify the package directory is correct',
      ]);
    }
    throw err;
  }

  let existing: Record<string, unknown>;
  try {
    existing = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    throw new SfError(`Failed to parse JSON from ${configPath}: ${(err as Error).message}`, 'InvalidConfig');
  }
  return existing;
}

function buildPermissions(calls: DataAccessLayerCalls): ScanPermissions {
  const read: ScanPermissions['read'] = {};
  if (calls.readDlo.size > 0) {
    read.dlo = [...calls.readDlo];
  } else {
    read.dmo = [...calls.readDmo];
  }
  const write: ScanPermissions['write'] = {};
  if (calls.writeToDlo.size > 0) {
    write.dlo = [...calls.writeToDlo];
  } else {
    write.dmo = [...calls.writeToDmo];
  }
  return { read, write };
}

function resolveDataspace(config: Record<string, unknown>): string {
  if (!('dataspace' in config)) {
    throw new SfError(
      "dataspace must be defined. Please add a 'dataspace' field to the config.json file.",
      'MissingDataspace'
    );
  }
  const value = config.dataspace;
  if (typeof value !== 'string' || value.trim() === '') {
    return 'default';
  }
  return value;
}

/**
 * Mirror of `datacustomcode/cli.py:scan`.
 *
 * Reads existing config.json, runs the AST-equivalent permission scan and import scan,
 * writes the updated config.json (unless `dryRun`), and writes/merges requirements.txt
 * (unless `dryRun` or `noRequirements`).
 */
export async function executeNativeScan(opts: NativeScanOptions): Promise<NativeScanResult> {
  const workingDir = path.resolve(opts.workingDir);
  const entrypoint = path.resolve(opts.entrypoint ?? path.join(workingDir, PAYLOAD_DIR, ENTRYPOINT_FILE));

  if (!(await pathExists(entrypoint))) {
    throw new SfError(
      messages.getMessage('error.scanEntrypointMissing', [entrypoint]),
      'EntrypointNotFound',
      messages.getMessages('actions.scanEntrypointMissing')
    );
  }

  const baseDir = findBaseDirectory(entrypoint);
  const packageType = opts.packageType ?? (await getPackageType(baseDir));
  const configPath = opts.configFile ?? path.join(path.dirname(entrypoint), CONFIG_FILE);

  const updatedConfig = await updateConfig(entrypoint, packageType, configPath);

  const result: NativeScanResult = {
    workingDirectory: workingDir,
    entrypoint,
    configPath,
    config: updatedConfig,
    filesScanned: [path.relative(workingDir, entrypoint) || entrypoint],
    dryRun: !!opts.dryRun,
  };

  if (opts.dryRun) {
    return result;
  }

  if (opts.confirmWrite && !(await opts.confirmWrite(updatedConfig))) {
    result.written = false;
    return result;
  }

  await fs.writeFile(configPath, JSON.stringify(updatedConfig, null, 2), 'utf8');

  if (!opts.noRequirements) {
    const { requirementsPath, merged } = await writeRequirementsFile(entrypoint);
    result.requirementsPath = requirementsPath;
    result.requirements = merged;
  }

  return result;
}

async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function dirExistsSync(p: string): boolean {
  try {
    accessSync(p);
    return true;
  } catch {
    return false;
  }
}
