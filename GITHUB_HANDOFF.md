# Finish the GitHub requirements

The local project is prepared. The PDF also requires public GitHub evidence and real teammate reviews. A ZIP or written report cannot replace those steps.

## First, verify the work locally

Extract the whole project, including its `.git` folder. The current branch is `feat/state-rendering`; it contains the complete project. Do not run `git init` again or delete the history.

```bash
npm ci
npm run lint
npm run typecheck
npm test
npm run test:coverage
git log --oneline --all
```

Read the implementation before submitting. Ask a teammate to review it too. There are no invented reviewer comments or approvals in this package.

## Published repository

The code is published at https://github.com/hassan51214786/task-tracker-ts. The implementation is on `feat/state-rendering`; `main` contains the scaffold until reviewer merges are complete.

```bash
git clone https://github.com/hassan51214786/task-tracker-ts.git
cd task-tracker-ts
git checkout feat/state-rendering
npm ci
npm run lint
npm run typecheck
npm run test:coverage
```

The reviewer account named by the assignment is `hussain0138`. Collaborator acceptance and actual teammate participation must be verified rather than assumed. Protect `main` with a required PR, at least one approval and the passing `quality` CI check.

## Open three draft PRs without merging them yourself

The branches are stacked, so the second and third depend on earlier work. Initially use these bases to keep each diff focused:

| PR  | Head branch            | Initial base       |
| --- | ---------------------- | ------------------ |
| 1   | `feat/foundations`     | `main`             |
| 2   | `feat/async-layer`     | `feat/foundations` |
| 3   | `feat/state-rendering` | `feat/async-layer` |

PR #1 and PR #2 are already open as Drafts. Use `PR_DRAFTS.md` for the required description fields. Get green local checks and GitHub CI before marking a PR ready. Request review from `hussain0138`. A reviewer, rather than you, must merge the PR after approval.

Ask the reviewer to use a merge commit for PR 1 and PR 2 so that the later branches keep a clean ancestry. After PR 1 is merged, change PR 2's base to `main`, rerun CI and request its approval. After PR 2 is merged, do the same for PR 3. If the reviewer uses squash or rebase merging instead, update each dependent branch carefully with their help before continuing; do not blindly merge duplicated changes.

Every intern must contribute actual code and review at least one teammate PR. Leave a specific comment about correctness, an edge case or a useful test, based on code you really read. This local preparation does not count as a teammate's commit or review.

If review changes are requested, commit them on the appropriate feature branch, rerun the checks, push and update the final SHA in the PR and submission document.

## Before sending the final submission

Add your public repository URL, three merged PR URLs, approved reviews and green CI links to the submission document. Include the latest coverage summary. Do not mark pending steps as completed. Have the reviewer merge the last PR, then verify the final merged revision and use its SHA if it differs from the prepared local revision.
