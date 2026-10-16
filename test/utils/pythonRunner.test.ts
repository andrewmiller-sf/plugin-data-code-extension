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
import { expect } from 'chai';
import { SfError } from '@salesforce/core';
import {
  splitDependencies,
  buildRunPayload,
  runEntrypoint,
  PythonRunner,
  RUN_ENTRYPOINT_SHIM,
  DEFAULT_PROFILE,
  RUN_TIMEOUT_MS,
  type PythonRunOptions,
  type PythonRunPayload,
  type RunnerStream,
  type RunnerChild,
  type SpawnFn,
} from '../../src/utils/pythonRunner.js';

/** Await a promise expected to reject and return the error for assertions. */
async function expectReject(promise: Promise<unknown>): Promise<SfError> {
  try {
    await promise;
  } catch (err) {
    return err as SfError;
  }
  throw new Error('Expected promise to reject, but it resolved');
}

/** A controllable stdout/stderr stream: records the encoding and replays pushed chunks. */
class FakeStream implements RunnerStream {
  public encoding: BufferEncoding | undefined;
  private dataListeners: Array<(chunk: string) => void> = [];

  public setEncoding(encoding: BufferEncoding): this {
    this.encoding = encoding;
    return this;
  }

  public on(event: 'data', listener: (chunk: string) => void): this {
    if (event === 'data') this.dataListeners.push(listener);
    return this;
  }

  /** Test helper: deliver a chunk to every registered data listener. */
  public push(chunk: string): void {
    for (const listener of this.dataListeners) listener(chunk);
  }
}

/** A controllable child process whose close/error events the test drives by hand. */
class FakeChild implements RunnerChild {
  public stdout: FakeStream | null = new FakeStream();
  public stderr: FakeStream | null = new FakeStream();
  private closeListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  public on(event: 'close', listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  public on(event: 'error', listener: (err: Error) => void): this;
  public on(
    event: 'close' | 'error',
    listener: ((code: number | null, signal: NodeJS.Signals | null) => void) | ((err: Error) => void)
  ): this {
    if (event === 'close') {
      this.closeListeners.push(listener as (code: number | null, signal: NodeJS.Signals | null) => void);
    } else this.errorListeners.push(listener as (err: Error) => void);
    return this;
  }

  /** Test helper: fire the process 'close' event. */
  public emitClose(code: number | null, signal: NodeJS.Signals | null = null): void {
    for (const listener of this.closeListeners) listener(code, signal);
  }

  /** Test helper: fire the process 'error' event (failure to spawn). */
  public emitError(err: Error): void {
    for (const listener of this.errorListeners) listener(err);
  }
}

type SpawnCall = {
  command: string;
  args: readonly string[];
  options: { env?: NodeJS.ProcessEnv; timeout?: number; cwd?: string };
};

/** A spawn seam that returns the given child and records every invocation. */
function fakeSpawn(child: FakeChild, calls: SpawnCall[]): SpawnFn {
  return (command, args, options) => {
    calls.push({ command, args, options });
    return child;
  };
}

function makeOpts(overrides: Partial<PythonRunOptions> = {}): PythonRunOptions {
  return {
    pythonCommand: 'python3',
    entrypoint: '/pkg/entrypoint.py',
    dependencies: ['pandas', 'numpy'],
    sfCliOrg: 'myorg',
    ...overrides,
  };
}

describe('pythonRunner', () => {
  describe('splitDependencies', () => {
    it('returns an empty list for undefined', () => {
      expect(splitDependencies(undefined)).to.deep.equal([]);
    });

    it('returns an empty list for an empty string', () => {
      expect(splitDependencies('')).to.deep.equal([]);
    });

    it('splits a single dependency', () => {
      expect(splitDependencies('pandas')).to.deep.equal(['pandas']);
    });

    it('splits a comma-separated list', () => {
      expect(splitDependencies('pandas,numpy,scipy')).to.deep.equal(['pandas', 'numpy', 'scipy']);
    });

    it('trims whitespace and drops empty segments from stray/trailing commas', () => {
      expect(splitDependencies('pandas, numpy ,, scipy,')).to.deep.equal(['pandas', 'numpy', 'scipy']);
    });
  });

  describe('buildRunPayload', () => {
    it('defaults optional fields to null and profile to DEFAULT_PROFILE', () => {
      const payload = buildRunPayload({
        pythonCommand: 'python3',
        entrypoint: '/pkg/entrypoint.py',
        dependencies: [],
      });

      expect(payload).to.deep.equal({
        entrypoint: '/pkg/entrypoint.py',
        configFile: null,
        dependencies: [],
        profile: DEFAULT_PROFILE,
        testFile: null,
        sfCliOrg: null,
      });
    });

    it('maps every provided option through', () => {
      const payload = buildRunPayload({
        pythonCommand: 'python3',
        entrypoint: '/pkg/entrypoint.py',
        configFile: '/pkg/config.json',
        dependencies: ['pandas'],
        testFile: '/pkg/tests/test.json',
        sfCliOrg: 'myorg',
        profile: 'staging',
      });

      expect(payload).to.deep.equal({
        entrypoint: '/pkg/entrypoint.py',
        configFile: '/pkg/config.json',
        dependencies: ['pandas'],
        profile: 'staging',
        testFile: '/pkg/tests/test.json',
        sfCliOrg: 'myorg',
      });
    });
  });

  describe('RUN_ENTRYPOINT_SHIM', () => {
    it('imports run_entrypoint from the SDK library (not the console-script)', () => {
      expect(RUN_ENTRYPOINT_SHIM).to.include('from datacustomcode.run import run_entrypoint');
    });

    it('reads its argument as JSON from argv[1] rather than interpolating', () => {
      expect(RUN_ENTRYPOINT_SHIM).to.include('json.loads(sys.argv[1])');
      // Guard against a regression that string-interpolates paths into the program.
      expect(RUN_ENTRYPOINT_SHIM).to.not.include('${');
    });

    it('forwards each camelCase payload key into run_entrypoint', () => {
      for (const key of ['entrypoint', 'configFile', 'dependencies', 'profile', 'testFile', 'sfCliOrg']) {
        expect(RUN_ENTRYPOINT_SHIM).to.include(`a["${key}"]`);
      }
    });
  });

  describe('runEntrypoint', () => {
    it('spawns python with the shim and a JSON payload argv element', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });
      child.emitClose(0);
      await promise;

      expect(calls).to.have.lengthOf(1);
      expect(calls[0].command).to.equal('python3');
      expect(calls[0].args[0]).to.equal('-c');
      expect(calls[0].args[1]).to.equal(RUN_ENTRYPOINT_SHIM);

      const payload = JSON.parse(calls[0].args[2]) as PythonRunPayload;
      expect(payload).to.deep.equal({
        entrypoint: '/pkg/entrypoint.py',
        configFile: null,
        dependencies: ['pandas', 'numpy'],
        profile: DEFAULT_PROFILE,
        testFile: null,
        sfCliOrg: 'myorg',
      });
    });

    it('spawns with the default timeout and unbuffered Python output', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });
      child.emitClose(0);
      await promise;

