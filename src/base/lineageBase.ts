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
import path from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, Org, SfError } from '@salesforce/core';
import { checkEnvironment } from '../utils/environmentChecker.js';
import { splitDependencies } from '../utils/pythonRunner.js';
import { LineageRunner, type LineageReport } from '../utils/lineageRunner.js';
import { findBaseDirectory, getPackageType, readConfigJson } from '../utils/nativeScan.js';
import {
  countPairs,
  diffLineage,
  findPermissionGaps,
  isEmptyDiff,
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
      const config = await readConfigJson(configPath);

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

      const outputFile = flags['output-file'] ? path.resolve(flags['output-file']) : undefined;
      if (outputFile) {
        await fs.writeFile(outputFile, `${JSON.stringify(lineage, null, 2)}\n`, 'utf8');
        this.log(messages.getMessage('info.outputWritten', [outputFile]));
      }

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

      if (isEmptyDiff(diff)) {
        this.log(messages.getMessage('info.unchanged', [configPath]));
        return result;
      }

      if (current.length > 0 && !(await this.confirmReplace(messages, flags['no-prompt']))) {
        this.log(messages.getMessage('info.notReplaced'));
        return result;
      }

      await writeConfigJson(configPath, replaceLineage(config, entries));
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
    const missing = [...gaps.targets.map((name) => `write: ${name}`), ...gaps.sources.map((name) => `read: ${name}`)];
    if (missing.length > 0) {
      this.warn(messages.getMessage('warning.permissionGaps', [bullets(missing)]));
    }
  }

  private async confirmReplace(messages: Messages<string>, noPrompt: boolean): Promise<boolean> {
    this.warn(messages.getMessage('warning.replace'));
    if (noPrompt) return true;
    if (this.jsonEnabled() || !process.stdin.isTTY) {
      throw new SfError(
        messages.getMessage('error.replaceNotConfirmed'),
        'LineageReplaceNotConfirmed',
        messages.getMessages('actions.replaceNotConfirmed')
      );
    }
    return this.confirm({ message: messages.getMessage('prompt.replace'), defaultAnswer: false });
  }

  protected abstract getCodeType(): 'script';
  protected abstract getMessages(): Messages<string>;
}

function bullets(lines: string[]): string {
  return lines.map((line) => `  - ${line}`).join('\n');
}
