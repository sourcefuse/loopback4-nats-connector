# Releasing

Releases after `0.0.1` are created only by manually running the
**Release [Manual]** workflow from the `main` branch. The workflow verifies the
build, tests, lint checks, and package contents before semantic-release
determines the next version from the conventional commit history and publishes
it to npm.

## First publish

Publish version `0.0.1` locally using an npm account with 2FA, then tag that
exact commit so semantic-release knows where the published history starts:

```sh
npm login
npm test
npm run package:check
npm publish # complete the 2FA prompt
git tag v0.0.1
git push origin v0.0.1
```

After the first publish, configure `sourcefuse/loopback4-nats-connector` as the
package's trusted publisher on npm. Use `release.yaml` as the workflow filename
and allow direct publishing. Future releases authenticate with short-lived OIDC
credentials and do not need an npm token.

## GitHub credentials

The workflow uses `RELEASE_COMMIT_GH_PAT` when it is configured; otherwise it
uses the repository's `GITHUB_TOKEN`. The optional `RELEASE_COMMIT_USERNAME`
and `RELEASE_COMMIT_EMAIL` repository variables control the release commit
author.
