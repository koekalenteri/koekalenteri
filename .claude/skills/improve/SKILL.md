---
name: improve
description: Look back at a production release and improve how the next one is made. Measures with a script what leaked through review and testing, what work was wasted, what CI and the tools cost and where the time and tokens went, compares the numbers with the previous release's retro, finds the root causes, and turns the fixes into pull requests through the /ticket flow. Records the retro in the release's plan document. Use after every production release, for "miten release meni", "paranna prosessia", "retro 2.2.0" or "/improve 2.2.0".
---

# /improve <version>

Runs after `v<version>` is in production. It asks how the release went and changes how the next
one is made: the agent definitions (`.claude/agents/*`), the skills (`.claude/skills/*`), the hooks
(`.claude/hooks/*`, `.claude/settings.json`), the agent rules in `AGENTS.md`, CI
(`.github/workflows/*`) and the scripts and tools the work used. Application code is not its
subject; a product bug it meets becomes an issue for `/ticket`.

The goal is the quality of the product. Tokens and time are saved only where quality keeps every
check it has; a cheaper process that lets one more bug through is worse.

This session orchestrates, as in `/ticket` (`.claude/skills/ticket/SKILL.md`); read it first.

## 1. Scope

- The release is `v<version>` and the production tag before it (`git tag`, no `-beta` tags);
  `retro.mjs` finds both. Its PRs are the squash merges between the tags, its issues the Jira
  fixVersion `<version>`, its time window the two tags' commit dates.
- "After the release" runs to the next production tag, or to now. Run `/improve` again later for a
  release whose window was still open; bugs reported after it keep arriving for weeks.

## 2. Measure

```
.claude/skills/improve/retro.mjs <version> --out <scratchpad>/retro
```

It writes `<scratchpad>/retro/retro-<version>.json` and prints the summary. Read the summary, and
the JSON only for the rows you dig into. Never read a transcript with the model: there are
gigabytes of them, and the script already has every number taken from them. A question the
summary cannot answer gets a new measure in the script (step 6), not a manual read.

What it measures, in the order the retro uses:

