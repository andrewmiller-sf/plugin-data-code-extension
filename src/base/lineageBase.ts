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
import { promises as fs, type Stats } from 'node:fs';
import path from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Org, SfError } from '@salesforce/core';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { splitDependencies } from '../utils/pythonRunner.js';
import { LineageRunner, type LineageReport } from '../utils/lineageRunner.js';
import { findBaseDirectory, getPackageType, getSdkConfigPath, readConfigJson } from '../utils/nativeScan.js';
import {
  countPairs,
  diffLineage,
  findPermissionGaps,
  hasInvalidLineage,
  hasLineageSection,
  isEmptyDiff,
  LINEAGE_CONFIRM_TIMEOUT_MS,
  readLineage,
  replaceLineage,
  writeConfigJson,
  type LineageDiff,
  type LineagePermissionGaps,
} from '../utils/lineageConfig.js';
import { type SharedResultProps } from './types.js';

export type BaseLineageFlags = {
  entrypoint: string;
  'target-org': Org;
  'config-file'?: string;
  dependencies?: string;
  'dry-run': boolean;
  'output-file'?: string;
  'no-prompt': boolean;
  'accept-lineage-ownership': boolean;
};

export type LineageGenerateResult = SharedResultProps & {
  targetOrg: string;
  configPath: string;
  dryRun: boolean;
  /** True when config.json was updated. */
  written: boolean;
  entryCount: number;
  pairCount: number;
  diff: LineageDiff;
  permissionGaps: LineagePermissionGaps;
  outputFile?: string;
  lineage: LineageReport;
};

