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
import * as os from 'node:os';
import * as path from 'node:path';
import { expect } from 'chai';
import {
  countEntriesReferencing,
  countPairs,
  diffLineage,
  findPermissionGaps,
  findStaleLineage,
  hasInvalidLineage,
  hasLineageSection,
  isEmptyDiff,
  readLineage,
  replaceLineage,
  writeConfigJson,
} from '../../src/utils/lineageConfig.js';

const CONFIG = {
  entryPoint: 'entrypoint.py',
  dataspace: 'default',
  permissions: { read: { dlo: ['In__dll'] }, write: { dlo: ['out__dll'] } },
};

describe('lineageConfig', () => {
  describe('readLineage', () => {
    it('returns [] when the section is absent or not an array', () => {
      expect(readLineage({})).to.deep.equal([]);
      expect(readLineage({ dataLineage: 'nope' })).to.deep.equal([]);
    });

    it('drops malformed entries', () => {
      const good = { targetField: 'o.a', sourceFields: ['i.a'] };
      expect(readLineage({ dataLineage: [good, { targetField: 1 }, null] })).to.deep.equal([good]);
    });

    it('drops entries whose sourceFields are not all strings', () => {
      const good = { targetField: 'o.a', sourceFields: ['i.a'] };
      expect(readLineage({ dataLineage: [good, { targetField: 'o.b', sourceFields: [null] }] })).to.deep.equal([good]);
    });
  });

  it('hasLineageSection ignores an absent or empty section', () => {
    expect(hasLineageSection({})).to.equal(false);
    expect(hasLineageSection({ dataLineage: [] })).to.equal(false);
    expect(hasLineageSection({ dataLineage: [null] })).to.equal(true);
    expect(hasLineageSection({ dataLineage: 'nope' })).to.equal(true);
  });

  describe('hasInvalidLineage', () => {
    const entry = { targetField: 'o.a', sourceFields: ['i.a'] };

    it('is false for absent or well-formed lineage', () => {
      expect(hasInvalidLineage({})).to.equal(false);
      expect(hasInvalidLineage({ dataLineage: [] })).to.equal(false);
      expect(hasInvalidLineage({ dataLineage: [entry, { targetField: 'o.b', sourceFields: [] }] })).to.equal(false);
    });

    it('flags a non-array section and malformed entries', () => {
      expect(hasInvalidLineage({ dataLineage: 'nope' })).to.equal(true);
      expect(hasInvalidLineage({ dataLineage: [entry, { targetField: 'o.b', sourceFields: [null] }] })).to.equal(true);
    });

    it('flags duplicate targets case-insensitively', () => {
      expect(hasInvalidLineage({ dataLineage: [entry, entry] })).to.equal(true);
      expect(hasInvalidLineage({ dataLineage: [entry, { ...entry, targetField: 'O.A' }] })).to.equal(true);
    });
  });

  describe('diffLineage', () => {
    it('reports added, removed and changed targets', () => {
      const diff = diffLineage(
        [
          { targetField: 'o.keep', sourceFields: ['i.a', 'i.b'] },
          { targetField: 'o.change', sourceFields: ['i.a'] },
          { targetField: 'o.gone', sourceFields: ['i.a'] },
        ],
        [
          { targetField: 'o.keep', sourceFields: ['i.b', 'i.a'] },
          { targetField: 'o.change', sourceFields: ['i.c'] },
          { targetField: 'o.new', sourceFields: ['i.a'] },
        ]
      );
      expect(diff).to.deep.equal({ added: ['o.new'], removed: ['o.gone'], changed: ['o.change'] });
      expect(isEmptyDiff(diff)).to.equal(false);
    });

    it('is empty for identical lineage', () => {
      const entries = [{ targetField: 'o.a', sourceFields: ['i.a'] }];
      expect(isEmptyDiff(diffLineage(entries, entries))).to.equal(true);
    });
  });

  it('countPairs sums source fields', () => {
    expect(
      countPairs([
        { targetField: 'o.a', sourceFields: ['i.a', 'i.b'] },
        { targetField: 'o.b', sourceFields: ['i.c'] },
      ])
    ).to.equal(3);
  });

  it('replaceLineage replaces wholesale and keeps other keys in order', () => {
    const entries = [{ targetField: 'out__dll.a', sourceFields: ['In__dll.a'] }];
    const updated = replaceLineage(
      { ...CONFIG, dataLineage: [{ targetField: 'out__dll.old', sourceFields: ['In__dll.old'] }], extra: 1 },
      entries
    );
    expect(Object.keys(updated)).to.deep.equal(['entryPoint', 'dataspace', 'permissions', 'dataLineage', 'extra']);
    expect(updated.dataLineage).to.deep.equal(entries);
  });

  describe('findPermissionGaps', () => {
    it('reports objects missing from permissions, case-insensitively', () => {
      expect(findPermissionGaps(CONFIG, ['out__dll', 'other__dll'], ['in__dll', 'x__dll', 'x__dll'])).to.deep.equal({
        targets: ['other__dll'],
        sources: ['x__dll'],
      });
    });

    it('treats a missing permissions section as nothing permitted', () => {
      expect(findPermissionGaps({}, ['o'], ['i'])).to.deep.equal({ targets: ['o'], sources: ['i'] });
    });
  });

  describe('findStaleLineage', () => {
    it('is empty without dataLineage', () => {
      expect(findStaleLineage(CONFIG)).to.deep.equal({ targets: [], sources: [] });
    });

    it('is empty when lineage matches permissions', () => {
      const config = { ...CONFIG, dataLineage: [{ targetField: 'out__dll.a', sourceFields: ['In__dll.a'] }] };
      expect(findStaleLineage(config)).to.deep.equal({ targets: [], sources: [] });
    });

    it('reports a stale target and a stale source', () => {
      const config = {
        ...CONFIG,
        dataLineage: [
          { targetField: 'old_out__dll.a', sourceFields: ['In__dll.a'] },
          { targetField: 'out__dll.b', sourceFields: ['old_in__dll.b'] },
        ],
      };
      expect(findStaleLineage(config)).to.deep.equal({ targets: ['old_out__dll'], sources: ['old_in__dll'] });
      expect(countEntriesReferencing(config, ['old_out__dll'])).to.equal(1);
      expect(countEntriesReferencing(config, ['old_out__dll', 'OLD_IN__dll'])).to.equal(2);
    });

    it('ignores malformed source fields instead of throwing', () => {
      const config = { ...CONFIG, dataLineage: [{ targetField: 'out__dll.a', sourceFields: [null] }] };
      expect(findStaleLineage(config)).to.deep.equal({ targets: [], sources: [] });
      expect(countEntriesReferencing(config, ['in__dll'])).to.equal(0);
    });

    it('reads DMO permissions too', () => {
      const config = {
        permissions: { read: { dmo: ['in__dlm'] }, write: { dmo: ['out__dlm'] } },
        dataLineage: [{ targetField: 'out__dlm.a', sourceFields: ['in__dlm.a', 'in__dll.a'] }],
      };
      expect(findStaleLineage(config)).to.deep.equal({ targets: [], sources: ['in__dll'] });
    });
  });

  it('writeConfigJson writes 2-space JSON with a trailing newline', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'test-lineage-config-'));
    try {
      const file = path.join(dir, 'config.json');
      await writeConfigJson(file, { a: [1] });
      expect(fs.readFileSync(file, 'utf8')).to.equal('{\n  "a": [\n    1\n  ]\n}\n');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