- **Quality:** issues sent back from testing or Done to In Progress (Jira changelog), bugs
  reported during and after the release, reverts, `fix` commits after the tag, Sonar issues on
  main and on each PR (SonarCloud's public API), and reviewer findings per angle and round from
  each report's `Findings:` line (`.claude/agents/reviewer.md`).
- **Wasted work:** PR open-to-merge hours, force-pushes, main merged into a branch, PRs turned back
  to draft, CI watcher rounds per PR, sightings of a `CONFLICTING` branch, pre-commit and
  commit-msg hook failures, reruns.
- **CI:** job medians and p90s, why runs went red (job and first failed step), jobs that failed
  and then passed on a rerun of the same run (flaky).
- **Tools:** failed tool calls by kind (permission, hook, sandbox, MCP, harness, exit code), waits
  on the user (`AskUserQuestion`), other pauses over half an hour.
- **Waits** (`waits.mjs`): every way an agent waits, per kind and agent type (the main session or
  the subagent's type). The kinds: `sleep` (a foreground `sleep N`), `poll-loop` (`until`,
  `while` or `for` with a sleep), `gh-pr-checks-watch`, `gh-run-watch`, `bash-background` (Bash
  with `run_in_background`), `monitor` (the Monitor tool) and `wakeup` (ScheduleWakeup); a
  foreground command that matches several is the most specific. Per row: calls; wall seconds,
  from the call to its result, or for a background one to the notice that ends it (the task
  notification with a status, a Monitor expiry, the wakeup firing with the same prompt), with how
  many calls had an end in the transcript (`not measured` when none had); calls that timed out
  (the harness says so, the command ran its whole `timeout N`, or a Monitor expired with no
  events delivered); repeats, the polling measure (the same target polled again with nothing
  else in between, not in the same message); calls the harness moved to the background; and the input-equivalent tokens
  of the messages that issued them.
- **Tokens:** input-equivalent tokens (cache write 1.25x or 2x, cache read 0.1x, output 5x) by
  agent type, skill, PR, session and model; the tool results that cost most because every later
  turn reads them again; the same file read three or more times; the same command run three or
  more times in one transcript, whatever it is (for waits, `repeats` above).

A measure that finds no data says so; a zero is a result only when the source was there. Write
down which measures had no data and why.

## 3. Compare with the previous retro

This is the step the rest depends on. The previous release's plan document (the summary's last
line, from the Jira version's `Suunnitelma:` line) has a **Retro** section with its numbers, the
changes it made and what it said to measure now. For each change it made:

- Did the number it aimed at move? Compare like with like: per PR, per run, per issue, since
  releases differ in size.
- Helped: keep it. No effect: say so, and propose dropping it if it costs anything. Made something
  worse (a quality number above all): propose reverting it, through the user (step 6).

Without a previous Retro section, say this is the first and the numbers become the baseline.

## 4. Root causes

Quality first, then wasted work, then tokens and time.

- **Every quality leak** (a bug past dev or production, an issue back from testing, a revert, a fix
  PR, a finding only a late round or no reviewer found, a Sonar issue that merged): where should it
  have been caught (the plan, a reviewer angle, a test, CI, `/verify-dev`), and why was it not?
  Read the PR, the issue and the rule that should have caught it.
- **Wasted work:** reruns, stalled rounds, conflicts, waits. What made the round necessary.
  A foreground wait that timed out or was repeated is waste: the agent spent a turn, and the
  tokens of the message that issued it, without learning the result. Report the waits table
  with the instruction that told each agent type to wait that way.
- **Tokens and time:** the largest consumers in the summary.

Read the cause from the source, never from a report: the instruction, hook or workflow line that
made the agent do it. Example: rebases were slow because the instructions said to merge main into
the branch, so the pre-commit hook tested 145 of main's files (#1848).

## 5. Order

Quality leaks first, by how bad the leak was and how often its kind recurs. Then the rest by the
saving (time or tokens) times how often it recurs per release.

## 6. Improve

Each improvement is one PR through `/ticket` steps 2-6 (implementer, reviewers, CI watcher), with
no issue key: the work on the process carries no Jira issue. The PR body names the retro number it
aims at, so the next `/improve` can judge it.

- **Straight to a PR, without asking:** an instruction's wording, a hook, a CI step, a script, a
  new measure in `retro.mjs`, as long as no quality check gets weaker.
- **Ask first** with `AskUserQuestion`, every question in one round:
  - anything that removes or weakens a quality check (a reviewer angle, a test, a CI job,
    `/verify-dev`, the root-cause proof), whatever it saves;
  - a change to the process: a new phase, an agent added or removed, a model or effort changed;
  - a change that clearly adds cost. Quality weighs more than the cost; say what it buys.
  - reverting an earlier retro's change (step 3).
- A product bug found on the way gets an issue (`/ticket`'s "Follow-up issues"), not a fix here.

At most three implementers at once, as in `/build`.

## 7. Retro section

Write it into the plan document of `<version>` (`<version>: suunnitelma`, Claude Docs; the link
is the last line of the Jira version's description). Create the document, and that line, if the
version has none. Read the Docs connector's guide first, then add or replace the section
**Retro**, in this order:

1. **Laatu:** the quality numbers, beside the previous release's.
2. **Hukka, CI ja työkalut:** the same, compared, with the waits table (kind, agent type, calls,
   wall, timed out, repeats, tokens).
3. **Tokenit ja aika:** the same, compared.
4. **Edellisen kierroksen muutokset:** each one, whether it helped, kept, dropped or reverted.
5. **Löydökset:** each root cause from step 4 with its evidence.
6. **Muutokset:** the PRs this round opened, each with the number it aims at.
7. **Mitataan ensi kerralla:** what the next `/improve` checks, and measures missing data.

Numbers are copied from the script's output; nothing is estimated.

## 8. Report

The quality numbers and how they moved, the previous changes judged, the PRs opened and their
state, the questions asked and their answers, and what waits on the user. Then the document link.

## Rules

- No change reduces quality checking without the user's answer.
- The numbers come from `retro.mjs`, never from an agent's report or a transcript read by hand.
- Production only with the user's permission, also for reading.
- Agents never merge, queue, enable auto-merge or push to main.
