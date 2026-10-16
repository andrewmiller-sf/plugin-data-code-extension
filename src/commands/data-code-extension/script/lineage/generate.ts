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
import { Flags } from '@salesforce/sf-plugins-core';
import { Messages } from '@salesforce/core';
import { LineageBase } from '../../../../base/lineageBase.js';

Messages.importMessagesDirectoryFromMetaUrl(import.meta.url);
const messages = Messages.loadMessages('@salesforce/plugin-data-code-extension', 'lineage');

export default class Generate extends LineageBase {
  public static readonly summary = messages.getMessage('summary', ['script']);
  public static readonly description = messages.getMessage('description');
  public static readonly examples = messages.getMessages('examples.script');
  // Hidden until field-level lineage is generally available: the byoc-service and
  // data-prep gates are tenant-whitelisted.
  public static readonly hidden = true;

  public static readonly flags = {
    entrypoint: Flags.file({
      char: 'e',
      summary: messages.getMessage('flags.entrypoint.summary'),
      description: messages.getMessage('flags.entrypoint.description'),
      required: true,
      exists: true,
    }),
    'target-org': Flags.requiredOrg({
      char: 'o',
      summary: messages.getMessage('flags.targetOrg.summary'),
      description: messages.getMessage('flags.targetOrg.description'),
      required: true,
    }),
    'config-file': Flags.file({
      summary: messages.getMessage('flags.configFile.summary'),
      description: messages.getMessage('flags.configFile.description'),
      required: false,
      exists: true,
    }),
    dependencies: Flags.string({
      summary: messages.getMessage('flags.dependencies.summary'),
      description: messages.getMessage('flags.dependencies.description'),
      required: false,
    }),
    'dry-run': Flags.boolean({
      char: 'd',
      summary: messages.getMessage('flags.dryRun.summary'),
      description: messages.getMessage('flags.dryRun.description'),
      default: false,
    }),
    'output-file': Flags.string({
      summary: messages.getMessage('flags.outputFile.summary'),
      description: messages.getMessage('flags.outputFile.description'),
      required: false,
    }),
    'no-prompt': Flags.boolean({
      char: 'p',
      summary: messages.getMessage('flags.noPrompt.summary'),
      description: messages.getMessage('flags.noPrompt.description'),
      default: false,
    }),
    'accept-lineage-ownership': Flags.boolean({
      summary: messages.getMessage('flags.acceptLineageOwnership.summary'),
      description: messages.getMessage('flags.acceptLineageOwnership.description'),
      default: false,
    }),
  };

  // eslint-disable-next-line class-methods-use-this
  protected getCodeType(): 'script' {
    return 'script';
  }

  // eslint-disable-next-line class-methods-use-this
  protected getMessages(): Messages<string> {
    return messages;
  }
}
