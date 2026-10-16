# [1.6.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.5.0...1.6.0) (2026-10-16)

### Bug Fixes

- address review findings on lineage generate and scan ([11282a3](https://github.com/salesforcecli/plugin-data-code-extension/commit/11282a3f54839883a59c63f384c650be7400c850))
- address various PR concerns and comments ([8269aeb](https://github.com/salesforcecli/plugin-data-code-extension/commit/8269aeb4310243a8b5da968f2f866182a7860982))
- failing windows unit test ([7afa713](https://github.com/salesforcecli/plugin-data-code-extension/commit/7afa713e3eaf6898db02b27fc719bc253acf5c94))
- guard scan writes and build-file outputs, fix Windows mount parsing in tests ([01de939](https://github.com/salesforcecli/plugin-data-code-extension/commit/01de939fffff2ccb267c380c68cefe8f17f906b5))
- protect missing package inputs from --output-file by path ([4efd635](https://github.com/salesforcecli/plugin-data-code-extension/commit/4efd63568f06f47f91de3ff3ed03fb1efa51087d))

### Features

- addressing LLM complaints ([8f5caa5](https://github.com/salesforcecli/plugin-data-code-extension/commit/8f5caa5f65fc82da72e81938143929b38b768961))
- customer warning 10 mins, UDF warning ([9783a65](https://github.com/salesforcecli/plugin-data-code-extension/commit/9783a65e0a1823df5936f64e06517d65bc479bc4))
- initial attempt at lineage ([ae3403a](https://github.com/salesforcecli/plugin-data-code-extension/commit/ae3403a85378588205af43455706504623210480))

# [1.5.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.4.1...1.5.0) (2026-10-07)

### Features

- add --use-in-feature flag to script init (W-24375081) ([d91892e](https://github.com/salesforcecli/plugin-data-code-extension/commit/d91892ec748f3a073722d352287cf9f42f05cbde))

## [1.4.1](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.4.0...1.4.1) (2026-08-19)

### Bug Fixes

- preserve executable bit in zip dependency staging ([b6e6be3](https://github.com/salesforcecli/plugin-data-code-extension/commit/b6e6be36d45101adf7574beb616f5ab1f171657a))
- use fs.copyFile to preserve permissions ([75fcca2](https://github.com/salesforcecli/plugin-data-code-extension/commit/75fcca2f4c3f213015df8cb58c98520d83f0847b))

# [1.4.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.3.3...1.4.0) (2026-08-18)

### Bug Fixes

- address deploy/run PR review feedback ([95e7086](https://github.com/salesforcecli/plugin-data-code-extension/commit/95e70868ecb092ee5ca6eb9e5b7679990510e22b))

### Features

- port deploy and run commands to native TypeScript ([30184e6](https://github.com/salesforcecli/plugin-data-code-extension/commit/30184e69dca5f887cb8c68729553265198885f0e))

## [1.3.3](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.3.2...1.3.3) (2026-08-05)

### Bug Fixes

- exclude credential file from zip for external-callout ([d0160c5](https://github.com/salesforcecli/plugin-data-code-extension/commit/d0160c5da65f7fcae0d9c13962cb66a4eb41a306))

## [1.3.2](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.3.1...1.3.2) (2026-07-06)

### Bug Fixes

- correct '--target-org' and '--package-version' flag description ([155b47d](https://github.com/salesforcecli/plugin-data-code-extension/commit/155b47d254c305057fd45e93c5a5f5e2680d06e6))

## [1.3.1](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.3.0...1.3.1) (2026-06-15)

### Bug Fixes

- exclude local modules from scan command ([c7edae2](https://github.com/salesforcecli/plugin-data-code-extension/commit/c7edae232fbf581c6113e2bc83fddaafdfc597bc))
- fix unit tests for scan ([62b9a85](https://github.com/salesforcecli/plugin-data-code-extension/commit/62b9a8550f2370006498d705148912d2edf5ef21))
- include directories and subdirectories for local module detection ([db04377](https://github.com/salesforcecli/plugin-data-code-extension/commit/db04377b8835154ffef574e6d98e98bd2adbbb3c))
- updated impl to use pipreqs ([f1b53eb](https://github.com/salesforcecli/plugin-data-code-extension/commit/f1b53ebbe3b9e4983b09127376b37ca5c107d5af))

# [1.3.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.2.1...1.3.0) (2026-06-10)

### Bug Fixes

- **zip:** address PR review on native zip port ([c7b679b](https://github.com/salesforcecli/plugin-data-code-extension/commit/c7b679b5b6164a6e655fdf8379aa00b7100e6eff)), closes [#22](https://github.com/salesforcecli/plugin-data-code-extension/issues/22)
- **zip:** correct docker --network ordering and verify build files ([59d140b](https://github.com/salesforcecli/plugin-data-code-extension/commit/59d140bf3546ea91439fce30980c7f0193a493d2))

### Features

- port zip command from Python to native TypeScript ([7d99436](https://github.com/salesforcecli/plugin-data-code-extension/commit/7d994362616704ddc2a74ace2eac25f2b423b987))

## [1.2.1](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.2.0...1.2.1) (2026-06-03)

### Bug Fixes

- allow --use-in-feature override for function deploy ([e26d4ff](https://github.com/salesforcecli/plugin-data-code-extension/commit/e26d4ffd5c031654be9ad665d1f50f1bb4272b3b))

# [1.2.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.1.1...1.2.0) (2026-05-28)

### Features

- migrate init and scan from python spawn to native typescript ([b43f956](https://github.com/salesforcecli/plugin-data-code-extension/commit/b43f95634217b5d53eef5f54bda09be271fb43c5))

## [1.1.1](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.1.0...1.1.1) (2026-05-15)

### Bug Fixes

- increased polling timeout to 10 minutes ([03a1961](https://github.com/salesforcecli/plugin-data-code-extension/commit/03a1961e8fb61f08371e299240c55e7cb2d25cee))

# [1.1.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/1.0.0...1.1.0) (2026-05-05)

### Features

- add optional target-org support to function run ([f37f236](https://github.com/salesforcecli/plugin-data-code-extension/commit/f37f2364d64762b9df7044fb94269f10bb297fbd))
- add optional target-org support to function run ([d3f8186](https://github.com/salesforcecli/plugin-data-code-extension/commit/d3f81864e26438aa0ba5c494cabb22c91249e8b6))

# [1.0.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.5...1.0.0) (2026-05-01)

- feat!: restructure function-specific flags for CLI ([b4772c5](https://github.com/salesforcecli/plugin-data-code-extension/commit/b4772c52b5425775e2409558ceb92d9a280e1975))
- feat!: restructure function-specific flags for CLI ([17c3e35](https://github.com/salesforcecli/plugin-data-code-extension/commit/17c3e35b932afc7d8c7858fd63c6c11fd224642d))
- feat!: restructure function-specific flags for CLI ([fbd96ad](https://github.com/salesforcecli/plugin-data-code-extension/commit/fbd96ad619a0e2adea6fe0e62e7017e0ab36b622))
- feat!: restructure function-specific flags for CLI ([43b3cfc](https://github.com/salesforcecli/plugin-data-code-extension/commit/43b3cfcd9f034ff694476f37c82fb6b62355b9ca))
- feat!: restructure function-specific flags for CLI ([8f43b76](https://github.com/salesforcecli/plugin-data-code-extension/commit/8f43b766ebe687227ad1ce0ff3c1ea22eccc43d8))

### BREAKING CHANGES

- Command signatures changed for function init, deploy, and run

@W-22278901

- Command signatures changed for function init, deploy, and run

@W-22278901

- Command signatures changed for function init, deploy, and run

@W-22278901

- Command signatures changed for function init, deploy, and run

@W-22278901

- Command signatures changed for function init, deploy, and run

@W-22278901

## [0.1.5](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.4...0.1.5) (2026-04-14)

### Bug Fixes

- adding character min/max checking on required flags ([fc23bba](https://github.com/salesforcecli/plugin-data-code-extension/commit/fc23bba49f7e55cb7ae47b8de7ab703b14b2a4ae))
- adding pip package update checker and user warning ([957d52d](https://github.com/salesforcecli/plugin-data-code-extension/commit/957d52dd831196a97974659da15a31f536391082))

## [0.1.4](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.3...0.1.4) (2026-04-09)

### Bug Fixes

- truing up some bad regex ([09a7c3f](https://github.com/salesforcecli/plugin-data-code-extension/commit/09a7c3feca7c8d4c3e86dc33fa24e320e45a036e))

## [0.1.3](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.2...0.1.3) (2026-04-03)

### Bug Fixes

- more consistent help text ([58bf7f7](https://github.com/salesforcecli/plugin-data-code-extension/commit/58bf7f7399f988062172ee0cbae96dc9ef9b6165))

## [0.1.2](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.1...0.1.2) (2026-04-02)

### Bug Fixes

- consistent help menu verbiage ([673b1e9](https://github.com/salesforcecli/plugin-data-code-extension/commit/673b1e98cb9ea5667804c5c1a2f73f5ef6e3f763))

## [0.1.1](https://github.com/salesforcecli/plugin-data-code-extension/compare/0.1.0...0.1.1) (2026-03-31)

### Bug Fixes

- failing unit tests after changes ([daa6cce](https://github.com/salesforcecli/plugin-data-code-extension/commit/daa6cceb13b47e2a66ebe3e0a8192aa3fb35b8bd))
- squash some scan bugs ([18764a0](https://github.com/salesforcecli/plugin-data-code-extension/commit/18764a0751641149c3ad42434ce79d06b40c41a4))
- squash some zip bugs ([ede053d](https://github.com/salesforcecli/plugin-data-code-extension/commit/ede053db469ceed0f3458a8a5cece055897346e8))
- update README, remove examples ([4464cff](https://github.com/salesforcecli/plugin-data-code-extension/commit/4464cff6965bdc1f8cbd7faac0fa40070e944f95))

# [0.1.0](https://github.com/salesforcecli/plugin-data-code-extension/compare/2c2a16146e21773f4ed530fb8cd49cb5007346b6...0.1.0) (2026-03-25)

### Bug Fixes

- add some function examples with the required function-invoke-option flag ([23b7f80](https://github.com/salesforcecli/plugin-data-code-extension/commit/23b7f802f353934a5c141cac04a83f15e73f3711))
- adding missing nut script for failing tests ([eed24c8](https://github.com/salesforcecli/plugin-data-code-extension/commit/eed24c8904626c617b1246fc1e7f26bd6904990e))
- adding venv to ignore ([70e589c](https://github.com/salesforcecli/plugin-data-code-extension/commit/70e589c74d490b36c1da001e84a6fea22c14fe14))
- broken test after refactor ([fcec963](https://github.com/salesforcecli/plugin-data-code-extension/commit/fcec963f474f33948f50a48d537c34a5935fc411))
- don't supress deploy stdout, stderr ([907a066](https://github.com/salesforcecli/plugin-data-code-extension/commit/907a06663a63444d91ca5ab06592a6ce03e1b667))
- edit messages ([61fe889](https://github.com/salesforcecli/plugin-data-code-extension/commit/61fe8899088fd1b0837ae083327afec5a214a84e))
- environment checker utility method ([2f7e339](https://github.com/salesforcecli/plugin-data-code-extension/commit/2f7e339d541428046e41b503b7d99323baca2a1d))
- failing test after streaming stdout, stderr ([9e920ea](https://github.com/salesforcecli/plugin-data-code-extension/commit/9e920eaf6d12986238b6c35ce6426ad7cccac98b))
- failing tests after various changes ([3b04d88](https://github.com/salesforcecli/plugin-data-code-extension/commit/3b04d8808db423e5283a5fd9e4ec80d10bc6532e))
- global flags extracted to types ([6e7f0d1](https://github.com/salesforcecli/plugin-data-code-extension/commit/6e7f0d11261179f9cbf9b0c6611800bb9540ec49))
- hide global variables the recommended way ([a446735](https://github.com/salesforcecli/plugin-data-code-extension/commit/a446735a60d56468139ffb159d171b874933ebaa))
- less error pattern matching, refactor to binary executor ([007b0c6](https://github.com/salesforcecli/plugin-data-code-extension/commit/007b0c6130501511e7fd811198c8c8c0cac1c0b9))
- license, dev-scripts, deps ([96005b9](https://github.com/salesforcecli/plugin-data-code-extension/commit/96005b96272c595d5e7a897f0d3d15edef94fdf3))
- linter failure ([b6d43d2](https://github.com/salesforcecli/plugin-data-code-extension/commit/b6d43d202ad1b8c0ce89224dea32bb41ef3b082a))
- linting problems ([1247152](https://github.com/salesforcecli/plugin-data-code-extension/commit/12471521ece1873ef473648e54f1830b8c9d1115))
- missing config.json ([5179d1e](https://github.com/salesforcecli/plugin-data-code-extension/commit/5179d1e554527637d4c2b8efbbc8b4fd385daef5))
- package-version not version ([f11c67e](https://github.com/salesforcecli/plugin-data-code-extension/commit/f11c67e9f4ca3f585512462804955e3b5dbf45ab))
- python checker pin to 3.11, error handling ([82da7a7](https://github.com/salesforcecli/plugin-data-code-extension/commit/82da7a7933decd1d03302fabd63e8b393e0b1dca))
- refactor away to a shared types ([c62684d](https://github.com/salesforcecli/plugin-data-code-extension/commit/c62684def3e5a3b4de3f0201a361ee85de97ddfb))
- release beta version ([6d1942e](https://github.com/salesforcecli/plugin-data-code-extension/commit/6d1942e8a82953631d3b55a8d1a8eca3bce70727))
- remove lots of disabling of the linter ([f177823](https://github.com/salesforcecli/plugin-data-code-extension/commit/f177823e8b53461ebfeb7b4ac97625fff49a031d))
- rename accordingly ([5c2b5f5](https://github.com/salesforcecli/plugin-data-code-extension/commit/5c2b5f5b86707dd49606641adfd03cc2720664c2))
- test failures ([dd49c14](https://github.com/salesforcecli/plugin-data-code-extension/commit/dd49c1464943c9c3bc50c0c39ba955a782596a4f))
- throw PackageDirNotFound instead of generic Error in zip command ([2c2a161](https://github.com/salesforcecli/plugin-data-code-extension/commit/2c2a16146e21773f4ed530fb8cd49cb5007346b6))
- token replace ([04ccd03](https://github.com/salesforcecli/plugin-data-code-extension/commit/04ccd03a97d8d30bc1853f0ea910dab007c34108))
- token substitution ([4167cb8](https://github.com/salesforcecli/plugin-data-code-extension/commit/4167cb863e58f5b74f7365e116f1ed5ee2c820d3))
- updated README, removed profile flag ([41f0e21](https://github.com/salesforcecli/plugin-data-code-extension/commit/41f0e21728c7b2ae0e057b5f5d4338c6f46df96b))
- use byoc product tag ([688a63b](https://github.com/salesforcecli/plugin-data-code-extension/commit/688a63b13b3edac97261a7fba42e99b876062a6a))
- use some generics on flag construction ([8979b95](https://github.com/salesforcecli/plugin-data-code-extension/commit/8979b9589a24f530bdfb303f5d0f615c38da2b31))
- use spawn for all the things ([8c40589](https://github.com/salesforcecli/plugin-data-code-extension/commit/8c40589e12d1cb61349e48258bb507ef3f294891))
- version is reserved, move to package-version ([b9bce72](https://github.com/salesforcecli/plugin-data-code-extension/commit/b9bce722fbe3369b757498b00d18fee045be9a0b))
- yarn and CONTRIBUTING ([9a5101b](https://github.com/salesforcecli/plugin-data-code-extension/commit/9a5101b02fee83fad9eab716aaa9434f0d5e47cf))
