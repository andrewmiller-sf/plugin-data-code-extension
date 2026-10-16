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
import { spawn as nodeSpawn } from 'node:child_process';
import { debuglog } from 'node:util';
import { Messages, SfError } from '@salesforce/core';

const debug = debuglog('datacustomcode');

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'run');

/** Python's `run_entrypoint` default credentials profile. */
export const DEFAULT_PROFILE = 'default';
/** Matches the SDK CLI's local-run timeout (5 minutes). */
export const RUN_TIMEOUT_MS = 300_000;

/**
 * The Python program executed via `python -c`. It calls the SDK *library's*
 * `datacustomcode.run.run_entrypoint` (NOT the `datacustomcode` console-script),
 * which is how we phase out the SDK's own CLI while reusing its runtime.
 *
 * Arguments arrive as a single JSON object in `sys.argv[1]` — passed as its own
 * argv element (never interpolated into this source) so nothing in a path or
 * dependency name can be injected into the executed code. The JSON keys are
 * camelCase and mapped to `run_entrypoint`'s parameters here.
 */
export const RUN_ENTRYPOINT_SHIM = [
  'import json, sys',
  'from datacustomcode.run import run_entrypoint',
  'a = json.loads(sys.argv[1])',
  'run_entrypoint(',
  '    a["entrypoint"],',
  '    a["configFile"],',
  '    a["dependencies"],',
  '    a["profile"],',
  '    test_file=a["testFile"],',
  '    sf_cli_org=a["sfCliOrg"],',
  ')',
].join('\n');

/** JSON payload handed to {@link RUN_ENTRYPOINT_SHIM}. */
export type PythonRunPayload = {
  entrypoint: string;
  configFile: string | null;
  dependencies: string[];
  profile: string;
  testFile: string | null;
  sfCliOrg: string | null;
};

export type PythonRunOptions = {
  /** Resolved Python interpreter (e.g. `python3` from the environment check). */
  pythonCommand: string;
  entrypoint: string;
  configFile?: string;
  dependencies: string[];
  testFile?: string;
  /** SF CLI org username/alias; forwarded to `run_entrypoint(sf_cli_org=...)`. */
  sfCliOrg?: string;
  profile?: string;
  timeoutMs?: number;
  /** Called with each stdout chunk as it arrives, for live streaming. */
  onStdout?: (chunk: string) => void;
  /** Called with each stderr chunk as it arrives, for live streaming. */
  onStderr?: (chunk: string) => void;
};

export type PythonRunResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

/** Minimal shape of a spawned child this runner consumes; satisfied by `child_process.spawn`. */
export type RunnerStream = {
  setEncoding(encoding: BufferEncoding): unknown;
  on(event: 'data', listener: (chunk: string) => void): unknown;
};
export type RunnerChild = {
  stdout: RunnerStream | null;
  stderr: RunnerStream | null;
  on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): unknown;
  on(event: 'error', listener: (err: Error) => void): unknown;
};
export type SpawnFn = (
  command: string,
  args: readonly string[],
  options: { env?: NodeJS.ProcessEnv; timeout?: number; cwd?: string }
) => RunnerChild;

export type PythonRunnerDeps = {
  spawn: SpawnFn;
};

const defaultSpawn: SpawnFn = (command, args, options) => nodeSpawn(command, [...args], options);

/**
 * Split the SF CLI's single comma-separated `--dependencies` string into the list
 * Python's `run_entrypoint` expects. Trims blanks and drops empty segments so a
 * trailing comma or stray space never becomes a bogus module name.
 */
export function splitDependencies(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((dependency) => dependency.trim())
    .filter((dependency) => dependency.length > 0);
}

export function buildRunPayload(opts: PythonRunOptions): PythonRunPayload {
  return {
    entrypoint: opts.entrypoint,
    configFile: opts.configFile ?? null,
    dependencies: opts.dependencies,
    profile: opts.profile ?? DEFAULT_PROFILE,
    testFile: opts.testFile ?? null,
    sfCliOrg: opts.sfCliOrg ?? null,
  };
}

function mapRunFailure(exitCode: number, stderr: string, sfCliOrg?: string): SfError {
  const detail = stderr || `Process exited with code ${exitCode}`;
  if (/Authentication failed|Invalid credentials/i.test(detail)) {
    return new SfError(
      messages.getMessage('error.runAuthenticationFailed', [sfCliOrg ?? 'target org']),
      'RunAuthenticationFailed',
      messages.getMessages('actions.runAuthenticationFailed')
    );
  }
  return new SfError(
    messages.getMessage('error.runExecutionFailed', [detail]),
    'RunExecutionFailed',
    messages.getMessages('actions.runExecutionFailed')
  );
}

