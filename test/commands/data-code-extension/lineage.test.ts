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
import * as os from 'node:os';
import { TestContext } from '@salesforce/core/testSetup';
import { expect } from 'chai';
import { SfCommand, stubSfCommandUx } from '@salesforce/sf-plugins-core';
import { SfError, Org, Connection } from '@salesforce/core';
import * as sinon from 'sinon';
import LineageGenerate from '../../../src/commands/data-code-extension/script/lineage/generate.js';
import { LineageRunner, type LineageReport } from '../../../src/utils/lineageRunner.js';
import { PythonChecker } from '../../../src/utils/pythonChecker.js';
import { PipChecker } from '../../../src/utils/pipChecker.js';

const PERMISSIONS = { read: { dlo: ['in__dll'] }, write: { dlo: ['out__dll'] } };

const REPORT: LineageReport = {
  dataLineage: [
    { targetField: 'out__dll.id__c', sourceFields: ['in__dll.id'] },
    { targetField: 'out__dll.name__c', sourceFields: ['in__dll.first', 'in__dll.last'] },
  ],
  unresolved: [{ targetField: 'out__dll.x__c', reason: 'untraceable source' }],
  noSources: ['out__dll.const__c'],
  targets: ['out__dll'],
  sources: ['in__dll'],
  pairCount: 3,
};

