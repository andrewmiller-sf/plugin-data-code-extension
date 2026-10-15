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
import os from 'node:os';
import path from 'node:path';
import { Messages, SfError } from '@salesforce/core';
import { DEFAULT_PROFILE, runPythonProgram, type PythonRunnerDeps } from './pythonRunner.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'lineage');

/** Exit code the shim uses when the installed SDK has no `datacustomcode.lineage`. */
export const LINEAGE_UNAVAILABLE_EXIT_CODE = 3;
/** Printed to stderr alongside {@link LINEAGE_UNAVAILABLE_EXIT_CODE}, so a script's own `sys.exit(3)` isn't mistaken for it. */
export const LINEAGE_UNAVAILABLE_MARKER = 'DATACUSTOMCODE_LINEAGE_UNAVAILABLE';

/**
 * The Python program executed via `python -c`. It calls the SDK *library's*
 * `datacustomcode.lineage.generate_lineage`, which runs the entrypoint against the
 * org with reads captured and writes traced (never written).
 *
 * Arguments arrive as a single JSON object in `sys.argv[1]`, never interpolated into
 * this source. The result goes to `resultFile` rather than stdout, because the
 * customer's script prints freely to stdout.
 */
export const GENERATE_LINEAGE_SHIM = [
  'import importlib.util, json, sys',
  'if importlib.util.find_spec("datacustomcode.lineage") is None:',
  `    sys.stderr.write("${LINEAGE_UNAVAILABLE_MARKER}\\n")`,
  `    sys.exit(${LINEAGE_UNAVAILABLE_EXIT_CODE})`,
  'from datacustomcode.lineage import generate_lineage',
  'a = json.loads(sys.argv[1])',
  'result = generate_lineage(',
  '    a["entrypoint"],',
  '    a["configFile"],',
  '    a["dependencies"],',
  '    a["profile"],',
  '    sf_cli_org=a["sfCliOrg"],',
  ')',
  'with open(a["resultFile"], "w", encoding="utf-8") as f:',
  '    json.dump(result.to_dict(), f)',
].join('\n');

/** JSON payload handed to {@link GENERATE_LINEAGE_SHIM}. */
export type LineagePayload = {
  entrypoint: string;
  configFile: string | null;
  dependencies: string[];
  profile: string;
  sfCliOrg: string | null;
  resultFile: string;
};

export type LineageEntry = {
  targetField: string;
  sourceFields: string[];
};

export type UnresolvedField = {
  targetField: string;
  reason: string;
};

/** The SDK's `LineageResult.to_dict()`; `dataLineage` matches config.json. */
export type LineageReport = {
  dataLineage: LineageEntry[];
  unresolved: UnresolvedField[];
  noSources: string[];
  /** Fields in `dataLineage` or `noSources` computed by a UDF; their sources may be incomplete. */
  udfFields: string[];
  targets: string[];
  sources: string[];
  pairCount: number;
};

export type LineageRunOptions = {
  pythonCommand: string;
  entrypoint: string;
  /** SDK config.yaml (reader/writer config, e.g. `default_row_limit`). */
  configFile?: string;
  dependencies: string[];
  sfCliOrg?: string;
  profile?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export function buildLineagePayload(opts: LineageRunOptions, resultFile: string): LineagePayload {
  return {
    entrypoint: opts.entrypoint,
    configFile: opts.configFile ?? null,
    dependencies: opts.dependencies,
    profile: opts.profile ?? DEFAULT_PROFILE,
    sfCliOrg: opts.sfCliOrg ?? null,
    resultFile,
  };
}

function mapLineageExitCode(exitCode: number, stderr: string): SfError | undefined {
  if (exitCode === LINEAGE_UNAVAILABLE_EXIT_CODE && stderr.includes(LINEAGE_UNAVAILABLE_MARKER)) {
    return new SfError(
      messages.getMessage('error.sdkTooOld'),
      'LineageSdkTooOld',
      messages.getMessages('actions.sdkTooOld')
    );
  }
  return undefined;
}

/**
 * Generate field-level lineage for a script package through the SDK's
 * `generate_lineage`, streaming the run's output live. The result file lives in a
 * private temp directory that is always removed.
 */
export async function generateLineage(opts: LineageRunOptions, deps?: PythonRunnerDeps): Promise<LineageReport> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dce-lineage-'));
  const resultFile = path.join(tempDir, 'lineage.json');
  try {
    const payload = buildLineagePayload(opts, resultFile);
    await runPythonProgram(
      {
        pythonCommand: opts.pythonCommand,
        args: ['-c', GENERATE_LINEAGE_SHIM, JSON.stringify(payload)],
        sfCliOrg: opts.sfCliOrg,
        timeoutMs: opts.timeoutMs,
        onStdout: opts.onStdout,
        onStderr: opts.onStderr,
        mapExitCode: mapLineageExitCode,
      },
      deps
    );

    let raw: string;
    try {
      raw = await fs.readFile(resultFile, 'utf8');
    } catch (err) {
      throw new SfError(
        messages.getMessage('error.resultMissing', [(err as Error).message]),
        'LineageResultMissing',
        messages.getMessages('actions.resultMissing')
      );
    }
    return JSON.parse(raw) as LineageReport;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

/** Class wrapper around {@link generateLineage}, so command tests can stub the run. */
export class LineageRunner {
  public static async generate(opts: LineageRunOptions, deps?: PythonRunnerDeps): Promise<LineageReport> {
    return generateLineage(opts, deps);
  }
}