const CONFIG_FILE = 'config.json';
/** Project config the SDK loads implicitly from the directory above `payload/`. */
const PROJECT_CONFIG_YAML = 'config.yaml';
/** Base-directory files `deploy` packages alongside payload/ (see zipBuilder). */
const PACKAGED_BUILD_FILES = ['requirements.txt', 'build_native_dependencies.sh', 'Dockerfile.dependencies'];

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class LineageBase extends SfCommand<LineageGenerateResult> {
  public static enableJsonFlag = true;

  public async run(): Promise<LineageGenerateResult> {
    const { flags } = (await this.parse(this.constructor as typeof LineageBase)) as unknown as {
      flags: BaseLineageFlags;
    };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const entrypoint = path.resolve(flags.entrypoint);
    const configPath = path.join(path.dirname(entrypoint), CONFIG_FILE);

    try {
      if ((await getPackageType(findBaseDirectory(entrypoint))) === 'function') {
        throw new SfError(messages.getMessage('error.functionPackage', [flags.entrypoint]), 'LineageFunctionPackage');
      }
      // Read config.json up front so a missing or malformed file fails before the run.
      await readConfigJson(configPath);

      const outputFile = flags['output-file'] ? path.resolve(flags['output-file']) : undefined;
      if (outputFile) {
        // Everything under payload/ is run and deployed; .datacustomcode_proj/ holds package metadata.
        const payloadDir = path.dirname(entrypoint);
        // Root-level requirements.txt and the native dependency build files are packaged too.
        const baseDir = findBaseDirectory(entrypoint);
        const sdkConfigPath = getSdkConfigPath(baseDir);
        const inputDirs = [payloadDir, path.dirname(sdkConfigPath)];
        const inputFiles = [
          configPath,
          entrypoint,
          sdkConfigPath,
          path.join(path.dirname(payloadDir), PROJECT_CONFIG_YAML),
          ...PACKAGED_BUILD_FILES.map((name) => path.join(baseDir, name)),
          ...(flags['config-file'] ? [path.resolve(flags['config-file'])] : []),
        ];
        if (await isPackageInput(outputFile, inputDirs, inputFiles)) {
          throw new SfError(
            messages.getMessage('error.outputFileCollision', [outputFile]),
            'LineageOutputFileCollision'
          );
        }
      }

      const { pythonInfo, packageInfo } = await checkEnvironment(this.spinner, this.log.bind(this), messages);

      const targetOrg = flags['target-org'];
      const orgUsername = targetOrg.getUsername() ?? 'target org';
      this.spinner.start(messages.getMessage('info.authenticating', [orgUsername]));
      await targetOrg.getConnection().refreshAuth();
      this.spinner.stop();
      this.log(messages.getMessage('info.authenticated', [orgUsername]));

      // Stream the entrypoint's output live; keep stdout clean for --json.
      this.log(messages.getMessage('info.generating'));
      const scriptOut = this.jsonEnabled() ? process.stderr : process.stdout;
      const lineage = await LineageRunner.generate({
        pythonCommand: pythonInfo.command,
        entrypoint,
        configFile: flags['config-file'],
        dependencies: splitDependencies(flags.dependencies),
        sfCliOrg: orgUsername,
        onStdout: (chunk) => scriptOut.write(chunk),
        onStderr: (chunk) => process.stderr.write(chunk),
      });

      if (outputFile) {
        await fs.writeFile(outputFile, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
        this.log(messages.getMessage('info.outputWritten', [outputFile]));
      }

      // Re-read so edits made during the run aren't overwritten.
      const config = await readConfigJson(configPath);
      const shownLineage = JSON.stringify(config.dataLineage);
      const entries = lineage.dataLineage;
      const current = readLineage(config);
      const diff = diffLineage(current, entries);
      const permissionGaps = findPermissionGaps(config, lineage.targets, lineage.sources);
      this.report(messages, lineage, diff, permissionGaps);

      const result: LineageGenerateResult = {
        success: true,
        pythonVersion: pythonInfo,
        packageInfo,
        codeType,
        packageDir: path.dirname(entrypoint),
        targetOrg: orgUsername,
        configPath,
        dryRun: flags['dry-run'],
        written: false,
        entryCount: entries.length,
        pairCount: countPairs(entries),
        diff,
        permissionGaps,
        outputFile,
        lineage,
        message: messages.getMessage('info.complete'),
      };

      if (entries.length === 0) {
        this.warn(messages.getMessage('warning.emptyResult'));
        return result;
      }

      if (flags['dry-run']) {
        this.log(JSON.stringify({ dataLineage: entries }, null, 2));
        this.log(messages.getMessage('info.dryRunNotice'));
        return result;
      }

      if (isEmptyDiff(diff) && !hasInvalidLineage(config)) {
        this.log(messages.getMessage('info.unchanged', [configPath]));
        return result;
      }

      if (!(await this.confirmWrite(messages, flags, hasLineageSection(config)))) {
        this.log(messages.getMessage('info.notWritten'));
        return result;
      }

      // Re-read again: the prompt can wait up to LINEAGE_CONFIRM_TIMEOUT_MS. Lineage edited meanwhile wasn't in the
      // diff the customer confirmed, so don't replace it.
      const latest = await readConfigJson(configPath);
      if (JSON.stringify(latest.dataLineage) !== shownLineage) {
        throw new SfError(
          messages.getMessage('error.lineageChanged', [configPath]),
          'LineageChangedDuringConfirm',
          messages.getMessages('actions.lineageChanged')
        );
      }
      await writeConfigJson(configPath, replaceLineage(latest, entries));
      this.log(messages.getMessage('info.written', [configPath]));
      return { ...result, written: true };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  private report(
    messages: Messages<string>,
    lineage: LineageReport,
    diff: LineageDiff,
    gaps: LineagePermissionGaps
  ): void {
    this.log(
      messages.getMessage('info.summary', [
        lineage.dataLineage.length,
        countPairs(lineage.dataLineage),
        diff.added.length,
        diff.removed.length,
        diff.changed.length,
      ])
    );
    if (lineage.noSources.length > 0) {
      this.log(messages.getMessage('info.noSources', [lineage.noSources.length, bullets(lineage.noSources)]));
    }
    if (lineage.unresolved.length > 0) {
      const lines = lineage.unresolved.map((field) => `${field.targetField} (${field.reason})`);
      this.warn(messages.getMessage('warning.unresolved', [lineage.unresolved.length, bullets(lines)]));
    }
    if (lineage.udfFields.length > 0) {
      this.warn(messages.getMessage('warning.udf', [lineage.udfFields.length, bullets(lineage.udfFields)]));
    }
    const missing = [...gaps.targets.map((name) => `write: ${name}`), ...gaps.sources.map((name) => `read: ${name}`)];
    if (missing.length > 0) {
      this.warn(messages.getMessage('warning.permissionGaps', [bullets(missing)]));
    }
  }

  // Every write needs the customer to accept ownership of the generated lineage: it is best-effort
  // and drives governance tag propagation. Replacing an existing section also risks losing hand
  // edits. Interactively that's one prompt for whatever the flags haven't already accepted.
  private async confirmWrite(
    messages: Messages<string>,
    flags: BaseLineageFlags,
    replacing: boolean
  ): Promise<boolean> {
    this.warn(messages.getMessage('warning.ownership'));
    if (replacing) this.warn(messages.getMessage('warning.replace'));
    const needsOwnership = !flags['accept-lineage-ownership'];
    const needsReplace = replacing && !flags['no-prompt'];
    if (!needsOwnership && !needsReplace) return true;
    if (this.jsonEnabled() || !process.stdin.isTTY) {
      if (needsOwnership) {
        throw new SfError(
          messages.getMessage('error.ownershipNotAccepted'),
          'LineageOwnershipNotAccepted',
          messages.getMessages('actions.ownershipNotAccepted')
        );
      }
      throw new SfError(
        messages.getMessage('error.replaceNotConfirmed'),
        'LineageReplaceNotConfirmed',
        messages.getMessages('actions.replaceNotConfirmed')
      );
    }
    const prompt = needsOwnership
      ? replacing
        ? 'prompt.acceptOwnershipReplace'
        : 'prompt.acceptOwnership'
      : 'prompt.replace';
    return this.confirm({ message: messages.getMessage(prompt), defaultAnswer: false, ms: LINEAGE_CONFIRM_TIMEOUT_MS });
  }

  protected abstract getCodeType(): 'script';
  protected abstract getMessages(): Messages<string>;
}

/**
 * True when `file` lies under one of `dirs` (as given or after resolving symlinks), or is one of
 * `files` by path or by file identity, which also catches symlinks and hard links.
 */
async function isPackageInput(file: string, dirs: string[], files: string[]): Promise<boolean> {
  const [target, realDirs, targetStat, fileStats] = await Promise.all([
    realPath(file),
    Promise.all(dirs.map(realPath)),
    statOrUndefined(file),
    Promise.all(files.map(statOrUndefined)),
  ]);
  const within = (child: string, dir: string): boolean => {
    const relative = path.relative(dir, child);
    return !path.isAbsolute(relative) && relative.split(path.sep)[0] !== '..';
  };
  return (
    dirs.some((dir) => within(file, dir)) ||
    realDirs.some((dir) => within(target, dir)) ||
    (targetStat !== undefined &&
      fileStats.some((stat) => stat !== undefined && stat.dev === targetStat.dev && stat.ino === targetStat.ino))
  );
}

async function statOrUndefined(file: string): Promise<Stats | undefined> {
  return fs.stat(file).catch(() => undefined);
}

/**
 * Canonical path of `file`, resolving symlinks (and case, on case-insensitive file systems).
 * A file that doesn't exist yet resolves through its parent directory.
 */
async function realPath(file: string): Promise<string> {
  try {
    return await fs.realpath(file);
  } catch {
    try {
      return path.join(await fs.realpath(path.dirname(file)), path.basename(file));
    } catch {
      return path.resolve(file);
    }
  }
}

function bullets(lines: string[]): string {
  return lines.map((line) => `  - ${line}`).join('\n');
}