describe('data-code-extension script lineage generate', () => {
  const $$ = new TestContext();
  let sfCommandStubs: ReturnType<typeof stubSfCommandUx>;
  let generateStub: sinon.SinonStub;
  let confirmStub: sinon.SinonStub;
  let mockConnection: Connection;
  let testDir: string;
  let entrypointPath: string;
  let configPath: string;
  let originalIsTTY: boolean | undefined;

  const baseArgs = (): string[] => ['--entrypoint', entrypointPath, '--target-org', 'test@example.com'];

  function writeConfig(config: Record<string, unknown>): void {
    fs.writeFileSync(configPath, JSON.stringify(config));
  }

  function readConfig(): Record<string, unknown> {
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
  }

  function warnings(): string[] {
    return sfCommandStubs.warn.getCalls().map((call) => String(call.args[0]));
  }

  beforeEach(() => {
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lineage-'));
    fs.mkdirSync(path.join(testDir, '.datacustomcode_proj'));
    fs.writeFileSync(path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'), JSON.stringify({ type: 'script' }));
    fs.mkdirSync(path.join(testDir, 'payload'));
    entrypointPath = path.join(testDir, 'payload', 'entrypoint.py');
    fs.writeFileSync(entrypointPath, 'print("hi")\n');
    configPath = path.join(testDir, 'payload', 'config.json');
    writeConfig({ entryPoint: 'entrypoint.py', dataspace: 'default', permissions: PERMISSIONS });

    sfCommandStubs = stubSfCommandUx($$.SANDBOX);
    mockConnection = { refreshAuth: $$.SANDBOX.stub().resolves() } as unknown as Connection;
    $$.SANDBOX.stub(Org, 'create').resolves({
      getUsername: () => 'test@example.com',
      getConnection: () => mockConnection,
    } as unknown as Org);
    $$.SANDBOX.stub(PythonChecker, 'checkPython311').resolves({
      command: 'python3',
      version: '3.11.5',
      major: 3,
      minor: 11,
      patch: 5,
    });
    $$.SANDBOX.stub(PipChecker, 'checkPackage').resolves({
      name: 'salesforce-data-customcode',
      version: '1.0.0',
      location: '/site-packages',
      pipCommand: 'pip',
    });
    $$.SANDBOX.stub(PipChecker, 'checkForUpdate').resolves(null);
    generateStub = $$.SANDBOX.stub(LineageRunner, 'generate').resolves(structuredClone(REPORT));
    confirmStub = $$.SANDBOX.stub(SfCommand.prototype, 'confirm').resolves(true);

    originalIsTTY = process.stdin.isTTY;
    process.stdin.isTTY = true;
  });

  afterEach(() => {
    process.stdin.isTTY = originalIsTTY as boolean;
    $$.restore();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('is hidden and supports --json', () => {
    expect(LineageGenerate.hidden).to.equal(true);
    expect(LineageGenerate.enableJsonFlag).to.equal(true);
  });

  it('writes lineage into config.json, keeps other keys, and forwards run options', async () => {
    const result = await LineageGenerate.run([...baseArgs(), '--dependencies', 'pandas, numpy']);

    const opts = generateStub.firstCall.args[0] as Record<string, unknown>;
    expect(opts.pythonCommand).to.equal('python3');
    expect(opts.entrypoint).to.equal(entrypointPath);
    expect(opts.sfCliOrg).to.equal('test@example.com');
    expect(opts.dependencies).to.deep.equal(['pandas', 'numpy']);
    expect((mockConnection.refreshAuth as sinon.SinonStub).calledOnce).to.be.true;

    const config = readConfig();
    expect(config.dataLineage).to.deep.equal(REPORT.dataLineage);
    expect(config.permissions).to.deep.equal(PERMISSIONS);
    expect(config.entryPoint).to.equal('entrypoint.py');
    expect(fs.readFileSync(configPath, 'utf8').endsWith('}\n')).to.be.true;

    expect(result.written).to.equal(true);
    expect(result.entryCount).to.equal(2);
    expect(result.pairCount).to.equal(3);
    expect(result.diff.added).to.have.length(2);
    expect(confirmStub.called).to.be.false;
    expect(sfCommandStubs.log.calledWithMatch('Generated 2 dataLineage entries with 3')).to.be.true;
  });

  it('always lists unresolved fields', async () => {
    await LineageGenerate.run(baseArgs());
    expect(warnings().some((w) => w.includes('out__dll.x__c (untraceable source)'))).to.be.true;
  });

  it('warns when lineage references objects missing from permissions', async () => {
    writeConfig({ dataspace: 'default', permissions: { read: { dlo: [] }, write: { dlo: ['out__dll'] } } });
    const result = await LineageGenerate.run(baseArgs());
    expect(result.permissionGaps).to.deep.equal({ targets: [], sources: ['in__dll'] });
    expect(warnings().some((w) => w.includes('read: in__dll'))).to.be.true;
    expect(result.written).to.equal(true);
  });

  it('does not write an empty result', async () => {
    generateStub.resolves({ ...REPORT, dataLineage: [], pairCount: 0 });
    const result = await LineageGenerate.run(baseArgs());
    expect(result.written).to.equal(false);
    expect(readConfig()).not.to.have.property('dataLineage');
    expect(warnings().some((w) => w.includes('No lineage could be generated'))).to.be.true;
  });

  it('--dry-run never writes or prompts', async () => {
    writeConfig({
      dataspace: 'default',
      permissions: PERMISSIONS,
      dataLineage: [{ targetField: 'out__dll.old', sourceFields: ['in__dll.old'] }],
    });
    const result = await LineageGenerate.run([...baseArgs(), '--dry-run']);
    expect(result.written).to.equal(false);
    expect(result.dryRun).to.equal(true);
    expect(result.pairCount).to.equal(3);
    expect(confirmStub.called).to.be.false;
    expect((readConfig().dataLineage as unknown[])[0]).to.deep.equal({
      targetField: 'out__dll.old',
      sourceFields: ['in__dll.old'],
    });
  });

  it('writes the full result to --output-file', async () => {
    const outputFile = path.join(testDir, 'out', '..', 'lineage-result.json');
    const result = await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputFile]);
    expect(JSON.parse(fs.readFileSync(outputFile, 'utf8'))).to.deep.equal(REPORT);
    expect(result.outputFile).to.equal(path.resolve(outputFile));
  });

  it('rejects function packages before running', async () => {
    fs.writeFileSync(
      path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'),
      JSON.stringify({ type: 'function' })
    );
    try {
      await LineageGenerate.run(baseArgs());
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageFunctionPackage');
    }
    expect(generateStub.called).to.be.false;
  });

  it('fails with ConfigNotFound before running when config.json is missing', async () => {
    fs.rmSync(configPath);
    try {
      await LineageGenerate.run(baseArgs());
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('ConfigNotFound');
    }
    expect(generateStub.called).to.be.false;
  });

  describe('replacing existing lineage', () => {
    const OLD = [{ targetField: 'out__dll.old', sourceFields: ['in__dll.old'] }];

    beforeEach(() => {
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: OLD });
    });

    it('replaces after the customer confirms', async () => {
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.have.property('defaultAnswer', false);
      expect(warnings().some((w) => w.includes('This replaces the existing dataLineage section'))).to.be.true;
      expect(result.written).to.equal(true);
      expect(result.diff.removed).to.deep.equal(['out__dll.old']);
      expect(readConfig().dataLineage).to.deep.equal(REPORT.dataLineage);
    });

    it('keeps existing lineage when the customer declines', async () => {
      confirmStub.resolves(false);
      const result = await LineageGenerate.run(baseArgs());
      expect(result.written).to.equal(false);
      expect(readConfig().dataLineage).to.deep.equal(OLD);
    });

    it('--no-prompt replaces without asking', async () => {
      const result = await LineageGenerate.run([...baseArgs(), '--no-prompt']);
      expect(confirmStub.called).to.be.false;
      expect(result.written).to.equal(true);
    });

    it('fails without --no-prompt when not interactive', async () => {
      process.stdin.isTTY = false;
      try {
        await LineageGenerate.run(baseArgs());
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageReplaceNotConfirmed');
      }
      expect(confirmStub.called).to.be.false;
      expect(readConfig().dataLineage).to.deep.equal(OLD);
    });

    it('fails with --json without --no-prompt', async () => {
      try {
        await LineageGenerate.run([...baseArgs(), '--json']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageReplaceNotConfirmed');
      }
      expect(readConfig().dataLineage).to.deep.equal(OLD);
    });

    it('does not prompt when the generated lineage is identical', async () => {
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: REPORT.dataLineage });
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.called).to.be.false;
      expect(result.written).to.equal(false);
    });
  });
});
