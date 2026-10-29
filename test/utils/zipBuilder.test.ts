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
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
  readFileSync,
  symlinkSync,
  chmodSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { expect } from 'chai';
import JSZip from 'jszip';
import {
  createZip,
  dockerBuildCmd,
  dockerRunCmd,
  hasNonemptyRequirementsFile,
  prepareDependencyArchive,
  zip,
  ZIP_FILE_NAME,
  type DockerRunner,
} from '../../src/utils/zipBuilder.js';

const SDK_CONFIG_DIR = '.datacustomcode_proj';
const SDK_CONFIG_FILE = 'sdk_config.json';

function makeTempDir(prefix = 'zipBuilder-'): string {
  return mkdtempSync(path.join(tmpdir(), prefix));
}

function writeSdkConfig(baseDir: string, config: unknown): void {
  const sdkDir = path.join(baseDir, SDK_CONFIG_DIR);
  mkdirSync(sdkDir, { recursive: true });
  writeFileSync(path.join(sdkDir, SDK_CONFIG_FILE), JSON.stringify(config, null, 2));
}

describe('zipBuilder.hasNonemptyRequirementsFile', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns false when requirements.txt is missing', () => {
    expect(hasNonemptyRequirementsFile(tempDir)).to.equal(false);
  });

  it('returns false when requirements.txt only has comments and blank lines', () => {
    writeFileSync(path.join(tempDir, 'requirements.txt'), '# comment\n\n   \n# another\n');
    expect(hasNonemptyRequirementsFile(tempDir)).to.equal(false);
  });

  it('returns true when requirements.txt has at least one non-comment line', () => {
    writeFileSync(path.join(tempDir, 'requirements.txt'), '# comment\npandas==2.0.0\n');
    expect(hasNonemptyRequirementsFile(tempDir)).to.equal(true);
  });

  it('treats indented comments as comments', () => {
    writeFileSync(path.join(tempDir, 'requirements.txt'), '   # indented comment\n');
    expect(hasNonemptyRequirementsFile(tempDir)).to.equal(false);
  });
});

describe('zipBuilder docker command builders', () => {
  const IMAGE = 'datacloud-custom-code-dependency-builder';

  it('builds a docker build command without --network for the default network', () => {
    expect(dockerBuildCmd('default')).to.deep.equal(['build', '-t', IMAGE, '--file', 'Dockerfile.dependencies', '.']);
  });

  it('places --network before the build-context path so docker parses it as an option', () => {
    const args = dockerBuildCmd('host');
    expect(args).to.deep.equal(['build', '-t', IMAGE, '--file', 'Dockerfile.dependencies', '--network', 'host', '.']);
    // `docker build [OPTIONS] PATH`: the context '.' must be the final arg and
    // --network must precede it, never trail it.
    expect(args.indexOf('--network')).to.be.lessThan(args.indexOf('.'));
    expect(args[args.length - 1]).to.equal('.');
  });

  it('builds a docker run command with the temp dir mounted', () => {
    expect(dockerRunCmd('default', '/tmp/work')).to.deep.equal(['run', '--rm', '-v', '/tmp/work:/workspace', IMAGE]);
  });

  it('places --network before the image name so docker parses it as an option, not a command', () => {
    const args = dockerRunCmd('host', '/tmp/work');
    expect(args).to.deep.equal(['run', '--rm', '-v', '/tmp/work:/workspace', '--network', 'host', IMAGE]);
    // `docker run [OPTIONS] IMAGE [COMMAND]`: anything after the image is treated
    // as the in-container command. --network must come before the image name.
    expect(args.indexOf('--network')).to.be.lessThan(args.indexOf(IMAGE));
    expect(args[args.length - 1]).to.equal(IMAGE);
  });

  it('normalizes Windows-style backslashes in the mount path', () => {
    const out = dockerRunCmd('host', 'C:\\Users\\x\\tmp');
    expect(out).to.include('C:/Users/x/tmp:/workspace');
    expect(out.indexOf('--network')).to.be.lessThan(out.indexOf(IMAGE));
  });
});

