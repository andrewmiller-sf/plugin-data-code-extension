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
import { existsSync, mkdtempSync, rmSync, statSync, readFileSync } from 'node:fs';
import { copyFile, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { debuglog } from 'node:util';
import JSZip from 'jszip';
import { Messages, SfError } from '@salesforce/core';
import { findBaseDirectory, getPackageType, type CodeType } from './nativeScan.js';
import { spawnAsync, type SpawnError } from './spawnHelper.js';

const debug = debuglog('datacustomcode');

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'datacodeBinaryExecutor');

export const ZIP_FILE_NAME = 'deployment.zip';
export const EXTERNAL_CALLOUT_CREDENTIAL = 'external_callout_config.json';
const EXCLUDED_FILENAMES = new Set(['.DS_Store', EXTERNAL_CALLOUT_CREDENTIAL]);
export const DEPENDENCIES_ARCHIVE_NAME = 'native_dependencies';
export const DEPENDENCIES_ARCHIVE_FULL_NAME = `${DEPENDENCIES_ARCHIVE_NAME}.tar.gz`;
export const DEPENDENCIES_ARCHIVE_PATH = path.join('payload', 'archives', DEPENDENCIES_ARCHIVE_FULL_NAME);
export const PY_FILES_PATH = path.join('payload', 'py-files');
export const DOCKER_IMAGE_NAME = 'datacloud-custom-code-dependency-builder';
const PLATFORM_ENV = { DOCKER_DEFAULT_PLATFORM: 'linux/amd64' } as const;

export type ZipResult = {
  archivePath: string;
  fileCount: number;
  archiveSizeBytes: number;
};

/**
 * Returns true when `<baseDirectory>/requirements.txt` exists and has at least
 * one non-comment, non-blank line.
 *
 * Mirrors `has_nonempty_requirements_file` in `datacustomcode/deploy.py`. The
 * Python equivalent passes `dirname(payload_dir)` and looks for
 * `requirements.txt` next to the SDK config — this signature accepts the same
 * resolved base directory so callers stay consistent.
 */
export function hasNonemptyRequirementsFile(baseDirectory: string): boolean {
  const requirementsPath = path.join(baseDirectory, 'requirements.txt');
  try {
    if (!existsSync(requirementsPath) || !statSync(requirementsPath).isFile()) {
      return false;
    }
    const contents = readFileSync(requirementsPath, 'utf-8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        return true;
      }
    }
  } catch (err) {
    debug('error reading requirements.txt at %s: %o', requirementsPath, err);
  }
  return false;
}

export function dockerBuildCmd(network: string): string[] {
  // `docker build [OPTIONS] PATH` — every option (including --network) must come
  // before the build-context path ('.'), otherwise Docker rejects the trailing
  // flag. The Python original appended it after the path; we correct that here.
  const args = ['build', '-t', DOCKER_IMAGE_NAME, '--file', 'Dockerfile.dependencies'];
  if (network !== 'default') {
    args.push('--network', network);
  }
  args.push('.');
  return args;
}

export function dockerRunCmd(network: string, tempDir: string): string[] {
  // `docker run [OPTIONS] IMAGE [COMMAND]` — options must precede the image name.
  // Placing --network after the image would make Docker treat it as the
  // in-container command/args, so we insert it before DOCKER_IMAGE_NAME.
  // Docker expects forward slashes in the volume mount path, even on Windows.
  const mountPath = tempDir.replace(/\\/g, '/');
  const args = ['run', '--rm', '-v', `${mountPath}:/workspace`];
  if (network !== 'default') {
    args.push('--network', network);
  }
  args.push(DOCKER_IMAGE_NAME);
  return args;
}

/**
 * Thin seam over the three docker CLI invocations the dependency builder needs.
 * Real callers use `defaultDockerRunner`. Tests can pass a fake to assert the
 * file-handling logic without requiring a working docker daemon.
 */
export type DockerRunner = {
  imageExists: () => Promise<boolean>;
  build: (args: string[], opts: { env: NodeJS.ProcessEnv; cwd: string }) => Promise<void>;
  run: (args: string[], opts: { env: NodeJS.ProcessEnv }) => Promise<void>;
};