      expect(calls[0].options.timeout).to.equal(RUN_TIMEOUT_MS);
      expect(calls[0].options.env?.PYTHONUNBUFFERED).to.equal('1');
    });

    it('honors a custom timeout', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts({ timeoutMs: 1000 }), { spawn: fakeSpawn(child, calls) });
      child.emitClose(0);
      await promise;

      expect(calls[0].options.timeout).to.equal(1000);
    });

    it('sets the streams to utf8 so chunks arrive as strings', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });
      child.emitClose(0);
      await promise;

      expect(child.stdout?.encoding).to.equal('utf8');
      expect(child.stderr?.encoding).to.equal('utf8');
    });

    it('streams stdout/stderr chunks live and resolves with the trimmed accumulation', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const stdoutChunks: string[] = [];
      const stderrChunks: string[] = [];
      const promise = runEntrypoint(
        makeOpts({ onStdout: (c) => stdoutChunks.push(c), onStderr: (c) => stderrChunks.push(c) }),
        {
          spawn: fakeSpawn(child, calls),
        }
      );

      child.stdout?.push('hello ');
      child.stdout?.push('world\n');
      child.stderr?.push('a warning\n');
      child.emitClose(0);
      const result = await promise;

      expect(stdoutChunks).to.deep.equal(['hello ', 'world\n']);
      expect(stderrChunks).to.deep.equal(['a warning\n']);
      expect(result).to.deep.equal({ stdout: 'hello world', stderr: 'a warning', exitCode: 0 });
    });

    it('rejects with RunExecutionFailed on a non-zero exit, surfacing stderr', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });

      child.stderr?.push('Traceback (most recent call last): KeyError');
      child.emitClose(1);
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunExecutionFailed');
      expect(error.message).to.include('Traceback');
    });

    it('reports the exit code when the process fails without stderr', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });

      child.emitClose(3);
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunExecutionFailed');
      expect(error.message).to.include('3');
    });

    it('rejects with RunTerminated when a signal stopped the process (e.g. the timeout)', async () => {
      const child = new FakeChild();
      const promise = runEntrypoint(makeOpts({ timeoutMs: 300_000 }), { spawn: fakeSpawn(child, []) });

      child.emitClose(null, 'SIGTERM');
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunTerminated');
      expect(error.message).to.include('SIGTERM');
      expect(error.message).to.include('300 seconds');
    });

    it('rejects with RunAuthenticationFailed when stderr signals an auth problem', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });

      child.stderr?.push('Authentication failed while refreshing the token');
      child.emitClose(1);
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunAuthenticationFailed');
      expect(error.message).to.include('myorg');
    });

    it('rejects with RunAuthenticationFailed for invalid credentials', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts(), { spawn: fakeSpawn(child, calls) });

      child.stderr?.push('Invalid credentials supplied');
      child.emitClose(1);
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunAuthenticationFailed');
    });

    it('rejects with RunProcessStartFailed when the interpreter cannot start', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = runEntrypoint(makeOpts({ pythonCommand: 'python3.11' }), { spawn: fakeSpawn(child, calls) });

      child.emitError(new Error('spawn python3.11 ENOENT'));
      const error = await expectReject(promise);

      expect(error.name).to.equal('RunProcessStartFailed');
      expect(error.message).to.include('python3.11');
      expect(error.message).to.include('ENOENT');
    });
  });

  describe('PythonRunner.run', () => {
    it('delegates to runEntrypoint with the injected spawn', async () => {
      const child = new FakeChild();
      const calls: SpawnCall[] = [];
      const promise = PythonRunner.run(makeOpts(), { spawn: fakeSpawn(child, calls) });

      child.stdout?.push('done');
      child.emitClose(0);
      const result = await promise;

      expect(calls).to.have.lengthOf(1);
      expect(result.stdout).to.equal('done');
      expect(result.exitCode).to.equal(0);
    });
  });
});
