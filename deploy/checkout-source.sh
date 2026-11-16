#!/usr/bin/env bash
# Private source read only: no source code executes until this function returns and key is unloaded.
set -euo pipefail
[ "$GITHUB_REPOSITORY" = "Open-Tamin/.github" ] && [ "$GITHUB_REF" = "refs/heads/main" ] || { echo "::error::Non-owner ref denied"; exit 1; }
[ -n "${SOURCE_DEPLOY_KEY:-}" ] || { echo "::error::Missing protected read-only source key"; exit 1; }
[ -f deploy/github-known-hosts ] || { echo "::error::Missing pinned GitHub host identity"; exit 1; }
mkdir -p "$HOME/.ssh"
chmod 700 "$HOME/.ssh"
cp deploy/github-known-hosts "$HOME/.ssh/known_hosts"
chmod 600 "$HOME/.ssh/known_hosts"
export GIT_SSH_COMMAND="ssh -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$HOME/.ssh/known_hosts"
eval "$(ssh-agent -s)" >/dev/null
trap 'ssh-add -D >/dev/null 2>&1 || :; ssh-agent -k >/dev/null 2>&1 || :' EXIT
printf '%s\n' "$SOURCE_DEPLOY_KEY" | ssh-add -q -
git clone --depth 4 --branch main git@github.com:Open-Tamin/platform.git source
sha="$(git -C source rev-parse HEAD)"
[ "$(git -C source remote get-url origin)" = "git@github.com:Open-Tamin/platform.git" ] || { echo "::error::Source ownership changed"; exit 1; }
read -r -a parents <<< "$(git -C source rev-list --parents -n 1 HEAD)"
[ "${#parents[@]}" -eq 3 ] || { echo "::error::Source HEAD is not a reviewed PR merge commit"; exit 1; }
case "$(git -C source log -1 --format=%s)" in
  "Merge pull request #"*) ;;
  *) echo "::error::Source HEAD has no PR merge provenance"; exit 1;;
esac
if [ -n "${TESTED_SHA:-}" ] && [ "$sha" != "$TESTED_SHA" ]; then
  echo "::error::Source main moved after the sealed build"; exit 1
fi
echo "sha=$sha" >> "$GITHUB_OUTPUT"
