# CI execution and spending policy

Owner ruling: 2026-09-08. Repository: `aibraincoach/calgary-permit-mailer`.

## Mandatory policy

- GitHub Actions is disabled at repository level. Do not enable, dispatch, rerun,
  add, or restore Actions workflows, including self-hosted runners. Old branches
  and previously active registrations are covered by the same prohibition.
- Required CI runs on the existing Vercel or Cloudflare provider only. No local
  or other-machine fallback is authorized for this migration.
- No additional spending, subscriptions, upgrades, paid runners, paid reviews,
  or paid testing services. Verify account allowances and enforcement before
  starting builds; an alert or presumed free tier is not a cost boundary.
- Preserve required checks. Lint and tests must execute explicitly; a successful
  deployment does not establish that they ran. A skipped check is not a pass.
- Tie verification to the exact commit and matching preview. Keep production
  data out of CI; database tests require isolated disposable resources.
- Batch changes and suppress verified documentation-only builds. Do not exclude
  Markdown or other files that contribute to the deployed product.
- Keep a release blocked if required provider checks or zero-additional-spend
  operation cannot be verified. Do not re-enable Actions to bypass the blocker.
- This ruling supersedes contrary historical CI/spending instructions. Preserve
  incident history and unrelated product/review requirements.

## Audit result

Audited default-branch source: `093e0b53cccaa83825ba2c1ea69b28152049e266`. Actions permission API was read back as
`enabled: false` on 2026-09-08. Default-branch files, registered workflows,
retained run history and relevant historical/PR variants were inspected; dormant
branches were not exhaustively scanned. Repository-level disabling covers them.

No Actions workflow on main, registered workflow, or retained workflow run was found. This is a preventive policy, not a claim that this repository caused the quota incident.

September run snapshot: **0** runs created September 1–8 UTC. Retained run
history can omit deleted runs. Exact GitHub billing, remaining allowance and
invoice charges could not be verified with the current credential.

Provider: Vercel project `calgary-permit-mailer`, confirmed by the project API.

Status: **No active Actions migration required**.

## Documentation build suppression

The Vercel project ignore command now skips commits explicitly tagged
`[skip ci]`, then preserves its prior ignore behavior for other commits. Use
that marker only for reviewed documentation-only commits. No application
build or test was run to publish this policy. Repository configuration may
override dashboard settings; verify the result before relying on a skip.

## Change and review discipline

Use a dedicated isolated checkout/worktree and a separate scoped PR for this
owner-authorized cross-repository migration. Do not edit an active coder's branch,
stash, reset, force-push, or incorporate their uncommitted work. Reconcile current
main before merge. The owner explicitly authorized merging this migration into
main; this exception does not grant authority over other open PRs.

## References

- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [Vercel deployment checks](https://vercel.com/docs/deployment-checks)
- [Vercel build pricing](https://vercel.com/docs/builds)
- [Cloudflare Workers build configuration](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)
- [Cloudflare build limits and pricing](https://developers.cloudflare.com/workers/ci-cd/builds/limits-and-pricing/)
