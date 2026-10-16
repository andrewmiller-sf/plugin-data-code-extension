# plugin-data-code-extension

[![NPM](https://img.shields.io/npm/v/@salesforce/plugin-data-code-extension.svg?label=@salesforce/plugin-data-code-extension)](https://www.npmjs.com/package/@salesforce/plugin-data-code-extension) [![Downloads/week](https://img.shields.io/npm/dw/@salesforce/plugin-data-code-extension.svg)](https://npmjs.org/package/@salesforce/plugin-data-code-extension) [![License](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](https://opensource.org/license/apache-2-0)

# Description

This plugin is bundled with the [Salesforce CLI](https://developer.salesforce.com/tools/sfdxcli). For more information on the CLI, read the [getting started guide](https://developer.salesforce.com/docs/atlas.en-us.sfdx_setup.meta/sfdx_setup/sfdx_setup_intro.htm).

We always recommend using the latest version of these commands bundled with the CLI, however, you can install a specific version or tag if needed.

## Install

```bash
sf plugins install @salesforce/plugin-data-code-extension@x.y.z
```

## Issues

Please report any issues at https://github.com/forcedotcom/cli/issues

## Contributing

1. Please read our [Code of Conduct](CODE_OF_CONDUCT.md)
2. Create a new issue before starting your project so that we can keep track of
   what you are trying to add/fix. That way, we can also offer suggestions or
   let you know if there is already an effort in progress.
3. Fork this repository.
4. [Build the plugin locally](#build)
5. Create a _topic_ branch in your fork. Note, this step is recommended but technically not required if contributing using a fork.
6. Edit the code in your fork.
7. Write appropriate tests for your changes. Try to achieve at least 95% code coverage on any new code. No pull request will be accepted without unit tests.
8. Sign CLA (see [CLA](#cla) below).
9. Send us a pull request when you are done. We'll review your code, suggest any needed changes, and merge it in.

### CLA

External contributors will be required to sign a Contributor's License
Agreement. You can do so by going to https://cla.salesforce.com/sign-cla.

### Build

To build the plugin locally, make sure to have yarn installed and run the following commands:

```bash
# Clone the repository
git clone git@github.com:salesforcecli/data-code-extension

# Install the dependencies and compile
yarn && yarn build
```

To use your plugin, run using the local `./bin/dev` or `./bin/dev.cmd` file.

```bash
# Run using local run file.
bin/dev.js data-code-extension --help
```

There should be no differences when running via the Salesforce CLI or using the local run file. However, it can be useful to link the plugin to do some additional testing or run your commands from anywhere on your machine.

```bash
# Link your plugin to the sf cli
sf plugins link .
# To verify
sf plugins
```

## Commands

<!-- commands -->

- [`sf data-code-extension function deploy`](#sf-data-code-extension-function-deploy)
- [`sf data-code-extension function init`](#sf-data-code-extension-function-init)
- [`sf data-code-extension function run`](#sf-data-code-extension-function-run)
- [`sf data-code-extension function scan`](#sf-data-code-extension-function-scan)
- [`sf data-code-extension function zip`](#sf-data-code-extension-function-zip)
- [`sf data-code-extension script deploy`](#sf-data-code-extension-script-deploy)
- [`sf data-code-extension script init`](#sf-data-code-extension-script-init)
- [`sf data-code-extension script run`](#sf-data-code-extension-script-run)
- [`sf data-code-extension script scan`](#sf-data-code-extension-script-scan)
- [`sf data-code-extension script zip`](#sf-data-code-extension-script-zip)

## `sf data-code-extension function deploy`

Deploy a Data Code Extension function package to a Salesforce org.

```
USAGE
  $ sf data-code-extension function deploy -n <value> --package-version <value> -d <value> -p <value> -o <value> [--flags-dir <value>]
    [--network <value>] [--cpu-size CPU_L|CPU_XL|CPU_2XL|CPU_4XL]

FLAGS
  -d, --description=<value>      (required) Description of the package.
  -n, --name=<value>             (required) Name of the package to deploy.
  -o, --target-org=<value>       (required) Target Salesforce org for deployment.
  -p, --package-dir=<value>      (required) Directory containing the packaged code.
      --cpu-size=<option>        [default: CPU_2XL] CPU size for the deployment.
                                 <options: CPU_L|CPU_XL|CPU_2XL|CPU_4XL>
      --network=<value>          Network configuration for Jupyter notebooks.
      --package-version=<value>  (required) Version of the package to deploy.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Deploy a Data Code Extension function package to a Salesforce org.

  Deploys an initialized and packaged Data Cloud code extension to a Salesforce org. The package must be initialized and
  zipped before deployment. Supports both script and function packages with configurable CPU resources and network
  settings. Run this command from within the package directory (e.g. cd ./my-script-package).

EXAMPLES
  Deploy a function package to the org with alias "myorg":

    $ sf data-code-extension function deploy --name my-package --package-version 1.0.0 --description "My package" \
      --package-dir ./payload --target-org myorg

  Deploy with a specific CPU size:

    $ sf data-code-extension function deploy --name my-package --package-version 1.0.0 --description "My package" \
      --package-dir ./payload --target-org myorg --cpu-size CPU_4XL

FLAG DESCRIPTIONS
  -d, --description=<value>  Description of the package.

    A meaningful description of what your Data Cloud custom code package does. This helps identify the package purpose
    in your Salesforce org.

  -n, --name=<value>  Name of the package to deploy.

    The unique name identifier for your Data Cloud custom code package. This name is used to identify the deployment in
    your Salesforce org.

  -o, --target-org=<value>  Target Salesforce org for deployment.

    The alias or username of the Salesforce org where you want to deploy the Data Cloud custom code package. The org
    must have Data Cloud enabled and appropriate permissions.

  -p, --package-dir=<value>  Directory containing the packaged code.

    The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory
    contains the package files created by the 'zip' command.

  --cpu-size=CPU_L|CPU_XL|CPU_2XL|CPU_4XL  CPU size for the deployment.

    The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra large,
    default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

  --network=<value>  Network configuration for Jupyter notebooks.

    Optional network configuration setting for packages that include Jupyter notebooks. Common values include 'host' for
    host network mode. Typically applies to packages with Jupyter notebook support.

  --package-version=<value>  Version of the package to deploy.

    Reserved for future use.
```

_See code: [src/commands/data-code-extension/function/deploy.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/function/deploy.ts)_

## `sf data-code-extension function init`

Initialize the Data Code Extension function package.

```
USAGE
  $ sf data-code-extension function init -p <value> [--flags-dir <value>] [-u SearchIndexChunking]

FLAGS
  -p, --package-dir=<value>      (required) Directory path where the package will be created.
  -u, --use-in-feature=<option>  [default: SearchIndexChunking] Feature flag for function initialization (function
                                 packages only).
                                 <options: SearchIndexChunking>

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Initialize the Data Code Extension function package.

  Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

EXAMPLES
  Initialize a function-based Data Cloud package:

    $ sf data-code-extension function init --package-dir ./my-function-package

FLAG DESCRIPTIONS
  -p, --package-dir=<value>  Directory path where the package will be created.

    The directory path where the new package will be initialized. The directory will be created if it doesn't exist.

  -u, --use-in-feature=SearchIndexChunking  Feature flag for function initialization (function packages only).

    Configuration for which feature this function will be used in. SearchIndexChunking is the only valid option and is
    used by default if not specified.
```

_See code: [src/commands/data-code-extension/function/init.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/function/init.ts)_

## `sf data-code-extension function run`

Run a Data Code Extension function package locally using data from your Salesforce Org.

```
USAGE
  $ sf data-code-extension function run -e <value> -t <value> [--flags-dir <value>] [--config-file <value>] [--dependencies <value>]
    [--target-org <value>]

FLAGS
  -e, --entrypoint=<value>    (required) Entrypoint file for the package to run.
  -t, --test-with=<value>     (required) Path to test.json file to test Data Code Extension function
      --config-file=<value>   Path to a config file.
      --dependencies=<value>  Modules to import before the run.
      --target-org=<value>    Target Salesforce org to run against.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Run a Data Code Extension function package locally using data from your Salesforce Org.

  Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized
  before running. Supports both script and function packages with optional config file and dependencies overrides.

EXAMPLES
  Run a function package:

    $ sf data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with \
      ./my-function-package/payload/tests/test.json

  Run with a target org:

    $ sf data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with \
      ./my-function-package/payload/tests/test.json --target-org myorg

  Run with a custom config file:

    $ sf data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with \
      ./my-function-package/payload/tests/tests.json --config-file ./my-function-package/payload/config.json

FLAG DESCRIPTIONS
  -e, --entrypoint=<value>  Entrypoint file for the package to run.

    The path to the entrypoint file of your initialized Data Cloud custom code package.

  -t, --test-with=<value>  Path to test.json file to test Data Code Extension function

    Path to a JSON file that provides input request for the function.

  --config-file=<value>  Path to a config file.

    Optional path to a JSON config file that provides input payload for the run. Defaults to the package's
    payload/config.json if not specified.

  --dependencies=<value>  Modules to import before the run.

    Optional comma-separated list of Python modules (or module.attribute) to import before the entrypoint runs. Use
    import names, such as 'yaml' rather than 'pyyaml'. Nothing is installed: each module must already be installed in
    the active Python environment.

  --target-org=<value>  Target Salesforce org to run against.

    Optional. The alias or username of the Salesforce org where you want to run the Data Cloud code extension package.
    The org must have Data Cloud enabled and appropriate permissions.
```

_See code: [src/commands/data-code-extension/function/run.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/function/run.ts)_

## `sf data-code-extension function scan`

Scan the Data Code Extension function package for permissions and dependencies.

```
USAGE
  $ sf data-code-extension function scan [--flags-dir <value>] [-e <value>] [--config-file <value>] [-d] [-n]

FLAGS
  -d, --dry-run              Preview changes without modifying any files.
  -e, --entrypoint=<value>   Path to the entrypoint Python file to scan.
  -n, --no-requirements      Skip updating the requirements.txt file.
      --config-file=<value>  Path to an alternate config file.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Scan the Data Code Extension function package for permissions and dependencies.

  Scans Python files in an initialized Data Code Extension package directory to identify required permissions and
  dependencies. Updates the config.json and requirements.txt files based on the code analysis.

EXAMPLES
  Scan with a custom entrypoint file:

    $ sf data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py

  Perform a dry run to see what would be changed:

    $ sf data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py --dry-run

  Scan without updating the requirements.txt file:

    $ sf data-code-extension function scan --entrypoint ./my-function-package/payload/entrypoint.py \
      --no-requirements

FLAG DESCRIPTIONS
  -d, --dry-run  Preview changes without modifying any files.

    When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing
    changes before applying them.

  -e, --entrypoint=<value>  Path to the entrypoint Python file to scan.

    The path to the entrypoint Python file that will be analyzed. Defaults to 'payload/entrypoint.py' in the current
    directory.

  -n, --no-requirements  Skip updating the requirements.txt file.

    When set, only scans for permissions and updates config.json, but doesn't update the requirements.txt file with
    discovered dependencies.

  --config-file=<value>  Path to an alternate config file.

    Optional path to an alternate JSON config file to use instead of the package's default config. The file must exist.
    Useful for testing different configurations without modifying the package's primary config.json.
```

_See code: [src/commands/data-code-extension/function/scan.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/function/scan.ts)_

## `sf data-code-extension function zip`

Create a compressed archive of the Data Code Extension function package.

```
USAGE
  $ sf data-code-extension function zip -p <value> [--flags-dir <value>] [-n <value>]

FLAGS
  -n, --network=<value>      Network configuration, typically used for Jupyter notebook packages.
  -p, --package-dir=<value>  (required) Directory containing the initialized package to archive.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Create a compressed archive of the Data Code Extension function package.

  Creates a ZIP archive of an initialized Data Code Extension package for deployment. The archive includes all necessary
  files from the package directory while respecting .gitignore patterns and package requirements.

EXAMPLES
  Create an archive of a function package:

    $ sf data-code-extension function zip --package-dir ./my-function-package/payload

FLAG DESCRIPTIONS
  -n, --network=<value>  Network configuration, typically used for Jupyter notebook packages.

    Optional network configuration for packages that use Jupyter notebooks. Common values include 'host', 'bridge', or a
    custom network name. This flag is typically used when the package needs specific network access configurations.

  -p, --package-dir=<value>  Directory containing the initialized package to archive.

    The path to the directory containing an initialized Data Code Extension package. The directory must exist and
    contain a valid package structure with config.json.
```

_See code: [src/commands/data-code-extension/function/zip.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/function/zip.ts)_

## `sf data-code-extension script deploy`

Deploy a Data Code Extension script package to a Salesforce org.

```
USAGE
  $ sf data-code-extension script deploy -n <value> --package-version <value> -d <value> -p <value> -o <value> [--flags-dir <value>]
    [--network <value>] [--cpu-size CPU_L|CPU_XL|CPU_2XL|CPU_4XL]

FLAGS
  -d, --description=<value>      (required) Description of the package.
  -n, --name=<value>             (required) Name of the package to deploy.
  -o, --target-org=<value>       (required) Target Salesforce org for deployment.
  -p, --package-dir=<value>      (required) Directory containing the packaged code.
      --cpu-size=<option>        [default: CPU_2XL] CPU size for the deployment.
                                 <options: CPU_L|CPU_XL|CPU_2XL|CPU_4XL>
      --network=<value>          Network configuration for Jupyter notebooks.
      --package-version=<value>  (required) Version of the package to deploy.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Deploy a Data Code Extension script package to a Salesforce org.

  Deploys an initialized and packaged Data Cloud code extension to a Salesforce org. The package must be initialized and
  zipped before deployment. Supports both script and function packages with configurable CPU resources and network
  settings. Run this command from within the package directory (e.g. cd ./my-script-package).

EXAMPLES
  Deploy a script package to the org with alias "myorg":

    $ sf data-code-extension script deploy --name my-package --package-version 1.0.0 --description "My package" \
      --package-dir ./payload --target-org myorg

  Deploy with a specific CPU size:

    $ sf data-code-extension script deploy --name my-package --package-version 1.0.0 --description "My package" \
      --package-dir ./payload --target-org myorg --cpu-size CPU_4XL

FLAG DESCRIPTIONS
  -d, --description=<value>  Description of the package.

    A meaningful description of what your Data Cloud custom code package does. This helps identify the package purpose
    in your Salesforce org.

  -n, --name=<value>  Name of the package to deploy.

    The unique name identifier for your Data Cloud custom code package. This name is used to identify the deployment in
    your Salesforce org.

  -o, --target-org=<value>  Target Salesforce org for deployment.

    The alias or username of the Salesforce org where you want to deploy the Data Cloud custom code package. The org
    must have Data Cloud enabled and appropriate permissions.

  -p, --package-dir=<value>  Directory containing the packaged code.

    The path to the directory containing your initialized and zipped Data Cloud custom code package. This directory
    contains the package files created by the 'zip' command.

  --cpu-size=CPU_L|CPU_XL|CPU_2XL|CPU_4XL  CPU size for the deployment.

    The CPU allocation size for your deployed package. Options are: CPU_L (small), CPU_XL (large), CPU_2XL (extra large,
    default), CPU_4XL (maximum). Higher CPU sizes provide more processing power but may have quota implications.

  --network=<value>  Network configuration for Jupyter notebooks.

    Optional network configuration setting for packages that include Jupyter notebooks. Common values include 'host' for
    host network mode. Typically applies to packages with Jupyter notebook support.

  --package-version=<value>  Version of the package to deploy.

    Reserved for future use.
```

_See code: [src/commands/data-code-extension/script/deploy.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/script/deploy.ts)_

## `sf data-code-extension script init`

Initialize the Data Code Extension script package.

```
USAGE
  $ sf data-code-extension script init -p <value> [--flags-dir <value>] [-u BatchTransform|StreamingTransform]

FLAGS
  -p, --package-dir=<value>      (required) Directory path where the package will be created.
  -u, --use-in-feature=<option>  [default: BatchTransform] Invoke option for the script package (script packages only).
                                 <options: BatchTransform|StreamingTransform>

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Initialize the Data Code Extension script package.

  Initializes the Data Code Extension by checking system requirements and setting up the necessary environment.

EXAMPLES
  Initialize a script-based Data Cloud package:

    $ sf data-code-extension script init --package-dir ./my-script-package

FLAG DESCRIPTIONS
  -p, --package-dir=<value>  Directory path where the package will be created.

    The directory path where the new package will be initialized. The directory will be created if it doesn't exist.

  -u, --use-in-feature=BatchTransform|StreamingTransform  Invoke option for the script package (script packages only).

    Which transform feature this script is used in: BatchTransform (a bounded, batch data transform; the default) or
    StreamingTransform (a streaming data transform over a DLO/DMO change feed). Defaults to BatchTransform.
```

_See code: [src/commands/data-code-extension/script/init.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/script/init.ts)_

## `sf data-code-extension script run`

Run a Data Code Extension script package locally using data from your Salesforce Org.

```
USAGE
  $ sf data-code-extension script run -e <value> -o <value> [--flags-dir <value>] [--config-file <value>]
  [--dependencies <value>]

FLAGS
  -e, --entrypoint=<value>    (required) Entrypoint file for the package to run.
  -o, --target-org=<value>    (required) Target Salesforce org to run against.
      --config-file=<value>   Path to a config file.
      --dependencies=<value>  Modules to import before the run.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Run a Data Code Extension script package locally using data from your Salesforce Org.

  Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized
  before running. Supports both script and function packages with optional config file and dependencies overrides.

EXAMPLES
  Run a script package against the org with alias "myorg":

    $ sf data-code-extension script run --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg

  Run with a custom config file:

    $ sf data-code-extension script run --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg \
      --config-file ./my-script-package/payload/config.json

FLAG DESCRIPTIONS
  -e, --entrypoint=<value>  Entrypoint file for the package to run.

    The path to the entrypoint file of your initialized Data Cloud custom code package.

  -o, --target-org=<value>  Target Salesforce org to run against.

    The alias or username of the Salesforce org where you want to run the Data Cloud custom code package. The org must
    have Data Cloud enabled and appropriate permissions.

  --config-file=<value>  Path to a config file.

    Optional path to a JSON config file that provides input payload for the run. Defaults to the package's
    payload/config.json if not specified.

  --dependencies=<value>  Modules to import before the run.

    Optional comma-separated list of Python modules (or module.attribute) to import before the entrypoint runs. Use
    import names, such as 'yaml' rather than 'pyyaml'. Nothing is installed: each module must already be installed in
    the active Python environment.
```

_See code: [src/commands/data-code-extension/script/run.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/script/run.ts)_

## `sf data-code-extension script scan`

Scan the Data Code Extension script package for permissions and dependencies.

```
USAGE
  $ sf data-code-extension script scan [--flags-dir <value>] [-e <value>] [--config-file <value>] [-d] [-n]

FLAGS
  -d, --dry-run              Preview changes without modifying any files.
  -e, --entrypoint=<value>   Path to the entrypoint Python file to scan.
  -n, --no-requirements      Skip updating the requirements.txt file.
      --config-file=<value>  Path to an alternate config file.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Scan the Data Code Extension script package for permissions and dependencies.

  Scans Python files in an initialized Data Code Extension package directory to identify required permissions and
  dependencies. Updates the config.json and requirements.txt files based on the code analysis.

EXAMPLES
  Scan with a custom entrypoint file:

    $ sf data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py

  Perform a dry run to see what would be changed:

    $ sf data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py --dry-run

  Scan without updating the requirements.txt file:

    $ sf data-code-extension script scan --entrypoint ./my-script-package/payload/entrypoint.py --no-requirements

FLAG DESCRIPTIONS
  -d, --dry-run  Preview changes without modifying any files.

    When set, performs a scan and shows what would be changed but does not modify any files. Useful for reviewing
    changes before applying them.

  -e, --entrypoint=<value>  Path to the entrypoint Python file to scan.

    The path to the entrypoint Python file that will be analyzed. Defaults to 'payload/entrypoint.py' in the current
    directory.

  -n, --no-requirements  Skip updating the requirements.txt file.

    When set, only scans for permissions and updates config.json, but doesn't update the requirements.txt file with
    discovered dependencies.

  --config-file=<value>  Path to an alternate config file.

    Optional path to an alternate JSON config file to use instead of the package's default config. The file must exist.
    Useful for testing different configurations without modifying the package's primary config.json.
```

_See code: [src/commands/data-code-extension/script/scan.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/script/scan.ts)_

## `sf data-code-extension script zip`

Create a compressed archive of the Data Code Extension script package.

```
USAGE
  $ sf data-code-extension script zip -p <value> [--flags-dir <value>] [-n <value>]

FLAGS
  -n, --network=<value>      Network configuration, typically used for Jupyter notebook packages.
  -p, --package-dir=<value>  (required) Directory containing the initialized package to archive.

GLOBAL FLAGS
  --flags-dir=<value>  Import flag values from a directory.

DESCRIPTION
  Create a compressed archive of the Data Code Extension script package.

  Creates a ZIP archive of an initialized Data Code Extension package for deployment. The archive includes all necessary
  files from the package directory while respecting .gitignore patterns and package requirements.

EXAMPLES
  Create an archive of a script package:

    $ sf data-code-extension script zip --package-dir ./my-script-package/payload

FLAG DESCRIPTIONS
  -n, --network=<value>  Network configuration, typically used for Jupyter notebook packages.

    Optional network configuration for packages that use Jupyter notebooks. Common values include 'host', 'bridge', or a
    custom network name. This flag is typically used when the package needs specific network access configurations.

  -p, --package-dir=<value>  Directory containing the initialized package to archive.

    The path to the directory containing an initialized Data Code Extension package. The directory must exist and
    contain a valid package structure with config.json.
```

_See code: [src/commands/data-code-extension/script/zip.ts](https://github.com/salesforcecli/plugin-data-code-extension/blob/1.6.0/src/commands/data-code-extension/script/zip.ts)_

<!-- commandsstop -->
