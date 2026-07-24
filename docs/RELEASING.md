# Releasing Ducky

Ducky releases are built and published by
[`release.yml`](../.github/workflows/release.yml). A stable version tag is the
only release trigger; installers must not be uploaded manually.

## Release checklist

1. Start from an up-to-date `main` branch and choose a semantic version such as
   `1.0.1`.
2. Update both `package.json` and `package-lock.json` to that version:

   ```bash
   npm version 1.0.1 --no-git-tag-version
   ```

3. Complete the release changes and push them to `main`:

   ```bash
   git add .
   git commit -m "release: Ducky v1.0.1"
   git push origin main
   ```

4. Tag that exact commit and push the tag:

   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```

Replace `1.0.1` with `X.Y.Z` throughout. The tag must use the exact stable
`vX.Y.Z` form and must match the version in `package.json`. The workflow fails
before packaging if either condition is not met, if `package-lock.json` has a
different root version, or if the tagged commit is not contained in `main`.

Do not create a GitHub Release or upload files by hand. Follow the run under the
repository's **Actions → Release** page. Once every job succeeds, the finished
release appears under **Releases**.

## What the pipeline does

The tag-triggered run has three stages:

1. **Validate** checks the tag/package version match, installs from
   `package-lock.json` with `npm ci`, and runs the test suite.
2. **Build** runs a fail-independent matrix on `macos-latest`,
   `windows-latest`, and `ubuntu-latest`. Each runner type-checks and builds the
   application, packages only its native platform, verifies the expected files
   and their update-manifest references, and stages them as short-lived
   workflow artifacts.
3. **Publish** runs only when all matrix jobs pass. It downloads all verified
   files, creates `SHA256SUMS.txt`, uploads everything to a draft GitHub
   Release, and publishes that release only after the upload succeeds.

If one platform fails, the other matrix jobs are allowed to finish for useful
diagnostics, but the publish job is skipped. A failed new upload remains a
draft instead of exposing a partially populated release. Re-running a failed
tag workflow resumes that draft, clears its previous draft assets, and uploads
the newly verified set. The workflow refuses to replace assets after a release
has been published.

The workflow uses separate, platform-scoped caches for:

- npm's dependency download cache, keyed by `package-lock.json`;
- Electron binary downloads;
- Electron Builder tool downloads.

## Published files

| Platform | Runner | Architecture | Release files |
| --- | --- | --- | --- |
| macOS | `macos-latest` | Universal (`arm64` + `x64`) | DMG, ZIP, both blockmaps, `latest-mac.yml` |
| Windows | `windows-latest` | `x64` | NSIS Setup EXE, EXE blockmap, MSI, `latest.yml` |
| Linux | `ubuntu-latest` | `x64` | AppImage, DEB, `latest-linux.yml` |

Windows Portable is not generated because it is not an existing target in
`electron-builder.yml`. MSI is generated because the existing configuration
already supports it.

The `latest-mac.yml`, `latest.yml`, `latest-linux.yml`, ZIP, NSIS installer, and
blockmaps are uploaded without modification so Electron's auto-update metadata
continues to point at the exact published assets. The verifier rejects metadata
that has the wrong version, lacks SHA-512 hashes, names a missing file, or uses
the wrong primary updater target.

The Linux job installs `libopenjp2-tools`, the system package Electron Builder
requires when creating distributable Linux formats. GitHub selects the Latest
release automatically by version and date; the workflow does not force an older
tag to become Latest when tags are processed out of order.

## Credentials and repository settings

No manually configured GitHub Secret is required for the current pipeline.
GitHub creates the short-lived `GITHUB_TOKEN` automatically for each run. Only
the publish job receives `contents: write`; validation and builds remain
read-only. No personal access token is stored or used.

If an organization policy prevents write access, a repository administrator
must allow GitHub Actions to create releases under **Settings → Actions →
General → Workflow permissions**. Do not add a personal token unless repository
policy makes the built-in token unusable.

The existing Electron Builder configuration intentionally produces unsigned
macOS and Windows packages (`mac.identity: null` and
`win.signExecutable: false`). This automation preserves that behavior, so no
certificate or notarization secrets are currently required. Signing and Apple
notarization are a separate security change: they require real credentials and
corresponding Electron Builder configuration before any secrets should be
added under **Settings → Secrets and variables → Actions**.

## Local verification

Normal development builds continue to work:

```bash
npm run dist:mac
npm run release:verify -- macos
```

Use `windows` or `linux` for the verifier on those platforms. Cross-platform
release packages must be produced by their matching GitHub-hosted runner; the
release workflow does not attempt unsupported cross-compilation.
