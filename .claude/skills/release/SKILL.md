---
name: release
description: Create a release PR from a staging branch into main. Never touches the current branch or local working tree changes.
version: 0.5.0
model: sonnet
---

# release

Create a release Pull Request from a staging branch into `main`, with the version bump included in the PR diff.

**The user's current branch and local working tree are never touched.**
All git introspection runs against remote refs. The version-bump commit is staged inside a temporary detached worktree, then pushed to the source branch on the remote.

## Purpose

Automates the release PR workflow:

1. Identify the source (staging) branch and confirm it exists on the remote.
2. Detect all changes between the staging branch and `main` on the remote.
3. Scan for breaking changes and surface them prominently.
4. Stage the version bump on the source branch (via a temporary worktree, so the user's working tree is not touched) so the bump ships as part of the release PR diff.
5. Create or update a PR from staging → `main` with a structured release description.

Pushing the bump commit to the source branch is the only write the skill performs against the remote. After merge, the user runs `npm run publish:only` from `main` to publish to npm — the skill never publishes.

**Idempotency.** The target version is derived from `origin/main`'s `package.json` and the chosen bump level — it does **not** depend on whatever is currently on the source branch. So repeated `/release` calls with the same source branch and bump level produce the same target version and the same single bump commit on top of `main`. If the user changes the bump level on a later call, the prior bump commit on the source branch is replaced (force-push-with-lease), not appended to.

## Instructions

### Step 1: Determine Source Branch

- **Source branch** — a branch name passed as an argument (e.g. `/release staging`). If no argument is given, ask the user which branch to release.
- **Target branch** — always `main`.

Do **not** use the current local branch as the source. Do **not** check out or switch to any branch.

Confirm the source branch exists on the remote:

```bash
git ls-remote --heads origin <source-branch>
```

If it does not exist, stop and tell the user.

If source branch equals `main`, stop and tell the user to specify a different branch.

### Step 2: Validate Remote Branch State

Do **not** modify the working tree or index. All checks run against the remote refs fetched below.

```bash
git fetch origin main <source-branch>
```

Then run these checks in parallel:

1. **Up to date** — confirm `origin/<source-branch>` and the local tracking ref (if any) agree. If the remote is ahead of local, note it but do not pull.
2. **No conflicts** — verify the source branch can be merged into `main` without conflicts:
   ```bash
   git merge-tree origin/main origin/<source-branch>
   ```
   If conflicts are found, list the conflicting files and stop.

### Step 3: Collect All Changes

Collect diffs and commits between `origin/main` and `origin/<source-branch>` — never against local HEAD:

```bash
git log --oneline origin/main..origin/<source-branch>
git diff origin/main...origin/<source-branch>
```

Read every commit and every changed file. Build a complete picture of what this release contains before writing the PR description.

### Step 4: Detect Breaking Changes

Scan the diff carefully for:

- Removed or renamed public exports, functions, classes, or types
- Changed method signatures (parameter names/types/order, return types)
- Removed or renamed configuration keys or environment variables
- Changed default values that callers depend on
- Changed behavior that existing callers rely on (error types, event names, response shapes, HTTP status codes)
- Major version bumps in dependencies that themselves carry breaking changes
- Database schema changes that require migration (dropped columns, renamed tables, non-null constraints added)

Note every breaking change found, including the migration path for each.

### Step 5: Determine Target Version

The target version is computed from `main`'s version, **not** from the source branch's version. This makes repeated `/release` calls idempotent: as long as `main`'s version and the chosen bump level are the same, the target version is the same.

Read the current version from the **target** branch (`main`):

```bash
git show origin/main:package.json | grep '"version"'
```

Pick the bump level from the changes:

- **Major** — any breaking changes detected.
- **Minor** — new features, new exports, or new capabilities; no breaking changes.
- **Patch** — bug fixes, documentation, refactoring, dependency updates only.

Compute the **target version** by applying that bump level to `main`'s version using semver rules:

- `major` — `X.Y.Z` → `(X+1).0.0`
- `minor` — `X.Y.Z` → `X.(Y+1).0`
- `patch` — `X.Y.Z` → `X.Y.(Z+1)`

Report to the user:

- `main`'s current version.
- Recommended bump level and justification.
- Computed target version.

Ask the user to confirm the bump level before continuing. The user may override (e.g. you suggested `patch`, they want `minor`) — recompute the target version from `main`'s version using the override.

**Do not** apply the bump to the source branch's current version. If a previous `/release` run already pushed a bump commit, the source branch's version may be ahead of `main` — ignore it for target-version computation. The next step (Step 6) will reconcile the source branch to the target.

### Step 6: Stage Version Bump on Source Branch

The goal of this step is: the source branch's `package.json` version equals the computed target version, with a single bump commit on top of `main`. This is enforced idempotently — running Step 6 twice with the same target produces the same source-branch state.

Read the source branch's current version:

```bash
git show origin/<source-branch>:package.json | grep '"version"'
```

Decide what to do based on three cases:

**Case A — source.version === target.version.**
The bump is already staged correctly. Skip the rest of Step 6.

**Case B — source.version !== target.version, no prior bump commit at source HEAD.**
Apply the target version as a new commit on the source branch (fast-forward push).

**Case C — source.version !== target.version, prior bump commit at source HEAD.**
A previous `/release` call pushed a bump commit with a different target (e.g. user changed bump level). Replace that commit so the PR diff stays a single, clean bump commit. This requires a force-push-with-lease.

#### Detecting a prior bump commit

Inspect the tip commit of `origin/<source-branch>`. It qualifies as a prior bump commit if **both**:

1. The commit message matches the pattern `chore: bump version to <semver>`.
2. The diff against its parent only touches `package.json` and (if present) `package-lock.json`, and the only change is the `version` field.

```bash
PREV_SHA=$(git rev-parse origin/<source-branch>)
PREV_MSG=$(git log -1 --format=%s "$PREV_SHA")
PREV_FILES=$(git diff-tree --no-commit-id --name-only -r "$PREV_SHA")
```

If `PREV_MSG` starts with `chore: bump version to ` and `PREV_FILES` ⊆ `{package.json, package-lock.json}`, it's a prior bump commit.

#### Apply the change

Use a detached worktree so the user's working tree and any local checkout of the source branch are untouched:

```bash
WORKTREE=$(mktemp -d -t release-XXXXXX)
git worktree add --detach "$WORKTREE" "origin/<source-branch>"
```

In Case C, drop the prior bump commit first by resetting the detached HEAD to its parent:

```bash
(cd "$WORKTREE" && git reset --hard HEAD~1)
```

Then set `package.json` to the **exact** target version (not a relative bump). Prefer the project's explicit-version primitive:

```bash
(cd "$WORKTREE" && npm version <target-version> --no-git-tag-version --allow-same-version)
```

If `package-lock.json` exists, `npm version` updates it automatically. If the project has no `npm` available or `package.json` lacks a usable version primitive, edit `package.json` (and `package-lock.json` if present) directly to set `"version": "<target-version>"`.

**Never** invoke `npm run bump:<level>`, `npm version <level>`, or `npm run deploy*` here — those bump relatively (breaking idempotency) or publish (which is the user's call).

Commit:

```bash
(cd "$WORKTREE" \
  && git add package.json package-lock.json \
  && git commit -m "chore: bump version to <target-version>")
```

Push:

- **Case B (fast-forward):**
  ```bash
  (cd "$WORKTREE" && git push origin "HEAD:refs/heads/<source-branch>")
  ```
- **Case C (replace prior bump commit):**
  ```bash
  (cd "$WORKTREE" && git push --force-with-lease="<source-branch>:$PREV_SHA" \
    origin "HEAD:refs/heads/<source-branch>")
  ```
  `--force-with-lease` ensures the push only succeeds if `origin/<source-branch>` still points at the prior bump commit you intended to replace. If anyone pushed to the source branch in between, the push is rejected — stop and report the conflict to the user.

Clean up the worktree:

```bash
git worktree remove "$WORKTREE"
```

Refresh the remote ref:

```bash
git fetch origin <source-branch>
```

If any push is rejected for reasons other than the expected lease check (e.g. branch protection rules block the force-push), stop and report — never escalate to plain `--force`.

### Step 7: Create or Update the Release PR

Check whether a PR from the source branch into `main` already exists:

```bash
gh pr list --head <source-branch> --base main --json number,url,state
```

**If no PR exists** — create one with `gh pr create --base main --head <source-branch>`.
**If a PR exists** — update its title and body via `gh pr edit <number> --title "..." --body "..."`.

#### PR Title

Format: `release: <source-branch> → main` (e.g. `release: staging → main`).

If the branch name is a version (e.g. `release/1.2.0`), use: `release: v1.2.0`.

#### PR Description

Build the description in this order:

---

**If any breaking changes were found**, open with:

```markdown
## ⚠️ Breaking Changes

- <change 1> — <migration path>
- <change 2> — <migration path>
```

---

Then always include:

```markdown
## Summary

<2–4 sentences: what this release does and why it's going out now>

## What's Included

<Grouped list of changes by type. Each bullet is one logical change, not one commit. Synthesize; don't dump git log.>

### Features
- ...

### Fixes
- ...

### Internal / Refactoring
- ...

### Dependencies
- ...

### Documentation
- ...

(Omit sections that have no entries.)

## Release Notes

User-facing changelog entry for this release. Written for consumers of the package/service, not for internal reviewers. Rules:

- Use plain language — no internal jargon, no PR numbers, no commit hashes.
- Lead with what changed from the user's perspective, not how it was implemented.
- Group under **Added**, **Changed**, **Fixed**, **Removed** (omit empty groups).
- If a change has a breaking counterpart already listed in ⚠️ Breaking Changes, reference it here under **Changed** or **Removed** with a one-line migration hint.
- Keep each bullet to one sentence.

Example:

```markdown
## Release Notes

### Added
- `EmitterModule.forFeature({ logger })` — override the error logger per module without affecting the rest of the app.

### Changed
- `@OnEmitterEvent` now prefers the feature-level logger over the root logger when both are present.

### Fixed
- Listener errors in async handlers no longer propagate and crash the emitter loop.
```

## Risks

<Deployment concerns, rollback considerations, migration steps required, third-party service dependencies, feature flags to toggle. If none: "None — all changes are backward-compatible.">

## Version Bump

`<major | minor | patch>` → `<new-version>` (justification)

The version bump is included in this PR's diff (`package.json`, and `package-lock.json` if present). After merging this PR into `main`:

```bash
git checkout main && git pull
npm run publish:only
```

`publish:only` publishes the current version to npm — it does **not** bump the version, since the bump is already in `main` from this PR.

## Test Plan

- [ ] All unit tests pass (`npm test`)
- [ ] Linting clean (`npm run lint`)
- [ ] Build succeeds (`npm run build`)
- [ ] <any manual verification steps specific to the changes>
- [ ] Verify no regressions in <key user-facing flows>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

---

### Step 8: Report Output

Provide:

- Source branch and commit range (`origin/main..origin/<source-branch>`).
- Number of commits and files changed.
- Breaking changes found (or "none").
- Version bump: `<old>` → `<new>` (`<level>`), and whether the bump commit was newly created by this run or already present on the source branch.
- PR URL.
- Any lint/test issues encountered.
- Next steps for the user, in order:
  1. Review and merge the PR.
  2. From `main` (pulled): `npm run publish:only` — publishes the bumped version to npm.

## Success Criteria

The release PR should:

- Be created from the remote source branch — the user's local branch and working tree are untouched.
- Reflect the complete set of changes between `origin/main` and `origin/<source-branch>`.
- Surface any breaking changes prominently at the top.
- **Include the version-bump commit** (`package.json` updated to the new version) in the PR diff, so merging the PR brings `main`'s version in sync with what will be published to npm.
- Document the publish step (`npm run publish:only`) the user runs after merge.
- Have a test plan that a reviewer can actually follow.
- Be mergeable (no conflicts with `main`).