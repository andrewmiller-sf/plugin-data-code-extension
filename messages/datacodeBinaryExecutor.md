# error.initTemplateNotFound

Could not locate the datacustomcode init template at '%s'.

# actions.initTemplateNotFound

- Verify the salesforce-data-customcode Python package is installed and up to date
- Run 'pip show salesforce-data-customcode' to confirm the install location
- Reinstall with 'pip install --upgrade salesforce-data-customcode' if the templates directory is missing

# error.scanEntrypointMissing

Entrypoint file not found at '%s'.

# actions.scanEntrypointMissing

- Verify the entrypoint path is correct
- Run 'init' first if the package has not been initialized
- Use the default entrypoint path: payload/entrypoint.py

# error.scanConfigChanged

'%s' changed while waiting for confirmation, so the scan results were not written.

# actions.scanConfigChanged

- Re-run the scan so it starts from the current config.json.

# error.zipExecutionFailed

Failed to create archive for package at '%s': %s

# actions.zipExecutionFailed

- Verify the datacustomcode binary is properly installed
- Check that the package directory is valid
- Run 'datacustomcode version' to verify the binary works
- Check the error message for specific issues

# error.deployAuthenticationFailed

Failed to authenticate with Salesforce org '%s'

# actions.deployAuthenticationFailed

- Verify the target org username/alias is correct
- Re-authenticate with 'sf org login web' or 'sf org login sfdx-url'
- Check that the org has the necessary permissions
- Ensure the org has Data Cloud enabled

# error.deployExecutionFailed

Failed to deploy package '%s': %s

# actions.deployExecutionFailed

- Verify all required flags are provided correctly
- Check the datacustomcode binary is properly installed
- Review the error message for specific issues
- Ensure the package is properly initialized and zipped
- Check the UI. The failure may have occurred when polling status

# error.runAuthenticationFailed

Failed to authenticate with Salesforce org '%s'

# actions.runAuthenticationFailed

- Verify the target org username/alias is correct
- Re-authenticate with 'sf org login web' or 'sf org login sfdx-url'
- Check that the org has the necessary permissions
- Ensure the org has Data Cloud enabled

# error.runExecutionFailed

Script execution failed:
%s

# actions.runExecutionFailed

- Verify all required flags are provided correctly
- Check the datacustomcode binary is properly installed
- Review the error message for specific issues
- Ensure the package is properly initialized