describe('zipBuilder.createZip', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('creates deployment.zip excluding .DS_Store and external_callout_config.json', async () => {
    const payload = path.join(tempDir, 'payload');
    mkdirSync(path.join(payload, 'sub'), { recursive: true });
    writeFileSync(path.join(payload, 'a.py'), 'print(1)');
    writeFileSync(path.join(payload, 'sub', 'b.py'), 'print(2)');
    writeFileSync(path.join(payload, '.DS_Store'), 'junk');
    // Local-only credentials must never be packaged into the deployment archive.
    writeFileSync(path.join(payload, 'external_callout_config.json'), '{"secret":"key"}');

    const result = await createZip('payload');

    expect(result.archivePath).to.equal(ZIP_FILE_NAME);
    expect(result.fileCount).to.equal(2);
    expect(result.archiveSizeBytes).to.be.greaterThan(0);
    expect(existsSync(ZIP_FILE_NAME)).to.equal(true);

    const buf = new Uint8Array(readFileSync(ZIP_FILE_NAME));
    const unzipped = await JSZip.loadAsync(buf);
    const names = Object.keys(unzipped.files).sort();
    expect(names).to.deep.equal(['a.py', 'sub/b.py']);

    const aContent = await unzipped.files['a.py'].async('string');
    expect(aContent).to.equal('print(1)');
  });

  it('writes an empty archive when the directory has no files', async () => {
    const payload = path.join(tempDir, 'empty');
    mkdirSync(payload);

    const result = await createZip('empty');
    expect(result.fileCount).to.equal(0);
    expect(existsSync(ZIP_FILE_NAME)).to.equal(true);
  });

  it('omits implicit folder entries so output matches the Python zipfile format', async () => {
    const payload = path.join(tempDir, 'tree');
    mkdirSync(path.join(payload, 'inner'), { recursive: true });
    writeFileSync(path.join(payload, 'top.py'), 'top');
    writeFileSync(path.join(payload, 'inner', 'nested.py'), 'nested');

    await createZip('tree');
    const buf = new Uint8Array(readFileSync(ZIP_FILE_NAME));
    const unzipped = await JSZip.loadAsync(buf);
    for (const name of Object.keys(unzipped.files)) {
      expect(unzipped.files[name].dir, `entry ${name} should not be a directory`).to.equal(false);
    }
  });
});

describe('zipBuilder.zip orchestration', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = makeTempDir();
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips dependency archive when requirements.txt is empty and produces a deployment.zip', async () => {
    const project = path.join(tempDir, 'proj');
    const payload = path.join(project, 'payload');
    mkdirSync(payload, { recursive: true });
    writeSdkConfig(project, { type: 'script' });
    writeFileSync(path.join(project, 'requirements.txt'), '# only comments\n');
    writeFileSync(path.join(payload, 'entrypoint.py'), 'pass');

    const logs: string[] = [];
    const result = await zip(path.join('proj', 'payload'), 'default', (m) => logs.push(m));

    expect(result.fileCount).to.equal(1);
    expect(result.archivePath).to.equal(ZIP_FILE_NAME);
    expect(logs.some((m) => m.includes('Skipping dependency archive'))).to.equal(true);
  });

  it('throws a clear error when the package directory does not exist', async () => {
    let caught: Error | undefined;
    try {
      await zip(path.join(tempDir, 'missing'), 'default');
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).to.be.instanceOf(Error);
    expect(caught!.message).to.match(/Package directory not found/);
  });
});

describe('zipBuilder.createZip symlinks and permissions', () => {
  let tempDir: string;
  let originalCwd: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), 'zipBuilder-symlink-'));
    originalCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(() => {
    process.chdir(originalCwd);
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('skips a file symlink without packaging its contents', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }
    const payload = path.join(tempDir, 'payload');
    mkdirSync(payload);
    writeFileSync(path.join(payload, 'real.py'), 'real');
    writeFileSync(path.join(tempDir, 'outside.py'), 'outside');
    symlinkSync(path.join(tempDir, 'outside.py'), path.join(payload, 'linked.py'));

    const result = await createZip('payload');
    expect(result.fileCount).to.equal(1);
    const buf = new Uint8Array(readFileSync(ZIP_FILE_NAME));
    const unzipped = await JSZip.loadAsync(buf);
    expect(Object.keys(unzipped.files)).to.deep.equal(['real.py']);
  });

  it('skips a directory symlink without packaging its contents', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }
    const payload = path.join(tempDir, 'payload');
    mkdirSync(payload);
    writeFileSync(path.join(payload, 'real.py'), 'real');
    const shared = path.join(tempDir, 'shared');
    mkdirSync(shared);
    writeFileSync(path.join(shared, 'helper.py'), 'helper');
    symlinkSync(shared, path.join(payload, 'linked_dir'));

    const result = await createZip('payload');
    expect(result.fileCount).to.equal(1);
    const buf = new Uint8Array(readFileSync(ZIP_FILE_NAME));
    const unzipped = await JSZip.loadAsync(buf);
    expect(Object.keys(unzipped.files)).to.deep.equal(['real.py']);
  });

  it('preserves unix executable permissions on archive entries', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }
    const payload = path.join(tempDir, 'payload');
    mkdirSync(payload);
    const scriptPath = path.join(payload, 'run.sh');
    writeFileSync(scriptPath, '#!/bin/bash\necho hi\n');
    chmodSync(scriptPath, 0o755);

    await createZip('payload');
    const buf = new Uint8Array(readFileSync(ZIP_FILE_NAME));
    const unzipped = await JSZip.loadAsync(buf);
    const entry = unzipped.files['run.sh'];
    expect(entry).to.exist;
    expect(entry.unixPermissions).to.equal(0o755);
  });
});