export function mapRunTerminated(signal: NodeJS.Signals | null, timeoutMs: number): SfError {
  return new SfError(
    messages.getMessage('error.runTerminated', [signal ?? 'unknown', Math.round(timeoutMs / 1000)]),
    'RunTerminated',
    messages.getMessages('actions.runTerminated')
  );
}

function mapProcessStartError(err: Error, pythonCommand: string): SfError {
  return new SfError(
    messages.getMessage('error.runProcessStartFailed', [pythonCommand, err.message]),
    'RunProcessStartFailed',
    messages.getMessages('actions.runProcessStartFailed')
  );
}

/** Options for {@link runPythonProgram}: everything but the program itself is shared with `run`. */
export type PythonProgramOptions = {
  pythonCommand: string;
  /** Interpreter arguments, e.g. `['-c', SHIM, payloadJson]`. */
  args: readonly string[];
  /** SF CLI org username/alias, named in the authentication-failure message. */
  sfCliOrg?: string;
  timeoutMs?: number;
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  /** Checked before the default failure mapping; return undefined to fall through to it. */
  mapExitCode?: (exitCode: number, stderr: string) => SfError | undefined;
};

/**
 * Spawn the interpreter with `opts.args`, streaming output live. Resolves with the
 * accumulated stdout/stderr on a clean exit; rejects with a friendly {@link SfError}
 * on non-zero exit or a failure to start the interpreter.
 */
export async function runPythonProgram(
  opts: PythonProgramOptions,
  deps: PythonRunnerDeps = { spawn: defaultSpawn }
): Promise<PythonRunResult> {
  debug('run spawn: %s %o', opts.pythonCommand, opts.args);

  const timeoutMs = opts.timeoutMs ?? RUN_TIMEOUT_MS;
  return new Promise<PythonRunResult>((resolve, reject) => {
    const child = deps.spawn(opts.pythonCommand, opts.args, {
      timeout: timeoutMs,
      // PYTHONUNBUFFERED so the entrypoint's prints stream immediately instead of buffering.
      env: { ...process.env, PYTHONUNBUFFERED: '1' },
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.setEncoding('utf8');
    child.stderr?.setEncoding('utf8');
    child.stdout?.on('data', (chunk: string) => {
      stdout += chunk;
      opts.onStdout?.(chunk);
    });
    child.stderr?.on('data', (chunk: string) => {
      stderr += chunk;
      opts.onStderr?.(chunk);
    });

    child.on('error', (err: Error) => {
      debug('run spawn error: %o', err);
      reject(mapProcessStartError(err, opts.pythonCommand));
    });

    child.on('close', (code: number | null, signal: NodeJS.Signals | null) => {
      // No exit code means a signal stopped the run: the timeout, an OOM kill, or the user.
      if (code === null) {
        debug('run killed by signal: %s', signal);
        reject(mapRunTerminated(signal, timeoutMs));
        return;
      }
      const exitCode = code;
      debug('run exit code: %d', exitCode);
      if (exitCode === 0) {
        resolve({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode });
      } else {
        const trimmed = stderr.trim();
        reject(opts.mapExitCode?.(exitCode, trimmed) ?? mapRunFailure(exitCode, trimmed, opts.sfCliOrg));
      }
    });
  });
}

/**
 * Run a package's entrypoint through the SDK's `run_entrypoint`, streaming output
 * live. Resolves with the accumulated stdout/stderr on a clean exit; rejects with a
 * friendly {@link SfError} on non-zero exit or a failure to start the interpreter.
 */
export async function runEntrypoint(
  opts: PythonRunOptions,
  deps: PythonRunnerDeps = { spawn: defaultSpawn }
): Promise<PythonRunResult> {
  const payload = buildRunPayload(opts);
  return runPythonProgram(
    {
      pythonCommand: opts.pythonCommand,
      args: ['-c', RUN_ENTRYPOINT_SHIM, JSON.stringify(payload)],
      sfCliOrg: opts.sfCliOrg,
      timeoutMs: opts.timeoutMs,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    },
    deps
  );
}

/**
 * Class wrapper around {@link runEntrypoint}, exposed so command-level tests can
 * stub the entire local run the same way deploy tests stub `NativeDeployer.deploy`.
 */
export class PythonRunner {
  public static async run(opts: PythonRunOptions, deps?: PythonRunnerDeps): Promise<PythonRunResult> {
    return runEntrypoint(opts, deps);
  }
}
