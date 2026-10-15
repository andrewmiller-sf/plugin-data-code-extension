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
import * as fs from 'node:fs';
import * as path from 'node:path';
import { expect } from 'chai';
import { SfError } from '@salesforce/core';
import {
  buildLineagePayload,
  generateLineage,
  GENERATE_LINEAGE_SHIM,
  LINEAGE_UNAVAILABLE_EXIT_CODE,
  LINEAGE_UNAVAILABLE_MARKER,
  parseLineageReport,
  type LineagePayload,
  type LineageReport,
  type LineageRunOptions,
} from '../../src/utils/lineageRunner.js';
import { RUN_TIMEOUT_MS, type RunnerChild, type RunnerStream, type SpawnFn } from '../../src/utils/pythonRunner.js';

async function expectReject(promise: Promise<unknown>): Promise<SfError> {
  try {
    await promise;
  } catch (err) {
    return err as SfError;
  }
  throw new Error('Expected promise to reject, but it resolved');
}

class FakeStream implements RunnerStream {
  private dataListeners: Array<(chunk: string) => void> = [];

  public setEncoding(): this {
    return this;
  }

  public on(event: 'data', listener: (chunk: string) => void): this {
    this.dataListeners.push(listener);
    return this;
  }

  public push(chunk: string): void {
    for (const listener of this.dataListeners) listener(chunk);
  }
}

class FakeChild implements RunnerChild {
  public stdout = new FakeStream();
  public stderr = new FakeStream();
  private closeListeners: Array<(code: number | null) => void> = [];
  private errorListeners: Array<(err: Error) => void> = [];

  public on(event: 'close', listener: (code: number | null) => void): this;
  public on(event: 'error', listener: (err: Error) => void): this;
  public on(event: 'close' | 'error', listener: ((code: number | null) => void) | ((err: Error) => void)): this {
    if (event === 'close') this.closeListeners.push(listener as (code: number | null) => void);
    else this.errorListeners.push(listener as (err: Error) => void);
    return this;
  }

  public emitClose(code: number | null): void {
    for (const listener of this.closeListeners) listener(code);
  }

  public emitError(err: Error): void {
    for (const listener of this.errorListeners) listener(err);
  }
}

type SpawnCall = {
  command: string;
  args: readonly string[];
  options: { env?: NodeJS.ProcessEnv; timeout?: number };
};

const REPORT: LineageReport = {
  dataLineage: [{ targetField: 'out__dll.id__c', sourceFields: ['in__dll.id'] }],
  unresolved: [{ targetField: 'out__dll.x__c', reason: 'untraceable source' }],
  noSources: [],
  udfFields: [],
  targets: ['out__dll'],
  sources: ['in__dll'],
  pairCount: 1,
};

function payloadOf(call: SpawnCall): LineagePayload {
  return JSON.parse(call.args[2]) as LineagePayload;
}

/**
 * A spawn seam that, like the real shim, acts on the payload asynchronously: `behave`
 * receives the child and payload once the runner has attached its listeners.
 */
function fakeSpawn(calls: SpawnCall[], behave: (child: FakeChild, payload: LineagePayload) => void): SpawnFn {
  return (command, args, options) => {
    const call = { command, args, options };
    calls.push(call);
    const child = new FakeChild();
    setImmediate(() => behave(child, payloadOf(call)));
    return child;
  };
}

function succeed(report: LineageReport = REPORT): (child: FakeChild, payload: LineagePayload) => void {
  return (child, payload) => {
    fs.writeFileSync(payload.resultFile, JSON.stringify(report));
    child.emitClose(0);
  };
}

function makeOpts(overrides: Partial<LineageRunOptions> = {}): LineageRunOptions {
  return {
    pythonCommand: 'python3',
    entrypoint: '/pkg/payload/entrypoint.py',
    dependencies: ['pandas'],
    sfCliOrg: 'myorg',
    ...overrides,
  };
}

