# Security scan

`.github/workflows/security-scan.yml` runs these scanners and builds one report:

| Check | Tool |
| --- | --- |
| Secrets in the full git history | gitleaks (`gitleaks.toml`) |
| Vulnerable dependencies | npm audit, OSV-Scanner |
| Electron configuration (Electron apps only) | Electronegativity |
| Code patterns | Semgrep (`p/javascript`, `p/react`, `p/secrets` + `semgrep-rules.yml`), ESLint security plugins (`eslint.config.mjs`) |

## Running it

- **On demand:** Actions tab → *Security scan* → *Run workflow*, and pick the branch.
- **Automatically:** every Monday at 06:00 UTC, on the branch set in `SCAN_BRANCH` in the workflow.

GitHub only shows the *Run workflow* button, and only runs the schedule, once the workflow file is on the repository's **default branch**.

Findings never fail the workflow. A failed run means a scanner or the report step broke.

## Reading the report

- The report appears on the run's **Summary** page.
- The `security-report-<branch>` artifact holds `report.md`, `summary.json`, `findings.json` and the raw scanner outputs. Secret values are redacted, and source code is stripped from the raw outputs.
- Each run compares itself with the last successful run on the same branch. The report shows the change in each count and lists new and resolved findings.

## Tuning

- Known false positives from gitleaks go in the `[allowlist]` in `gitleaks.toml`.
- New project-specific patterns go in `semgrep-rules.yml`.
- Tool versions are pinned at the top of the workflow. Bump them deliberately: a new version can change the counts without any code change.
