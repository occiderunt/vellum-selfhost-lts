#!/usr/bin/env bash
#
# release.sh — Cut a release.
#
# Bumps the root package.json version, commits it, tags it, and pushes. The
# push of the tag is what publishes the GitHub Release: .github/workflows/
# release.yml turns the tag into a release using the notes from CHANGELOG.md.
#
# Usage:
#   ./scripts/release.sh 0.12.6-lts.2
#   ./scripts/release.sh 0.12.6-lts.2 --skip-checks
#
# Requires: a CHANGELOG.md section headed "## [<version>]" for the version
# being cut, so a release never publishes with empty notes.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

VERSION=""
SKIP_CHECKS=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-checks)
      SKIP_CHECKS=true
      shift
      ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    -*)
      echo "ERROR: unknown option: $1" >&2
      exit 1
      ;;
    *)
      if [[ -n "$VERSION" ]]; then
        echo "ERROR: unexpected extra argument: $1" >&2
        exit 1
      fi
      VERSION="$1"
      shift
      ;;
  esac
done

if [[ -z "$VERSION" ]]; then
  echo "ERROR: version required (e.g. 0.12.6-lts.2)" >&2
  exit 1
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+(-lts\.[0-9]+)?$ ]]; then
  echo "ERROR: version '$VERSION' is not <major>.<minor>.<patch>-lts.<n>" >&2
  exit 1
fi

cd "$REPO_ROOT"

fail() { echo "ERROR: $*" >&2; exit 1; }

# ---------------------------------------------------------------------------
# Preconditions
# ---------------------------------------------------------------------------

[[ -d .git ]] || fail "not a git repository: $REPO_ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean:" >&2
  git status --short >&2
  fail "commit or stash first"
fi

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" == "main" ]] || fail "releases are cut from main, currently on '$BRANCH'"

if git rev-parse -q --verify "refs/tags/$VERSION" >/dev/null; then
  fail "tag $VERSION already exists"
fi

if ! grep -q "^## \[$VERSION\]" CHANGELOG.md; then
  fail "CHANGELOG.md has no '## [$VERSION]' section — write the notes first"
fi

if git remote get-url origin >/dev/null 2>&1; then
  echo "==> Fetching origin"
  git fetch --tags origin
  if ! git merge-base --is-ancestor origin/main HEAD; then
    fail "main is behind origin/main — pull first"
  fi
fi

# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------

if [[ "$SKIP_CHECKS" == false ]]; then
  echo "==> Typechecking"
  bun run typecheck
else
  echo "==> Skipping typecheck (--skip-checks)"
fi

# ---------------------------------------------------------------------------
# Bump, commit, tag
# ---------------------------------------------------------------------------

CURRENT="$(bun --print 'require("./package.json").version')"
if [[ "$CURRENT" == "$VERSION" ]]; then
  echo "==> Root version already $VERSION"
else
  echo "==> Bumping root version: $CURRENT -> $VERSION"
  bun --print "const p=require('./package.json'); p.version='$VERSION'; console.log(JSON.stringify(p,null,2))" \
    > package.json.tmp
  mv package.json.tmp package.json
fi

git add package.json
git commit -m "chore(release): $VERSION"

git tag -a "$VERSION" -m "$VERSION"

# ---------------------------------------------------------------------------
# Push — the tag push publishes the release
# ---------------------------------------------------------------------------

echo "==> Pushing main"
git push origin main

echo "==> Pushing tag $VERSION"
git push origin "$VERSION"

echo
echo "Release $VERSION triggered."
echo "Watch it at: $(git remote get-url origin | sed -e 's#^git@github.com:#https://github.com/#' -e 's#\.git$##')/actions/workflows/release.yml"
