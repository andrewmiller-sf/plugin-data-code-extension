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
  udfFields: [],
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
    const result = await LineageGenerate.run([
      ...baseArgs(),
      '--dependencies',
      'pandas, numpy',
      '--accept-lineage-ownership',
    ]);

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
    expect(fs.readFileSync(configPath, 'utf8')).to.equal(JSON.stringify(config, null, 2));

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

  it('lists UDF-computed fields only when a UDF was detected', async () => {
    await LineageGenerate.run([...baseArgs(), '--dry-run']);
    expect(warnings().some((w) => w.includes('user-defined functions'))).to.be.false;

    sfCommandStubs.warn.resetHistory();
    generateStub.resolves({ ...REPORT, udfFields: ['out__dll.const__c', 'out__dll.name__c'] });
    await LineageGenerate.run([...baseArgs(), '--dry-run']);
    const udfWarning = warnings().find((w) => w.includes('user-defined functions'));
    expect(udfWarning).to.include('2 target fields');
    expect(udfWarning).to.include('out__dll.const__c');
    expect(udfWarning).to.include('out__dll.name__c');
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

  it('warns that existing lineage still ships when the result is empty', async () => {
    const existing = [{ targetField: 'out__dll.old', sourceFields: ['in__dll.old'] }];
    writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: existing });
    generateStub.resolves({ ...REPORT, dataLineage: [], pairCount: 0 });
    const result = await LineageGenerate.run(baseArgs());
    expect(result.written).to.equal(false);
    expect(readConfig().dataLineage).to.deep.equal(existing);
    const warning = warnings().find((w) => w.includes('No lineage could be generated'));
    expect(warning).to.include('existing 1 dataLineage entries still apply');
    expect(warning).to.not.include('no-lineage path');
  });

  it('lists the entries that replacing drops or changes', async () => {
    writeConfig({
      dataspace: 'default',
      permissions: PERMISSIONS,
      dataLineage: [
        { targetField: 'out__dll.old', sourceFields: ['in__dll.old'] },
        { targetField: 'out__dll.id__c', sourceFields: ['in__dll.other'] },
      ],
    });
    await LineageGenerate.run([...baseArgs(), '--dry-run']);
    const logged = sfCommandStubs.log
      .getCalls()
      .map((call) => String(call.args[0]))
      .join('\n');
    expect(logged).to.match(/drops:\n {2}- out__dll\.old/);
    expect(logged).to.match(/changes:\n {2}- out__dll\.id__c/);
  });

  it('rejects streaming scripts before the run', async () => {
    writeConfig({ dataspace: 'default', permissions: PERMISSIONS, streamingSource: { name: 'in__dll' } });
    try {
      await LineageGenerate.run(baseArgs());
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageStreamingPackage');
    }
    expect(generateStub.called).to.be.false;
  });

  it('rejects a read-only config.json before the run', async function () {
    if (process.platform === 'win32' || process.getuid?.() === 0) this.skip();
    fs.chmodSync(configPath, 0o444);
    try {
      await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership']);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageConfigUnwritable');
    } finally {
      fs.chmodSync(configPath, 0o644);
    }
    expect(generateStub.called).to.be.false;
  });

  it('--dry-run does not need a writable config.json', async function () {
    if (process.platform === 'win32' || process.getuid?.() === 0) this.skip();
    fs.chmodSync(configPath, 0o444);
    try {
      const result = await LineageGenerate.run([...baseArgs(), '--dry-run']);
      expect(result.written).to.equal(false);
    } finally {
      fs.chmodSync(configPath, 0o644);
    }
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

  it('rejects an --output-file in a missing directory before the run', async () => {
    const outputFile = path.join(testDir, 'missing', 'lineage-result.json');
    try {
      await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputFile]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageOutputFileUnwritable');
    }
    expect(generateStub.called).to.be.false;
  });

  it('rejects an --output-file that is a directory before the run', async () => {
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lineage-out-'));
    try {
      await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputDir]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageOutputFileUnwritable');
      expect((error as SfError).message).to.include('not a regular file');
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    expect(generateStub.called).to.be.false;
  });

  it('rejects a read-only existing --output-file before the run', async function () {
    if (process.platform === 'win32' || process.getuid?.() === 0) this.skip();
    const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lineage-out-'));
    const outputFile = path.join(outputDir, 'lineage-result.json');
    fs.writeFileSync(outputFile, '{}');
    fs.chmodSync(outputFile, 0o444);
    try {
      await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputFile]);
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageOutputFileUnwritable');
    } finally {
      fs.rmSync(outputDir, { recursive: true, force: true });
    }
    expect(generateStub.called).to.be.false;
  });

  it('fails clearly when the target org has no username', async () => {
    (Org.create as sinon.SinonStub).resolves({
      getUsername: () => undefined,
      getConnection: () => mockConnection,
    } as unknown as Org);
    try {
      await LineageGenerate.run(baseArgs());
      expect.fail('Should have thrown');
    } catch (error) {
      expect((error as SfError).name).to.equal('LineageNoUsername');
    }
    expect(generateStub.called).to.be.false;
  });

  describe('--output-file collisions', () => {
    async function expectCollision(outputFile: string): Promise<void> {
      const before = fs.readFileSync(configPath, 'utf8');
      try {
        await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputFile]);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageOutputFileCollision');
      }
      expect(generateStub.called).to.be.false;
      expect(fs.readFileSync(configPath, 'utf8')).to.equal(before);
    }

    it('rejects the package config.json', async () => {
      await expectCollision(configPath);
    });

    it('rejects the entrypoint', async () => {
      await expectCollision(entrypointPath);
    });

    it('rejects a symlink to config.json', async () => {
      const link = path.join(testDir, 'link.json');
      fs.symlinkSync(configPath, link);
      await expectCollision(link);
    });

    it('rejects a new file inside payload/', async () => {
      await expectCollision(path.join(testDir, 'payload', 'lineage-result.json'));
    });

    it('rejects SDK package metadata', async () => {
      await expectCollision(path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'));
    });

    it('rejects the project config.yaml', async () => {
      fs.writeFileSync(path.join(testDir, 'config.yaml'), 'reader_config: {}\n');
      await expectCollision(path.join(testDir, 'config.yaml'));
    });

    for (const name of ['requirements.txt', 'build_native_dependencies.sh', 'Dockerfile.dependencies']) {
      it(`rejects the packaged build file ${name}`, async () => {
        const buildFile = path.join(testDir, name);
        fs.writeFileSync(buildFile, 'original\n');
        await expectCollision(buildFile);
        expect(fs.readFileSync(buildFile, 'utf8')).to.equal('original\n');
      });

      it(`rejects the packaged build file ${name} when it does not exist yet`, async () => {
        const buildFile = path.join(testDir, name);
        fs.rmSync(buildFile, { force: true });
        await expectCollision(buildFile);
        expect(fs.existsSync(buildFile)).to.be.false;
      });

      it(`rejects a dangling symlink to the missing packaged build file ${name}`, async () => {
        const buildFile = path.join(testDir, name);
        fs.rmSync(buildFile, { force: true });
        const link = path.join(testDir, `link-${name}`);
        fs.symlinkSync(buildFile, link);
        await expectCollision(link);
        expect(fs.existsSync(buildFile)).to.be.false;
      });

      it(`rejects the missing packaged build file ${name} spelled in another case`, async function () {
        if (process.platform !== 'darwin' && process.platform !== 'win32') {
          this.skip();
        }
        const buildFile = path.join(testDir, name);
        fs.rmSync(buildFile, { force: true });
        await expectCollision(path.join(testDir, name.toUpperCase()));
        expect(fs.readdirSync(testDir).some((entry) => entry.toLowerCase() === name.toLowerCase())).to.be.false;
      });
    }

    it('rejects a symlinked directory that points into payload/', async () => {
      const link = path.join(testDir, 'payload-link');
      fs.symlinkSync(path.join(testDir, 'payload'), link);
      await expectCollision(path.join(link, 'lineage-result.json'));
    });

    it('rejects payload/config.json when it is a symlink to a config outside payload/', async () => {
      const shared = path.join(testDir, 'shared-config.json');
      fs.renameSync(configPath, shared);
      fs.symlinkSync(shared, configPath);
      const before = fs.readFileSync(shared, 'utf8');
      await expectCollision(configPath);
      expect(fs.readFileSync(shared, 'utf8')).to.equal(before);
    });

    it('rejects a hard link to config.json', async () => {
      const link = path.join(testDir, 'hardlink.json');
      fs.linkSync(configPath, link);
      await expectCollision(link);
    });

    it('rejects a hard link to the SDK metadata', async () => {
      const link = path.join(testDir, 'sdk-hardlink.json');
      fs.linkSync(path.join(testDir, '.datacustomcode_proj', 'sdk_config.json'), link);
      await expectCollision(link);
    });

    it('allows a new file at the project root', async () => {
      const outputFile = path.join(testDir, 'lineage-result.json');
      await LineageGenerate.run([...baseArgs(), '--dry-run', '--output-file', outputFile]);
      expect(fs.existsSync(outputFile)).to.be.true;
    });
  });

  it('keeps config.json edits made while lineage was generating', async () => {
    generateStub.callsFake(async () => {
      writeConfig({ ...readConfig(), dataspace: 'edited' });
      return structuredClone(REPORT);
    });
    const result = await LineageGenerate.run(baseArgs());
    expect(result.written).to.equal(true);
    expect(readConfig().dataspace).to.equal('edited');
    expect(readConfig().dataLineage).to.deep.equal(REPORT.dataLineage);
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

  describe('accepting lineage ownership', () => {
    it('asks the customer to accept ownership before the first write', async () => {
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.deep.include({
        message: 'Accept and write dataLineage to config.json?',
        defaultAnswer: false,
      });
      expect(warnings().some((w) => w.includes("You're responsible for reviewing and maintaining it"))).to.be.true;
      expect(result.written).to.equal(true);
      expect(readConfig().dataLineage).to.deep.equal(REPORT.dataLineage);
    });

    it('does not write when the customer declines', async () => {
      confirmStub.resolves(false);
      const result = await LineageGenerate.run(baseArgs());
      expect(result.written).to.equal(false);
      expect(readConfig()).to.not.have.property('dataLineage');
    });

    it('--accept-lineage-ownership writes without asking but still shows the warning', async () => {
      const result = await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership']);
      expect(confirmStub.called).to.be.false;
      expect(warnings().some((w) => w.includes('best-effort analysis'))).to.be.true;
      expect(result.written).to.equal(true);
    });

    it('--no-prompt does not accept ownership', async () => {
      await LineageGenerate.run([...baseArgs(), '--no-prompt']);
      expect(confirmStub.calledOnce).to.be.true;
    });

    it('fails without --accept-lineage-ownership when not interactive', async () => {
      process.stdin.isTTY = false;
      try {
        await LineageGenerate.run([...baseArgs(), '--no-prompt']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageOwnershipNotAccepted');
      }
      expect(generateStub.called).to.be.false;
      expect(confirmStub.called).to.be.false;
      expect(readConfig()).to.not.have.property('dataLineage');
    });

    it('fails before the run even when the result would be empty', async () => {
      process.stdin.isTTY = false;
      generateStub.resolves({ ...REPORT, dataLineage: [], pairCount: 0 });
      try {
        await LineageGenerate.run(baseArgs());
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageOwnershipNotAccepted');
        expect((error as SfError).actions?.join(' ')).to.include('--dry-run');
      }
      expect(generateStub.called).to.be.false;
    });

    it('fails with --json without --accept-lineage-ownership', async () => {
      try {
        await LineageGenerate.run([...baseArgs(), '--json']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageOwnershipNotAccepted');
      }
      expect(generateStub.called).to.be.false;
      expect(readConfig()).to.not.have.property('dataLineage');
    });

    it('--dry-run needs no acceptance', async () => {
      process.stdin.isTTY = false;
      const result = await LineageGenerate.run([...baseArgs(), '--dry-run']);
      expect(confirmStub.called).to.be.false;
      expect(result.written).to.equal(false);
    });
  });

  describe('replacing existing lineage', () => {
    const OLD = [{ targetField: 'out__dll.old', sourceFields: ['in__dll.old'] }];

    beforeEach(() => {
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: OLD });
    });

    it('asks once to accept ownership and replace', async () => {
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.deep.include({
        message: 'Accept and replace the existing dataLineage in config.json?',
        defaultAnswer: false,
        ms: 10 * 60 * 1000,
      });
      expect(warnings().some((w) => w.includes('best-effort analysis'))).to.be.true;
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

    it('asks only about replacing once ownership is accepted', async () => {
      await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership']);
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.have.property(
        'message',
        'Replace the existing dataLineage in config.json?'
      );
    });

    it('--no-prompt alone asks only to accept ownership', async () => {
      await LineageGenerate.run([...baseArgs(), '--no-prompt']);
      expect(confirmStub.calledOnce).to.be.true;
      expect(confirmStub.firstCall.args[0]).to.have.property('message', 'Accept and write dataLineage to config.json?');
    });

    it('--accept-lineage-ownership --no-prompt replaces without asking', async () => {
      const result = await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership', '--no-prompt']);
      expect(confirmStub.called).to.be.false;
      expect(result.written).to.equal(true);
    });

    it('does not replace lineage edited while the prompt was pending', async () => {
      const edited = [{ targetField: 'out__dll.edited', sourceFields: ['in__dll.edited'] }];
      confirmStub.callsFake(async () => {
        writeConfig({ ...readConfig(), dataLineage: edited });
        return true;
      });
      try {
        await LineageGenerate.run(baseArgs());
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageChangedDuringConfirm');
      }
      expect(readConfig().dataLineage).to.deep.equal(edited);
    });

    it('does not write when permissions change while the prompt was pending', async () => {
      confirmStub.callsFake(async () => {
        writeConfig({ ...readConfig(), permissions: { read: {}, write: {} } });
        return true;
      });
      try {
        await LineageGenerate.run(baseArgs());
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageChangedDuringConfirm');
      }
      expect(readConfig().permissions).to.deep.equal({ read: {}, write: {} });
    });

    it('fails without --no-prompt when not interactive', async () => {
      process.stdin.isTTY = false;
      try {
        await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageReplaceNotConfirmed');
      }
      expect(generateStub.called).to.be.false;
      expect(confirmStub.called).to.be.false;
      expect(readConfig().dataLineage).to.deep.equal(OLD);
    });

    it('fails with --json without --no-prompt', async () => {
      try {
        await LineageGenerate.run([...baseArgs(), '--json', '--accept-lineage-ownership']);
        expect.fail('Should have thrown');
      } catch (error) {
        expect((error as SfError).name).to.equal('LineageReplaceNotConfirmed');
      }
      expect(generateStub.called).to.be.false;
      expect(readConfig().dataLineage).to.deep.equal(OLD);
    });

    it('rewrites duplicate targets even when the diff is empty', async () => {
      const duplicated = [...REPORT.dataLineage, REPORT.dataLineage[0]];
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: duplicated });
      const result = await LineageGenerate.run([...baseArgs(), '--accept-lineage-ownership', '--no-prompt']);
      expect(result.written).to.equal(true);
      expect(readConfig().dataLineage).to.deep.equal(REPORT.dataLineage);
    });

    it('asks before replacing a section with only malformed entries', async () => {
      const malformed = [{ targetField: 'out__dll.id__c', sourceFields: [null] }];
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: malformed });
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.calledOnce).to.be.true;
      expect(result.written).to.equal(true);
      expect(readConfig().dataLineage).to.deep.equal(REPORT.dataLineage);
    });

    it('does not prompt when the generated lineage is identical', async () => {
      writeConfig({ dataspace: 'default', permissions: PERMISSIONS, dataLineage: REPORT.dataLineage });
      const result = await LineageGenerate.run(baseArgs());
      expect(confirmStub.called).to.be.false;
      expect(result.written).to.equal(false);
    });
  });
});
