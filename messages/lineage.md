# summary

Generate field-level dataLineage for a Data Code Extension %s package.

# description

Runs the package's entrypoint against a Salesforce org with every write intercepted, traces each written field back to the fields it was computed from, and replaces the dataLineage section of the package's config.json with the result. Nothing is written to Data Cloud. Run 'scan' first so the read and write permissions in config.json are current. Fields whose lineage can't be traced are listed and get no lineage unless you add entries by hand.

Generated lineage is a best-effort analysis of your script and may be incomplete or wrong (for example, for UDFs or other code the tool can't see into). It determines how governance tags propagate, which can restrict or open access to data. You're responsible for reviewing and maintaining it. Before config.json is written, you must accept this, either at the prompt or with --accept-lineage-ownership.

# examples.script

- Generate lineage for a script package against the org with alias "myorg":

  <%= config.bin %> data-code-extension script lineage generate --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg

- Preview the generated lineage without changing config.json:

  <%= config.bin %> data-code-extension script lineage generate --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg --dry-run

- Accept ownership of the generated lineage and replace existing lineage without prompting, keeping the full result for review:

  <%= config.bin %> data-code-extension script lineage generate --entrypoint ./my-script-package/payload/entrypoint.py --target-org myorg --accept-lineage-ownership --no-prompt --output-file ./lineage-result.json

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

# info.generating

Running package to trace lineage. Nothing is written to Data Cloud...

# info.summary

Generated %s dataLineage entries with %s (target, source) field pairs: +%s added, -%s removed, ~%s changed.

# info.noSources

%s target fields are computed from no source field (for example, literals) and get no lineage:
%s

# info.outputWritten

Wrote the full lineage result to '%s'.

# info.dryRunNotice

DRY RUN: config.json was not modified. Remove --dry-run to apply the generated lineage.

# info.unchanged

dataLineage in '%s' is already up to date.

# info.written

Updated dataLineage in '%s'.

# info.notWritten

Generated lineage was not accepted; config.json was not modified.

# info.complete

Lineage generation completed successfully!

# warning.unresolved

%s target fields could not be traced and get no lineage unless you add entries by hand:
%s

# warning.udf

%s target fields are computed by user-defined functions (UDFs). Their lineage lists only the fields passed to the UDF; the tool can't see what else the UDF reads (for example, a lookup table, a broadcast variable, or a file). Review these fields and add any missing source fields by hand:
%s

# warning.permissionGaps

The generated lineage references objects that aren't in config.json permissions, so deploy would fail (1041/1042). Run 'data-code-extension script scan' first, then generate lineage again.
%s

# warning.emptyResult

No lineage could be generated, so config.json was not modified. The package follows the no-lineage path unless you add dataLineage entries by hand.

# warning.replace

This replaces the existing dataLineage section. Any entries you added or edited by hand will be lost. Lineage determines how governance tags propagate to the target; review the result before deploying.

# prompt.replace

Replace the existing dataLineage in config.json?

# warning.ownership

Generated lineage is a best-effort analysis of your script and may be incomplete or wrong (for example, for UDFs or other code the tool can't see into). It determines how governance tags propagate, which can restrict or open access to data. You're responsible for reviewing and maintaining it.

# prompt.acceptOwnership

Accept and write dataLineage to config.json?

# prompt.acceptOwnershipReplace

Accept and replace the existing dataLineage in config.json?

# error.functionPackage

Lineage can only be generated for script packages; '%s' is a function package.

# error.outputFileCollision

--output-file '%s' is inside the package's payload or project metadata, or is one of its config files. Choose a path outside the package's payload directory.

# error.lineageChanged

dataLineage in '%s' changed while waiting for confirmation, so it was not replaced.

# actions.lineageChanged

- Re-run the command to compare the generated lineage against the current dataLineage.

# error.ownershipNotAccepted

Writing generated lineage to config.json requires accepting ownership of it.

# actions.ownershipNotAccepted

- Review the generated lineage, then re-run with --accept-lineage-ownership to accept responsibility for it and write it to config.json.
- Re-run with --dry-run to preview the generated lineage without changing config.json.

# error.replaceNotConfirmed

config.json already has a different dataLineage section, and replacing it needs confirmation.

# actions.replaceNotConfirmed

- Re-run with --no-prompt to replace the existing dataLineage.
- Re-run with --dry-run to preview the generated lineage without changing config.json.

# error.sdkTooOld

The installed salesforce-data-customcode package doesn't support lineage generation.

# actions.sdkTooOld

- Upgrade the SDK with 'pip install -U salesforce-data-customcode', then try again.

# error.resultMissing

The lineage run finished but produced no result: %s

# actions.resultMissing

- Review the output above for errors from the entrypoint.
- Upgrade the SDK with 'pip install -U salesforce-data-customcode', then try again.

# flags.entrypoint.summary

Entrypoint file for the package to generate lineage for.

# flags.entrypoint.description

The path to the entrypoint file of your initialized Data Cloud custom code script package. The package's config.json, in the same directory, is updated with the generated lineage.

# flags.targetOrg.summary

Target Salesforce org to read data from.

# flags.targetOrg.description

The alias or username of the Salesforce org whose data the package reads while lineage is traced. The org must have Data Cloud enabled and appropriate permissions. Nothing is written to the org.

# flags.configFile.summary

Path to an SDK config file.

# flags.configFile.description

Optional path to an SDK config.yaml that overrides the reader and writer configuration for the run, for example the reader's default_row_limit (1000 rows by default).

# flags.dependencies.summary

Dependencies override for the run.

# flags.dependencies.description

Optional comma-separated list of Python package dependencies to use during the run, overriding those defined in the package's requirements.txt.

# flags.dryRun.summary

Print the generated lineage without modifying config.json.

# flags.dryRun.description

When set, generates and prints the lineage but doesn't modify config.json and never prompts.

# flags.outputFile.summary

Also write the full lineage result to this JSON file.

# flags.outputFile.description

Writes the full result, including unresolved fields, targets, sources, and the pair count, to the given path. Useful for review or CI.

# flags.noPrompt.summary

Replace existing dataLineage without prompting.

# flags.noPrompt.description

Skips the confirmation before replacing a dataLineage section that differs from the generated one. Required to replace existing lineage when running non-interactively or with --json. Doesn't accept ownership of the generated lineage; use --accept-lineage-ownership for that.

# flags.acceptLineageOwnership.summary

Accept responsibility for the generated lineage without prompting.

# flags.acceptLineageOwnership.description

Confirms that you understand the generated lineage is best-effort and may be incomplete or wrong, that it determines how governance tags propagate, and that you're responsible for reviewing and maintaining it. Skips the ownership prompt. Required to write lineage when running non-interactively or with --json.
