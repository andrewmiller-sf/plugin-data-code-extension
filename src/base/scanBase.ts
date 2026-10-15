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
import path from 'node:path';
import { SfCommand } from '@salesforce/sf-plugins-core';
import { Messages, SfError } from '@salesforce/core';
import { executeNativeScan, type NativeScanResult } from '../utils/nativeScan.js';
import { checkEnvironment, type EnvironmentCheckResult } from '../utils/environmentChecker.js';
import {
  countEntriesReferencing,
  findStaleLineage,
  LINEAGE_CONFIRM_TIMEOUT_MS,
  type LineagePermissionGaps,
} from '../utils/lineageConfig.js';

export type BaseScanFlags = {
  entrypoint?: string;
  'config-file'?: string;
  'dry-run': boolean;
  'no-requirements': boolean;
  'no-prompt'?: boolean;
};

export type ScanResult = {
  success: boolean;
  codeType: 'script' | 'function';
  workingDirectory: string;
  message: string;
  executionResult: NativeScanResult;
} & EnvironmentCheckResult;

// eslint-disable-next-line sf-plugin/command-summary, sf-plugin/command-example
export abstract class ScanBase extends SfCommand<ScanResult> {
  public static enableJsonFlag = false;

  public async run(): Promise<ScanResult> {
    const { flags } = (await this.parse(this.constructor as typeof ScanBase)) as unknown as { flags: BaseScanFlags };
    const codeType = this.getCodeType();
    const messages = this.getMessages();

    const workingDir = process.cwd();

    try {
      const { pythonInfo, packageInfo } = await checkEnvironment(this.spinner, this.log.bind(this), messages);

      this.spinner.start(messages.getMessage('info.executingScan'));
      const executionResult = await executeNativeScan({
        workingDir,
        entrypoint: flags.entrypoint,
        configFile: flags['config-file'],
        dryRun: flags['dry-run'],
        noRequirements: flags['no-requirements'],
        packageType: codeType,
        // Functions carry no permissions or dataLineage, so only scripts can go stale.
        confirmWrite:
          codeType === 'script'
            ? (updatedConfig): Promise<boolean> =>
                this.confirmStaleLineage(messages, updatedConfig, flags['no-prompt'] ?? false)
            : undefined,
      });
      this.spinner.stop();

      if (codeType === 'script' && executionResult.dryRun) {
        const stale = findStaleLineage(executionResult.config);
        if (hasStaleLineage(stale)) this.warnStaleLineage(messages, executionResult.config, stale);
      }

      if (executionResult.written === false) {
        this.log(messages.getMessage('info.staleLineageNotWritten'));
        return {
          success: false,
          pythonInfo,
          packageInfo,
          codeType,
          workingDirectory: workingDir,
          executionResult,
          message: messages.getMessage('info.staleLineageNotWritten'),
        };
      }

      this.log(messages.getMessage('info.scanExecuted', [workingDir]));

      // Echo the resulting config — mirrors the Python CLI's behavior of printing the
      // scan output to stdout for the user to review.
      this.log(JSON.stringify(executionResult.config, null, 2));

      for (const file of executionResult.filesScanned) {
        this.log(messages.getMessage('info.fileScanned', [file]));
      }

      if (!executionResult.dryRun && executionResult.requirementsPath) {
        this.log(`Generated requirements file: ${path.relative(workingDir, executionResult.requirementsPath)}`);
      }

      if (executionResult.dryRun) {
        this.log(messages.getMessage('info.dryRunNotice'));
      }

      return {
        success: true,
        pythonInfo,
        packageInfo,
        codeType,
        workingDirectory: workingDir,
        executionResult,
        message: messages.getMessage('info.scanCompleted'),
      };
    } catch (error) {
      this.spinner.stop();
      throw error;
    }
  }

  /**
   * Called just before scan writes config.json. When the rebuilt permissions no longer
   * cover objects that dataLineage references, warn and ask before writing; scan never
   * edits dataLineage itself.
   */
  private async confirmStaleLineage(
    messages: Messages<string>,
    updatedConfig: Record<string, unknown>,
    noPrompt: boolean
  ): Promise<boolean> {
    const stale = findStaleLineage(updatedConfig);
    if (!hasStaleLineage(stale)) return true;

    this.spinner.stop();
    this.warnStaleLineage(messages, updatedConfig, stale);
    if (noPrompt) return true;
    if (this.jsonEnabled() || !process.stdin.isTTY) {
      throw new SfError(
        messages.getMessage('error.staleLineageNotConfirmed'),
        'ScanStaleLineageNotConfirmed',
        messages.getMessages('actions.staleLineageNotConfirmed')
      );
    }
    return this.confirm({
      message: messages.getMessage('prompt.staleLineage'),
      defaultAnswer: false,
      ms: LINEAGE_CONFIRM_TIMEOUT_MS,
    });
  }

  private warnStaleLineage(
    messages: Messages<string>,
    config: Record<string, unknown>,
    stale: LineagePermissionGaps
  ): void {
    const objects = [...new Set([...stale.targets, ...stale.sources])];
    const lines = [...stale.targets.map((name) => `write: ${name}`), ...stale.sources.map((name) => `read: ${name}`)];
    this.warn(
      messages.getMessage('warning.staleLineage', [
        countEntriesReferencing(config, objects),
        lines.map((line) => `  - ${line}`).join('\n'),
      ])
    );
  }

  protected abstract getCodeType(): 'script' | 'function';
  protected abstract getMessages(): Messages<string>;
}

function hasStaleLineage(stale: LineagePermissionGaps): boolean {
  return stale.targets.length > 0 || stale.sources.length > 0;
}