export const defaultDockerRunner: DockerRunner = {
  async imageExists(): Promise<boolean> {
    try {
      const { stdout } = await spawnAsync('docker', ['images', '-q', DOCKER_IMAGE_NAME]);
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  },
  async build(args, opts): Promise<void> {
    debug('docker build: %o', args);
    await spawnAsync('docker', args, opts);
  },
  async run(args, opts): Promise<void> {
    debug('docker run: %o', args);
    await spawnAsync('docker', args, opts);
  },
};

/**
 * Throws an actionable SfError when a file the dependency builder relies on is
 * missing, instead of letting a downstream copyFile/spawn surface a raw ENOENT.
 */
function assertBuildFileExists(label: string, filePath: string): void {
  if (!existsSync(filePath)) {
    throw new SfError(
      `Cannot build the dependency archive: required file '${label}' was not found at '${filePath}'.`,
      'DependencyBuildFileMissing',
      [
        "Run 'init' to scaffold the package, which generates requirements.txt and build_native_dependencies.sh",
        'Confirm requirements.txt, build_native_dependencies.sh, and Dockerfile.dependencies exist in the package base directory',
        'If you removed these files, restore them from the template before zipping a package with dependencies',
      ]
    );
  }
}

async function copyTree(src: string, dest: string): Promise<void> {
  const entries = await readdir(src, { withFileTypes: true });
  await mkdir(dest, { recursive: true });
  await Promise.all(
    entries.map((entry) => {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);
      if (entry.isDirectory()) {
        return copyTree(srcPath, destPath);
      }
      if (entry.isFile()) {
        return copyFile(srcPath, destPath);
      }
      return Promise.resolve();
    })
  );
}

/**
 * Runs the Docker-based dependency builder. For scripts, copies the resulting
 * `native_dependencies.tar.gz` into `<baseDirectory>/payload/archives/`. For
 * functions, copies the generated `py-files/` tree into
 * `<baseDirectory>/payload/py-files/`.
 *
 * Mirrors `prepare_dependency_archive` in `datacustomcode/deploy.py`. Resolves
 * `requirements.txt`, `build_native_dependencies.sh`, and the destination
 * directories under `baseDirectory` so the function works regardless of the
 * caller's current working directory.
 */
export async function prepareDependencyArchive(
  baseDirectory: string,
  dockerNetwork: string,
  packageType: CodeType,
  log: (message: string) => void = (): void => {},
  runner: DockerRunner = defaultDockerRunner
): Promise<void> {
  const dockerEnv = { ...process.env, ...PLATFORM_ENV };

  const requirementsSrc = path.join(baseDirectory, 'requirements.txt');
  const buildScriptSrc = path.join(baseDirectory, 'build_native_dependencies.sh');
  const dockerfileSrc = path.join(baseDirectory, 'Dockerfile.dependencies');
  const archiveDest = path.join(baseDirectory, DEPENDENCIES_ARCHIVE_PATH);
  const pyFilesDest = path.join(baseDirectory, PY_FILES_PATH);

  // Fail fast with an actionable error rather than a raw ENOENT from a later
  // copyFile/spawn if the scaffolding files the builder depends on are missing.
  assertBuildFileExists('requirements.txt', requirementsSrc);
  assertBuildFileExists('build_native_dependencies.sh', buildScriptSrc);

  const imageExists = await runner.imageExists();
  if (!imageExists) {
    // The image build references Dockerfile.dependencies by relative path, so it
    // is only required when we actually have to build the image.
    assertBuildFileExists('Dockerfile.dependencies', dockerfileSrc);
    log(`Building docker image with docker network: ${dockerNetwork}...`);
    // The build must run from the base directory where Dockerfile.dependencies lives.
    await runner.build(dockerBuildCmd(dockerNetwork), { env: dockerEnv, cwd: baseDirectory });
  }

  const tempDir = mkdtempSync(path.join(tmpdir(), 'datacustomcode-deps-'));
  try {
    log(`Building dependencies archive with docker network: ${dockerNetwork}`);
    await copyFile(requirementsSrc, path.join(tempDir, 'requirements.txt'));
    await copyFile(buildScriptSrc, path.join(tempDir, 'build_native_dependencies.sh'));

    await runner.run(dockerRunCmd(dockerNetwork, tempDir), { env: dockerEnv });

    if (packageType === 'function') {
      const sourcePyFiles = path.join(tempDir, 'py-files');
      if (existsSync(sourcePyFiles)) {
        log(`py-files directory found at ${sourcePyFiles}. Copying to payload directory...`);
        await mkdir(path.dirname(pyFilesDest), { recursive: true });
        if (existsSync(pyFilesDest)) {
          rmSync(pyFilesDest, { recursive: true, force: true });
        }
        await copyTree(sourcePyFiles, pyFilesDest);
        log(`py-files copied to ${pyFilesDest}`);
      } else {
        log(`No py-files directory found at ${sourcePyFiles}. Skipping py-files copy.`);
      }
    } else {
      const archivesTempPath = path.join(tempDir, DEPENDENCIES_ARCHIVE_FULL_NAME);
      await mkdir(path.dirname(archiveDest), { recursive: true });
      await copyFile(archivesTempPath, archiveDest);
      log(`Dependencies archived to ${archiveDest}`);
    }
  } finally {
    // ignore_cleanup_errors equivalent: Docker may leave files the host can't
    // delete (e.g., on Windows). Files we needed are already copied out.
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch (err) {
      debug('temp dir cleanup error (ignored): %o', err);
    }
  }
}

