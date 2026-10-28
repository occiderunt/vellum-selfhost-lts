# Changelog

All notable changes to this fork. This project is a self-hosted LTS of the
Vellum assistant runtime, maintained after the hosted platform was retired.

## Versioning policy

Releases are tagged `v0.12.6-lts.N` and the root `package.json` carries the
same string. The **per-package versions are left at their upstream values on
purpose**: keeping `assistant/package.json` at `0.12.6` means a `git diff`
against upstream stays readable, and it is obvious which packages have been
touched by this fork and which have not. The root version is the release
identity; the workspace member versions are provenance.

## Updating

1. `git pull`
2. `bun install`
3. `bun run check`
4. Restart the runtime.

`bun install` must be run after every pull: the lockfile is the contract, and
`bun ci`/`--frozen-lockfile` is used in CI.

## [0.12.6-lts.1] - 2026-10-28

Baseline for the self-hosted LTS. Upstream code is unchanged; everything below
is fork-specific hardening. Baseline upstream commit: `276d2f1547`.

### Security

- **Auto-update no longer trusts a feed the operator does not control.**
  `resolveUpdateFeedUrl` previously resolved every build to
  `https://storage.googleapis.com/vellum-ai-<env>-releases/...`, Vellum's own
  release bucket. The feed is now opt-in via `VELLUM_UPDATE_FEED_URL`; when it
  is unset the resolver returns an empty string, `installAutoUpdate` returns
  before calling `setFeedURL`, and `checkForUpdates` is a no-op. No network
  request is made.
- **The packaged app no longer bakes that feed into `app-update.yml`.**
  `clients/macos/electron-builder.config.cjs` derives `publish.url` from
  `VELLUM_UPDATE_FEED_URL` and falls back to an unresolvable placeholder, so an
  unconfigured build fails closed.

### Changed

- Removed 53 of 56 GitHub Actions workflows that depended on Vellum
  infrastructure (their GitHub App key, `NPM_TOKEN`, release branches, Linear
  sync, Slack announcements, App Store Connect). 11,911 lines of dead CI.
  Kept `ci-main-assistant`, `ci-main-gateway`, and `stale`.
- Replaced the `ubuntu-latest-8-cores` custom runner label with
  `ubuntu-latest` in the surviving workflows.
- Gated the build-alert composite action on `SLACK_WEBHOOK_URL`, so it skips
  instead of failing when no webhook is configured.
- Removed the tracked `assistant-tests.log`. It captured 8 failing
  `managed-fallback-dispatch` tests on a contributor's machine at one moment
  and was never regenerated, so it read as a current red signal when it was
  only a point-in-time artifact. Local `*-tests.log` is now ignored. This is
  not a claim that the suite is green; see Known gaps.
- Added root scripts (`typecheck`, `test`, `lint`, `check`, plus
  `gateway:*`/`cli:*`) so a maintainer does not have to remember which of 29
  workspaces to `cd` into.

### Added

- `.github/dependabot.yml`: weekly `bun` updates against the root lockfile,
  grouped into patch and minor; major bumps excluded from version updates but
  still surfaced as Dependabot alerts. GitHub Actions tracked separately.
- Tags `0.12.6-upstream` (last upstream Vellum commit, `276d2f1547`) and
  `0.12.6-lts` (fork baseline) as immutable reference points.

### Known gaps

- **21 of 2,650 test files fail.** Measured 2026-10-28 on a full run:
  2,629 files pass, 21 fail. The failing set is entirely the credential,
  secret, and environment layer (`secure-keys`, `credential-broker*`,
  `script-proxy-certs`, `shell-credential-ref`, `slack`/`discord`/`telegram`
  channel config, `provider-key-env-fallback`, ACP auth). Nothing in that set
  touches the updater, CI, or build config changed by this fork, and several
  of them read a real credential store instead of the harness's isolated one,
  so they appear to have been red upstream as well. Confirm before treating CI
  as meaningful.
- **Typecheck requires the workspace's own toolchain.** `typescript@5.9.3` is
  a dev dependency of each workspace member, so run `bun run typecheck` from
  the repo root (which delegates) rather than expecting a global `tsc`.
- **`patches/` is pinned to exact dependency versions.** Five bun patches,
  including `app-builder-lib@26.8.1`. A dependency bump that crosses a patched
  version breaks the build until the patch is rebased; do both in the same PR.
- **`socket.yml` is inert without the Socket.dev GitHub App installed.** Either
  install it or delete the file rather than keeping false assurance.
- **Platform coupling remains.** Nine non-test references to
  `platform.vellum.ai` in `assistant/src`, plus `managed` OAuth modes for
  Google and Notion and email sending billed through Vellum. These degrade or
  break independently of this repo.
