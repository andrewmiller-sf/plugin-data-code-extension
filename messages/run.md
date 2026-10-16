# summary

Run a Data Code Extension %s package locally using data from your Salesforce Org.

# description

Executes an initialized Data Cloud custom code package against a Salesforce org. The package must be initialized before running. Supports both script and function packages with optional config file and dependencies overrides.

# examples.script

- Run a script package against the org with alias "myorg":

  <%= config.bin %> data-code-extension script run --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg

- Run with a custom config file:

  <%= config.bin %> data-code-extension script run --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg --config-file ./my-script-package/payload/config.json

# examples.function

- Run a function package:

  <%= config.bin %> data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with ./my-function-package/payload/tests/test.json

- Run with a target org:

  <%= config.bin %> data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with ./my-function-package/payload/tests/test.json --target-org myorg

- Run with a custom config file:

  <%= config.bin %> data-code-extension function run --entrypoint ./my-function-package/payload/entrypoint.py --test-with ./my-function-package/payload/tests/tests.json --config-file ./my-function-package/payload/config.json

# info.checkingPython

Checking Python version...

# info.pythonFound

Python %s found at '%s'

# info.checkingPackages

Checking required Python packages...

# info.packageFound

Package '%s' version %s found

# info.authenticating

Authenticating with Salesforce org '%s'...

# info.authenticated

Successfully authenticated with org '%s'

# info.runningPackage

Running package against Salesforce org...

# info.runComplete

Package at '%s' executed successfully!

# info.runStatus

Run Status: %s

# info.runOutput

Output: %s

# info.runSuccess

Data Code Extension run completed successfully!

# error.runFailed

Failed to run Data Code Extension package

# error.runExecutionFailed

The package run failed: %s

# actions.runExecutionFailed

- Review the error output above for the failing line in your entrypoint.
- Run 'sf data-code-extension <type> scan' to refresh config.json and requirements.txt, then try again.
- Verify the package's dependencies are installed in the active Python environment.

# error.runAuthenticationFailed

Authentication with Salesforce org '%s' failed while running the package.

# actions.runAuthenticationFailed

- Run 'sf org login web --alias <alias>' to (re)authenticate the org.
- Confirm the org alias or username passed to --target-org is correct.
- Verify the org has Data Cloud enabled and your user has the required permissions.

# error.runTerminated

The package run was stopped by signal %s before it finished. Runs time out after %s seconds.

# actions.runTerminated

- If the run timed out, reduce the data it processes (for example, the reader's default_row_limit in an SDK config file) or check for a step that hangs, such as a network call.
- If the process ran out of memory or was stopped by another program, free resources and try again.

# error.runProcessStartFailed

Could not start the Python interpreter '%s': %s

# actions.runProcessStartFailed

- Verify Python 3.11 is installed and on your PATH.
- Reinstall the SDK with 'pip install salesforce-data-customcode' so 'datacustomcode' is importable.

# flags.entrypoint.summary

Entrypoint file for the package to run.

# flags.entrypoint.description

The path to the entrypoint file of your initialized Data Cloud custom code package.

# flags.targetOrg.summary

Target Salesforce org to run against.

# flags.targetOrg.description

The alias or username of the Salesforce org where you want to run the Data Cloud custom code package. The org must have Data Cloud enabled and appropriate permissions.

# flags.targetOrg.summary.function

Target Salesforce org to run against.

# flags.targetOrg.description.function

Optional. The alias or username of the Salesforce org where you want to run the Data Cloud code extension package. The org must have Data Cloud enabled and appropriate permissions.

# flags.testWith.summary

Path to test.json file to test Data Code Extension function

# flags.testWith.description

Path to a JSON file that provides input request for the function.

# flags.configFile.summary

Path to a config file.

# flags.configFile.description

Optional path to a JSON config file that provides input payload for the run. Defaults to the package's payload/config.json if not specified.

# flags.dependencies.summary

Modules to import before the run.

# flags.dependencies.description

Optional comma-separated list of Python modules (or module.attribute) to import before the entrypoint runs. Use import names, such as 'yaml' rather than 'pyyaml'. Nothing is installed: each module must already be installed in the active Python environment.