describe('zipBuilder.prepareDependencyArchive', () => {
  let baseDir: string;

  beforeEach(() => {
    baseDir = mkdtempSync(path.join(tmpdir(), 'zipBuilder-prep-'));
    writeFileSync(path.join(baseDir, 'requirements.txt'), 'pandas==2.0.0\n');
    writeFileSync(path.join(baseDir, 'build_native_dependencies.sh'), '#!/bin/bash\necho stub\n');
    writeFileSync(path.join(baseDir, 'Dockerfile.dependencies'), 'FROM python:3.11\n');
  });

  afterEach(() => {
    rmSync(baseDir, { recursive: true, force: true });
  });

  type Calls = {
    imageExists: number;
    build: Array<{ args: string[]; cwd: string }>;
    run: Array<{ args: string[] }>;
  };

  function makeRunner(opts: { imageExists: boolean; onRun?: (mountPath: string) => void }): {
    runner: DockerRunner;
    calls: Calls;
  } {
    const calls: Calls = { imageExists: 0, build: [], run: [] };
    const runner: DockerRunner = {
      async imageExists() {
        calls.imageExists += 1;
        return opts.imageExists;
      },
      async build(args, runOpts) {
        calls.build.push({ args, cwd: runOpts.cwd });
      },
      async run(args) {
        calls.run.push({ args });
        // The dockerRunCmd shape is `['run', '--rm', '-v', '<mount>:/workspace', ...]`. Strip only the
        // container suffix: on Windows the mount itself has a drive colon (`C:/...`).
        const mountArg = args[args.indexOf('-v') + 1];
        const mountPath = mountArg.slice(0, mountArg.lastIndexOf(':'));
        opts.onRun?.(mountPath);
      },
    };
    return { runner, calls };
  }

  it('copies the script tarball into <baseDir>/payload/archives for script packages', async () => {
    const { runner, calls } = makeRunner({
      imageExists: true,
      onRun: (mountPath) => {
        // Simulate the docker container producing the archive in the mount.
        writeFileSync(path.join(mountPath, 'native_dependencies.tar.gz'), 'tar-bytes');
      },
    });

    await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, runner);

    const archivePath = path.join(baseDir, 'payload', 'archives', 'native_dependencies.tar.gz');
    expect(existsSync(archivePath)).to.equal(true);
    expect(readFileSync(archivePath, 'utf-8')).to.equal('tar-bytes');
    // imageExists=true, so we should NOT have built.
    expect(calls.build).to.have.length(0);
    expect(calls.run).to.have.length(1);
  });

  it('copies py-files into <baseDir>/payload/py-files for function packages', async () => {
    const { runner } = makeRunner({
      imageExists: true,
      onRun: (mountPath) => {
        const pyFilesSrc = path.join(mountPath, 'py-files');
        mkdirSync(pyFilesSrc);
        writeFileSync(path.join(pyFilesSrc, 'a.py'), 'a-content');
        mkdirSync(path.join(pyFilesSrc, 'sub'));
        writeFileSync(path.join(pyFilesSrc, 'sub', 'b.py'), 'b-content');
      },
    });

    await prepareDependencyArchive(baseDir, 'default', 'function', () => {}, runner);

    const dest = path.join(baseDir, 'payload', 'py-files');
    expect(existsSync(path.join(dest, 'a.py'))).to.equal(true);
    expect(readFileSync(path.join(dest, 'a.py'), 'utf-8')).to.equal('a-content');
    expect(readFileSync(path.join(dest, 'sub', 'b.py'), 'utf-8')).to.equal('b-content');
  });

  it('builds the docker image when it is missing, scoped to baseDirectory', async () => {
    const { runner, calls } = makeRunner({
      imageExists: false,
      onRun: (mountPath) => {
        writeFileSync(path.join(mountPath, 'native_dependencies.tar.gz'), 'data');
      },
    });

    await prepareDependencyArchive(baseDir, 'host', 'script', () => {}, runner);

    expect(calls.build).to.have.length(1);
    expect(calls.build[0].cwd).to.equal(baseDir);
    expect(calls.build[0].args).to.include('--network');
    expect(calls.build[0].args).to.include('host');
  });

  it('skips the py-files copy when the docker run produces nothing', async () => {
    const logs: string[] = [];
    const { runner } = makeRunner({ imageExists: true });

    await prepareDependencyArchive(baseDir, 'default', 'function', (m) => logs.push(m), runner);

    expect(existsSync(path.join(baseDir, 'payload', 'py-files'))).to.equal(false);
    expect(logs.some((m) => m.includes('Skipping py-files copy'))).to.equal(true);
  });

  it('throws an actionable error (not ENOENT) when requirements.txt is missing', async () => {
    rmSync(path.join(baseDir, 'requirements.txt'));
    const { runner, calls } = makeRunner({ imageExists: true });

    let caught: Error | undefined;
    try {
      await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, runner);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught, 'expected prepareDependencyArchive to throw').to.exist;
    expect(caught!.name).to.equal('DependencyBuildFileMissing');
    expect(caught!.message).to.match(/requirements\.txt/);
    // Should fail before doing any docker work.
    expect(calls.run).to.have.length(0);
    expect(calls.build).to.have.length(0);
  });

  it('throws an actionable error when build_native_dependencies.sh is missing', async () => {
    rmSync(path.join(baseDir, 'build_native_dependencies.sh'));
    const { runner } = makeRunner({ imageExists: true });

    let caught: Error | undefined;
    try {
      await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, runner);
    } catch (err) {
      caught = err as Error;
    }

    expect(caught!.name).to.equal('DependencyBuildFileMissing');
    expect(caught!.message).to.match(/build_native_dependencies\.sh/);
  });

  it('requires Dockerfile.dependencies only when the image must be built', async () => {
    rmSync(path.join(baseDir, 'Dockerfile.dependencies'));

    // imageExists=true: the missing Dockerfile should NOT block the run.
    const present = makeRunner({
      imageExists: true,
      onRun: (mountPath) => writeFileSync(path.join(mountPath, 'native_dependencies.tar.gz'), 'data'),
    });
    await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, present.runner);
    expect(existsSync(path.join(baseDir, 'payload', 'archives', 'native_dependencies.tar.gz'))).to.equal(true);

    // imageExists=false: now the missing Dockerfile must raise the actionable error.
    const missing = makeRunner({ imageExists: false });
    let caught: Error | undefined;
    try {
      await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, missing.runner);
    } catch (err) {
      caught = err as Error;
    }
    expect(caught!.name).to.equal('DependencyBuildFileMissing');
    expect(caught!.message).to.match(/Dockerfile\.dependencies/);
    expect(missing.calls.build).to.have.length(0);
  });

  it('stages build_native_dependencies.sh with executable permission preserved', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }
    chmodSync(path.join(baseDir, 'build_native_dependencies.sh'), 0o755);

    const { runner } = makeRunner({
      imageExists: true,
      onRun: (mountPath) => {
        const stagedScript = path.join(mountPath, 'build_native_dependencies.sh');
        const mode = statSync(stagedScript).mode & 0o777;
        expect(mode & 0o111, 'staged build script must have executable bits').to.not.equal(0);
        writeFileSync(path.join(mountPath, 'native_dependencies.tar.gz'), 'data');
      },
    });

    await prepareDependencyArchive(baseDir, 'default', 'script', () => {}, runner);
  });

  it('preserves executable permissions on py-files copied via copyTree (function packages)', async function () {
    if (process.platform === 'win32') {
      this.skip();
      return;
    }

    const { runner } = makeRunner({
      imageExists: true,
      onRun: (mountPath) => {
        const pyFilesSrc = path.join(mountPath, 'py-files');
        mkdirSync(pyFilesSrc);
        const execScript = path.join(pyFilesSrc, 'run_me.sh');
        writeFileSync(execScript, '#!/bin/bash\necho hello\n');
        chmodSync(execScript, 0o755);
        writeFileSync(path.join(pyFilesSrc, 'lib.py'), 'pass');
      },
    });

    await prepareDependencyArchive(baseDir, 'default', 'function', () => {}, runner);

    const dest = path.join(baseDir, 'payload', 'py-files');
    const scriptMode = statSync(path.join(dest, 'run_me.sh')).mode & 0o777;
    const libMode = statSync(path.join(dest, 'lib.py')).mode & 0o777;
    expect(scriptMode & 0o111, 'executable script in py-files must retain execute bits').to.not.equal(0);
    expect(libMode & 0o111, 'non-executable file should not gain execute bits').to.equal(0);
  });
});