describe('lineageRunner', () => {
  describe('buildLineagePayload', () => {
    it('maps options to the shim payload with defaults', () => {
      expect(buildLineagePayload(makeOpts(), '/tmp/x/lineage.json')).to.deep.equal({
        entrypoint: '/pkg/payload/entrypoint.py',
        configFile: null,
        dependencies: ['pandas'],
        profile: 'default',
        sfCliOrg: 'myorg',
        resultFile: '/tmp/x/lineage.json',
      });
    });

    it('passes through config file and profile', () => {
      const payload = buildLineagePayload(makeOpts({ configFile: '/c.yaml', profile: 'p' }), '/r.json');
      expect(payload.configFile).to.equal('/c.yaml');
      expect(payload.profile).to.equal('p');
    });
  });

  describe('GENERATE_LINEAGE_SHIM', () => {
    it('calls the SDK library, not the CLI', () => {
      expect(GENERATE_LINEAGE_SHIM).to.include('from datacustomcode.lineage import generate_lineage');
      expect(GENERATE_LINEAGE_SHIM).to.include('json.dump(result.to_dict(), f)');
      expect(GENERATE_LINEAGE_SHIM).not.to.include('datacustomcode.cli');
    });

    it('exits with the dedicated code and marker when the SDK lacks lineage', () => {
      expect(GENERATE_LINEAGE_SHIM).to.include(`sys.exit(${LINEAGE_UNAVAILABLE_EXIT_CODE})`);
      expect(GENERATE_LINEAGE_SHIM).to.include(LINEAGE_UNAVAILABLE_MARKER);
    });
  });

  describe('parseLineageReport', () => {
    const valid = {
      dataLineage: [],
      unresolved: [],
      noSources: [],
      udfFields: [],
      targets: [],
      sources: [],
      pairCount: 0,
    };

    it('returns a well-formed report', () => {
      expect(parseLineageReport(JSON.stringify(valid))).to.deep.equal(valid);
    });

    for (const [name, raw, detail] of [
      ['malformed JSON', '{', 'JSON'],
      ['a non-object', '[]', 'expected a JSON object'],
      ['missing fields', JSON.stringify({ ...valid, udfFields: undefined, noSources: null }), 'noSources, udfFields'],
    ]) {
      it(`rejects ${name}`, () => {
        try {
          parseLineageReport(raw);
          expect.fail('Should have thrown');
        } catch (error) {
          expect((error as SfError).name).to.equal('LineageResultInvalid');
          expect((error as SfError).message).to.include(detail);
        }
      });
    }
  });

  describe('generateLineage', () => {
    it('passes the payload as its own argv element and returns the result file', async () => {
      const calls: SpawnCall[] = [];
      const entrypoint = '/pkg/"; import os; os.system("x")  #/entrypoint.py';
      const report = await generateLineage(makeOpts({ entrypoint }), { spawn: fakeSpawn(calls, succeed()) });

      expect(report).to.deep.equal(REPORT);
      expect(calls).to.have.length(1);
      expect(calls[0].command).to.equal('python3');
      expect(calls[0].args[0]).to.equal('-c');
      expect(calls[0].args[1]).to.equal(GENERATE_LINEAGE_SHIM);
      expect(payloadOf(calls[0]).entrypoint).to.equal(entrypoint);
      expect(calls[0].options.timeout).to.equal(RUN_TIMEOUT_MS);
      expect(calls[0].options.env?.PYTHONUNBUFFERED).to.equal('1');
    });

    it('removes the temp directory after success', async () => {
      const calls: SpawnCall[] = [];
      await generateLineage(makeOpts(), { spawn: fakeSpawn(calls, succeed()) });
      expect(fs.existsSync(path.dirname(payloadOf(calls[0]).resultFile))).to.equal(false);
    });

    it('removes the temp directory after failure', async () => {
      const calls: SpawnCall[] = [];
      await expectReject(
        generateLineage(makeOpts(), {
          spawn: fakeSpawn(calls, (child) => {
            child.stderr.push('boom');
            child.emitClose(1);
          }),
        })
      );
      expect(fs.existsSync(path.dirname(payloadOf(calls[0]).resultFile))).to.equal(false);
    });

    it('streams stdout and stderr chunks', async () => {
      const out: string[] = [];
      const err: string[] = [];
      await generateLineage(makeOpts({ onStdout: (c) => out.push(c), onStderr: (c) => err.push(c) }), {
        spawn: fakeSpawn([], (child, payload) => {
          child.stdout.push('hello');
          child.stderr.push('spark log');
          succeed()(child, payload);
        }),
      });
      expect(out).to.deep.equal(['hello']);
      expect(err).to.deep.equal(['spark log']);
    });

    it('maps the unavailable exit code to LineageSdkTooOld', async () => {
      const err = await expectReject(
        generateLineage(makeOpts(), {
          spawn: fakeSpawn([], (child) => {
            child.stderr.push(`${LINEAGE_UNAVAILABLE_MARKER}\n`);
            child.emitClose(LINEAGE_UNAVAILABLE_EXIT_CODE);
          }),
        })
      );
      expect(err.name).to.equal('LineageSdkTooOld');
      expect(err.actions?.join(' ')).to.include('pip install -U salesforce-data-customcode');
    });

    it("does not mistake a script's own exit code 3 for an old SDK", async () => {
      const err = await expectReject(
        generateLineage(makeOpts(), {
          spawn: fakeSpawn([], (child) => {
            child.stderr.push('SystemExit: 3');
            child.emitClose(LINEAGE_UNAVAILABLE_EXIT_CODE);
          }),
        })
      );
      expect(err.name).to.equal('RunExecutionFailed');
    });

    it('maps authentication failures', async () => {
      const err = await expectReject(
        generateLineage(makeOpts(), {
          spawn: fakeSpawn([], (child) => {
            child.stderr.push('Authentication failed for org');
            child.emitClose(1);
          }),
        })
      );
      expect(err.name).to.equal('RunAuthenticationFailed');
      expect(err.message).to.include('myorg');
    });

    it('maps a failure to start the interpreter', async () => {
      const err = await expectReject(
        generateLineage(makeOpts(), { spawn: fakeSpawn([], (child) => child.emitError(new Error('ENOENT'))) })
      );
      expect(err.name).to.equal('RunProcessStartFailed');
    });

    it('honors a custom timeout', async () => {
      const calls: SpawnCall[] = [];
      await generateLineage(makeOpts({ timeoutMs: 1234 }), { spawn: fakeSpawn(calls, succeed()) });
      expect(calls[0].options.timeout).to.equal(1234);
    });

    it('fails with LineageResultMissing when the shim exits 0 without a result', async () => {
      const err = await expectReject(
        generateLineage(makeOpts(), { spawn: fakeSpawn([], (child) => child.emitClose(0)) })
      );
      expect(err.name).to.equal('LineageResultMissing');
    });
  });
});
