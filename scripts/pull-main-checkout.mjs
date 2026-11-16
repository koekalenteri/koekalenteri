#!/usr/bin/env node
// Brings the main checkout (the first entry of `git worktree list`) up to date with
// `git pull --ff-only` when it is on `main` with a clean tree, and leaves it as it is otherwise;
// prints what it did. An orchestrator runs it each time a PR it handled has merged, so that the
// files it and its reviewers read in the main checkout are what `main` has (/ticket, Rules).
// .claude/skills/build/remove-merged-worktrees.mjs --apply does the same after its removals.
//
//   npm run pull-main-checkout
import { pullMainCheckout } from './lib/git.mjs'

console.log(pullMainCheckout(process.cwd()))