async function collectFiles(directory: string, log: (message: string) => void): Promise<string[]> {
  // - Symlinks (file, directory or dangling) are logged and skipped, never followed.
  // - Files in EXCLUDED_FILENAMES (.DS_Store, external_callout_config.json) are skipped.
  // - Real subdirectories are recursed.
  async function walk(current: string): Promise<string[]> {
    const entries = await readdir(current, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const full = path.join(current, entry.name);
        if (entry.isSymbolicLink()) {
          log(`Skipping symlink file ${path.relative(directory, full)}`);
          return [];
        }
        if (EXCLUDED_FILENAMES.has(entry.name)) {
          return [];
        }
        if (entry.isDirectory()) {
          return walk(full);
        }
        if (entry.isFile()) {
          return [full];
        }
        return [];
      })
    );
    return nested.flat();
  }
  return walk(directory);
}

/**
 * Creates `deployment.zip` (DEFLATE-compressed) at the current working
 * directory containing every file under `directory` except symlinks and
 * those in EXCLUDED_FILENAMES (`.DS_Store` and the local `external_callout_config.json`).
 * Archive entry names are relative to `directory`, matching the Python
 * `os.path.relpath(abs_path, directory)` behavior.
 */
export async function createZip(
  directory: string,
  log: (message: string) => void = (): void => {}
): Promise<ZipResult> {
  const archive = new JSZip();
  const files = await collectFiles(directory, log);

  const entries = await Promise.all(
    files.map(async (absPath) => {
      const arcname = path.relative(directory, absPath);
      // Use forward slashes inside the zip so the archive is portable across
      // platforms (Python's zipfile follows the same convention).
      const portableName = arcname.split(path.sep).join('/');
      const [data, entryStat] = await Promise.all([readFile(absPath), stat(absPath)]);
      return {
        portableName,
        data: new Uint8Array(data),
        mtime: entryStat.mtime,
        unixPermissions: entryStat.mode & 0o777,
      };
    })
  );
  for (const entry of entries) {
    archive.file(entry.portableName, entry.data, {
      date: entry.mtime,
      createFolders: false,
      unixPermissions: entry.unixPermissions,
    });
  }

  // Drop the implicit folder entries JSZip materializes for any path with a "/"
  // — the Python zipfile reference adds files only, never directory entries, so
  // we strip them here to keep the archives byte-comparable in test diffs.
  for (const name of Object.keys(archive.files)) {
    if (archive.files[name].dir) {
      archive.remove(name);
    }
  }

  const buffer = await archive.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
    platform: process.platform === 'win32' ? 'DOS' : 'UNIX',
  });

  await writeFile(ZIP_FILE_NAME, buffer);
  return {
    archivePath: ZIP_FILE_NAME,
    fileCount: files.length,
    archiveSizeBytes: buffer.byteLength,
  };
}

/**
 * High-level zip command: optionally builds the dependency archive, then
 * creates `deployment.zip`. Mirrors the Python CLI `zip` command in
 * `datacustomcode/cli.py`.
 */
export async function zip(
  directory: string,
  dockerNetwork: string,
  log: (message: string) => void = (): void => {}
): Promise<ZipResult> {
  if (!existsSync(directory)) {
    throw new SfError(
      messages.getMessage('error.zipExecutionFailed', [directory, `Package directory not found at '${directory}'`]),
      'PackageDirNotFound'
    );
  }

  const baseDirectory = findBaseDirectory(directory);
  const packageType = await getPackageType(baseDirectory);

  if (hasNonemptyRequirementsFile(baseDirectory)) {
    await prepareDependencyArchive(baseDirectory, dockerNetwork, packageType, log);
  } else {
    log(`Skipping dependency archive: requirements.txt is missing or empty in ${baseDirectory}`);
  }

  debug('zipping directory %s', directory);
  const result = await createZip(directory, log);
  debug('created zip at %s (%d files, %d bytes)', result.archivePath, result.fileCount, result.archiveSizeBytes);
  return result;
}

/**
 * Convenience wrapper that surfaces docker / zip failures as SfError so the
 * Salesforce CLI framework renders them with consistent action hints.
 */
export async function zipWithSfError(
  directory: string,
  dockerNetwork: string,
  log?: (message: string) => void
): Promise<ZipResult> {
  try {
    return await zip(directory, dockerNetwork, log);
  } catch (error) {
    if (error instanceof SfError) {
      throw error;
    }
    const spawnError = error as SpawnError;
    const detail = spawnError.stderr?.trim() ?? (error instanceof Error ? error.message : String(error));
    throw new SfError(
      messages.getMessage('error.zipExecutionFailed', [directory, detail]),
      'ZipExecutionFailed',
      messages.getMessages('actions.zipExecutionFailed')
    );
  }
}
