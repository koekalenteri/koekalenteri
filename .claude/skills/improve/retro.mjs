#!/usr/bin/env node
// The numbers /improve reads about one production release: quality, wasted work, CI, tools, time
// and tokens, from git, GitHub, Jira, SonarCloud and the Claude Code session transcripts.
//
// The release is the range from the previous production tag (vX.Y.Z, no pre-release suffix) to
// v<version>; "after" is from v<version> to the next production tag, or to now while there is none.
// Transcripts are read from ~/.claude/projects/<the checkout's path with / and . as ->*, the main
// checkout's own folder and every worktree's beside it. Only lines inside the release's time
// window count. The model never reads a transcript: this script writes the whole result as JSON
// and prints a summary of tables.
//
// Usage: .claude/skills/improve/retro.mjs <version> --out <dir> [--from <tag>]
//   writes <dir>/retro-<version>.json and caches CI jobs under <dir>/cache/
import { execFile, execFileSync } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { createInterface } from 'node:readline'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { dotenvFile } from '../../../scripts/lib/git.mjs'
import { credentialsFromEnv, jiraClient, searchAll } from '../../../scripts/lib/jira.mjs'
import { WaitStats } from './waits.mjs'

const REPO = 'koekalenteri/koekalenteri'
const SONAR = 'https://sonarcloud.io/api'
const LONG_PAUSE_MS = 30 * 60 * 1000
const BIG_RESULT_CHARS = 20_000
const ANGLES = [
  'root-cause',
  'scope',
  'rule-readers',
  'tests',
  'clock',
  'conventions',
  'architecture',
  'complexity',
  'docs',
]
const BACK_TO_WORK = new Set(['Ready for Testing', 'Testing In Progress', 'Done'])

// ---------------------------------------------------------------------------------------------
// Pure helpers (tested in scripts/improve-retro.test.mjs)

const semver = (tag) => tag.slice(1).split('.').map(Number)
const compareTags = (a, b) => {
  const [x, y] = [semver(a), semver(b)]
  return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
}

/** Production tags (vX.Y.Z, no pre-release suffix), oldest first. */
const productionTags = (tags) => tags.filter((tag) => /^v\d+\.\d+\.\d+$/.test(tag)).sort(compareTags)

/** The production tags around `to`: the one before it and the one after it (or undefined). */
export const neighbourTags = (tags, to) => {
  const prod = productionTags(tags)
  const index = prod.indexOf(to)
  if (index < 0) throw new Error(`${to} is not a production tag`)
  return { from: prod[index - 1], next: prod[index + 1] }
}

/** The PR numbers of squash-merge subjects ("... (#1234)"). */
export const prNumbers = (subjects) =>
  subjects
    .map((s) => s.match(/\(#(\d+)\)$/)?.[1])
    .filter(Boolean)
    .map(Number)

export const isRevert = (subject) => /^revert\b/i.test(subject)
export const isFix = (subject) => /^fix(\(|!|:)/.test(subject)

const median = (values) => quantile(values, 0.5)
const quantile = (values, q) => {
  if (values.length === 0) return undefined
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]
}

const hours = (from, to) => Math.round(((Date.parse(to) - Date.parse(from)) / 3_600_000) * 10) / 10

/** One merged PR from the GraphQL node: durations and how often its branch was rewritten. */
export const prStats = (node) => {
  const events = node.timelineItems.nodes
  const ready = events.findLast((e) => e.__typename === 'ReadyForReviewEvent')?.createdAt
  return {
    number: node.number,
    title: node.title,
    branch: node.headRefName,
    bot:
      node.author?.login?.includes('[bot]') ||
      node.author?.login === 'dependabot' ||
      /^dependabot\//.test(node.headRefName),
    openToMergeH: hours(node.createdAt, node.mergedAt),
    readyToMergeH: ready ? hours(ready, node.mergedAt) : undefined,
    commits: node.commits.totalCount,
    mainMerges: node.commits.nodes.filter((c) => c.commit.parents.totalCount > 1).length,
    forcePushes: events.filter((e) => e.__typename === 'HeadRefForcePushedEvent').length,
    backToDraft: events.filter((e) => e.__typename === 'ConvertToDraftEvent').length,
  }
}

const jobKey = (job) => job.name

/** The job names that failed in one attempt of a run and passed in a later one, on the same SHA. */
export const flakyJobs = (jobs) => {
  const byName = Map.groupBy(jobs, jobKey)
  const flaky = []
  for (const [name, attempts] of byName) {
    const sorted = attempts.toSorted((a, b) => a.run_attempt - b.run_attempt)
    const failedAt = sorted.findIndex((j) => j.conclusion === 'failure')
    if (failedAt >= 0 && sorted.slice(failedAt + 1).some((j) => j.conclusion === 'success')) flaky.push(name)
  }
  return flaky
}

const jobMinutes = (job) =>
  job.started_at && job.completed_at ? (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 60_000 : undefined

const firstFailedStep = (job) => job.steps?.find((s) => s.conclusion === 'failure')?.name ?? '-'

/** CI over the release: job durations, why runs went red, and flaky jobs. `jobsOf` has every attempt. */
export const ciSummary = (runs, jobsOf) => {
  const durations = new Map()
  const red = new Map()
  const flaky = new Map()
  const runMinutes = []
  for (const run of runs) {
    const jobs = jobsOf.get(run.id) ?? []
    const last = jobs.filter((j) => j.run_attempt === run.run_attempt)
    for (const job of last) {
      const minutes = jobMinutes(job)
      if (minutes !== undefined && job.conclusion !== 'skipped') {
        durations.set(job.name, [...(durations.get(job.name) ?? []), minutes])
      }
    }
    for (const job of jobs.filter((j) => j.conclusion === 'failure')) {
      const reason = `${job.name} :: ${firstFailedStep(job)}`
      red.set(reason, (red.get(reason) ?? 0) + 1)
    }
    for (const name of flakyJobs(jobs)) flaky.set(name, (flaky.get(name) ?? 0) + 1)
    if (run.run_started_at && run.updated_at)
      runMinutes.push((Date.parse(run.updated_at) - Date.parse(run.run_started_at)) / 60_000)
  }
  const round = (n) => (n === undefined ? undefined : Math.round(n * 10) / 10)
  return {
    runs: runs.length,
    byEvent: countBy(runs, (r) => r.event),
    byConclusion: countBy(runs, (r) => r.conclusion ?? r.status),
    reruns: runs.filter((r) => r.run_attempt > 1).length,
    runMinutes: { median: round(median(runMinutes)), p90: round(quantile(runMinutes, 0.9)) },
    jobs: [...durations]
      .map(([name, list]) => ({
        name,
        runs: list.length,
        median: round(median(list)),
        p90: round(quantile(list, 0.9)),
      }))
      .sort((a, b) => (b.p90 ?? 0) - (a.p90 ?? 0)),
    redReasons: topEntries(red, 15),
    flaky: topEntries(flaky, 15),
  }
}

const countBy = (items, keyOf) => {
  const counts = {}
  for (const item of items) {
    const key = keyOf(item) ?? '-'
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}

const topEntries = (map, n) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, count]) => ({ key, count }))

/** The times an issue went from testing or done back to In Progress, from its changelog. */
export const reopenings = (histories) =>
  histories.flatMap((h) =>
    h.items
      .filter((i) => i.field === 'status' && BACK_TO_WORK.has(i.fromString) && i.toString === 'In Progress')
      .map((i) => ({ at: h.created, from: i.fromString }))
  )

/** The plan document's link: the version description's last line, "Suunnitelma: <link>". */
export const planLink = (description) =>
  (description ?? '')
    .trim()
    .split('\n')
    .at(-1)
    ?.match(/^Suunnitelma:\s*(\S+)/)?.[1]

/** ~/.claude/projects folder name of a checkout path: every / and . becomes -. */
export const projectDirName = (checkout) => checkout.replaceAll(/[/.]/g, '-')

/** The reviewer's tally line "Findings: 2 confirmed, 1 plausible, 3 notes" (reviewer.md), if any. */
export const reviewerTally = (text) => {
  const m = /^Findings:\s*(\d+)\s+confirmed,\s*(\d+)\s+plausible,\s*(\d+)\s+notes?\b/im.exec(text ?? '')
  return m ? { confirmed: Number(m[1]), plausible: Number(m[2]), notes: Number(m[3]) } : undefined
}

/** A report with no tally line that says it found nothing. A heuristic for reports before the tally. */
export const looksClean = (text) =>
  /\bno (confirmed |new )?findings\b|\bnothing (else )?found\b|\bno issues found\b/i.test(text ?? '')

/** The angle and round a reviewer was started for, from the Agent call's description. */
export const reviewerRun = (description) => {
  const text = description ?? ''
  return {
    angle: ANGLES.find((a) => text.includes(a)) ?? 'other',
    round: Number(/\b(?:round|r)\s*(\d+)\b/i.exec(text)?.[1] ?? 1),
    plan: /\bplan\b/i.test(text),
  }
}

const roundLabel = (r) => {
  if (r.plan) return 'plan'
  return r.round > 3 ? 'r4+' : `r${r.round}`
}

/** What kind of failure a tool result is. */
export const errorKind = (text, tool) => {
  if (
    /Permission for this action was denied|doesn't want to proceed|requested permissions|auto mode classifier/i.test(
      text
    )
  )
    return 'permission'
  if (/hook (error|blocking)|blocked by .*hook|^Refused: git/im.test(text)) return 'hook'
  if (/isolated in the worktree|Operation not permitted/i.test(text)) return 'sandbox'
  if (tool?.startsWith('mcp__')) return 'mcp'
  if (/<tool_use_error>/.test(text)) return 'harness'
  if (/^Exit code \d+/.test(text)) return 'exit'
  return 'other'
}

/** An error message with its paths, ids and numbers taken out, so that one cause counts as one row. */
export const errorSignature = (text) =>
  text
    .replaceAll(/\S*\/\S+/g, '<path>')
    .replaceAll(/\d+/g, 'N')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .slice(0, 120)

/** Input-equivalent tokens: what the four counts cost relative to one fresh input token. */
export const weightedTokens = (usage) => {
  const oneHour = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const created = (usage.cache_creation_input_tokens ?? 0) - oneHour
  return Math.round(
    (usage.input_tokens ?? 0) +
      created * 1.25 +
      oneHour * 2 +
      (usage.cache_read_input_tokens ?? 0) * 0.1 +
      (usage.output_tokens ?? 0) * 5
  )
}

const emptyTokens = () => ({ input: 0, cacheWrite: 0, cacheRead: 0, output: 0, weighted: 0, turns: 0 })
const addUsage = (sum, usage) => {
  sum.input += usage.input_tokens ?? 0
  sum.cacheWrite += usage.cache_creation_input_tokens ?? 0
  sum.cacheRead += usage.cache_read_input_tokens ?? 0
  sum.output += usage.output_tokens ?? 0
  sum.weighted += weightedTokens(usage)
  sum.turns += 1
}
const bump = (map, key, usage) => {
  if (!map.has(key)) map.set(key, emptyTokens())
  addUsage(map.get(key), usage)
}

/** An assistant line that ends the turn: text and no tool call, so the session waits for the user. */
const isTurnEnd = (record) =>
  record.type === 'assistant' &&
  Array.isArray(record.message?.content) &&
  !record.message.content.some((block) => block.type === 'tool_use') &&
  record.message.stop_reason !== 'tool_use'

const textOf = (content) => {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) return content.map((c) => c.text ?? '').join('\n')
  return ''
}

const toolInputSummary = (name, input = {}) => {
  if (name === 'Bash') return String(input.command ?? '').slice(0, 160)
  if (name === 'Read' || name === 'Write' || name === 'Edit') return String(input.file_path ?? '')
  if (name === 'Agent') return `${input.subagent_type ?? ''}: ${input.description ?? ''}`
  return JSON.stringify(input).slice(0, 160)
}

/**
 * Reads transcript records one at a time. A file is one transcript (a session or a subagent);
 * `begin` opens it with what is known from outside the lines: its session, agent type, description.
 */
export class TranscriptStats {
  constructor({ from, to, prs, skills = [] }) {
    this.skills = new Set(skills)
    this.from = Date.parse(from)
    this.to = Date.parse(to)
    this.prs = prs // [{ number, branch, keys }]
    this.byAgent = new Map()
    this.bySkill = new Map()
    this.byPr = new Map()
    this.bySession = new Map()
    this.byModel = new Map()
    this.seen = new Set()
    this.errors = new Map()
    this.errorCauses = new Map()
    this.toolSizes = new Map()
    this.bigResults = []
    this.repeatedReads = []
    this.repeatedCommands = []
    this.waits = new WaitStats(weightedTokens)
    this.questions = []
    this.activity = new Map()
    this.precommit = { preCommitFailed: 0, commitMsgFailed: 0 }
    this.conflicts = new Map()
    this.reviewers = []
    this.ciWatchers = new Map()
    this.sessions = new Map()
  }

  inWindow(ts) {
    const t = Date.parse(ts)
    return t >= this.from && t <= this.to
  }

  prFor({ description = '', branch = '', key }) {
    const number = Number(/(?:#|\bPR\s*|\bReview\s+)(\d{3,5})\b/i.exec(description)?.[1])
    if (this.prs.some((p) => p.number === number)) return `#${number}`
    const byBranch = this.prs.find((p) => p.branch === branch)
    if (byBranch) return `#${byBranch.number}`
    const k = key ?? /KOE-\d+/i.exec(`${description} ${branch}`)?.[0]?.toUpperCase()
    const byKey = k && this.prs.find((p) => p.keys.includes(k))
    return byKey ? `#${byKey.number}` : '-'
  }

  begin(file) {
    const session = this.sessions.get(file.sessionId) ?? { title: file.title, skill: undefined, skillArg: undefined }
    this.sessions.set(file.sessionId, session)
    this.file = {
      ...file,
      session,
      tools: new Map(),
      reads: new Map(),
      commands: new Map(),
      turn: 0,
      big: [],
      last: '',
    }
    this.waits.begin(file.agentType)
  }

  line(record) {
    if (!record.timestamp) return
    // A notice that ends a wait counts after the window too: the wait itself was inside it.
    this.waits.notice(record)
    if (!this.inWindow(record.timestamp)) return
    const f = this.file
    if (record.type !== 'assistant' && record.type !== 'user') return
    // Only the conversation counts as activity: bookkeeping lines follow a turn's end.
    const act = this.activity.get(f.sessionId) ?? []
    act.push([Date.parse(record.timestamp), f.agentType === 'main' && isTurnEnd(record)])
    this.activity.set(f.sessionId, act)
    if (record.type === 'assistant') this.assistant(record)
    else this.user(record)
  }

  skillCommand(text) {
    const m = /<command-name>\/([a-z-]+)<\/command-name>[\s\S]*?<command-args>([^<]*)/.exec(text)
    if (!m || !this.skills.has(m[1]) || this.file.agentType !== 'main') return
    this.file.session.skill = `/${m[1]}`
    this.file.session.skillArg = m[2].trim()
  }

  assistant(record) {
    const f = this.file
    const message = record.message ?? {}
    for (const block of Array.isArray(message.content) ? message.content : []) {
      if (block.type === 'tool_use') this.toolUse(block, record)
      if (block.type === 'text') f.last = block.text
    }
    const id = message.id ?? record.uuid
    if (!message.usage || this.seen.has(id)) return
    this.seen.add(id)
    f.turn += 1
    const usage = message.usage
    const skill = f.session.skill ?? '(none)'
    const pr = this.prFor({
      description: f.description,
      branch: record.gitBranch,
      key: /KOE-\d+/i.exec(f.session.skillArg ?? '')?.[0]?.toUpperCase(),
    })
    bump(this.byAgent, f.agentType, usage)
    bump(this.bySkill, skill, usage)
    bump(this.byPr, pr, usage)
    bump(this.bySession, f.sessionId, usage)
    bump(this.byModel, message.model ?? '-', usage)
  }

  toolUse(block, record) {
    const f = this.file
    f.tools.set(block.id, { name: block.name, input: block.input, at: record.timestamp })
    this.waits.use(block, record)
    if (block.name === 'SubagentHandback') f.last = block.input?.message ?? f.last
    if (block.name === 'Read' && block.input?.file_path) {
      const key = `${block.input.file_path}:${block.input.offset ?? ''}`
      f.reads.set(key, (f.reads.get(key) ?? 0) + 1)
    }
    if (block.name === 'Bash') {
      const command = String(block.input?.command ?? '')
      f.commands.set(command, (f.commands.get(command) ?? 0) + 1)
    }
  }

  user(record) {
    const content = record.message?.content
    if (typeof content === 'string') return this.skillCommand(content)
    for (const block of Array.isArray(content) ? content : []) {
      if (block.type === 'text') {
        this.skillCommand(block.text)
        this.waits.interrupt()
      }
      if (block.type === 'tool_result') this.toolResult(block, record)
    }
  }

  toolResult(block, record) {
    const f = this.file
    const tool = f.tools.get(block.tool_use_id) ?? { name: '?', input: {} }
    const text = textOf(block.content)
    this.waits.result(block, record, text)
    const size = this.toolSizes.get(tool.name) ?? { calls: 0, chars: 0 }
    size.calls += 1
    size.chars += text.length
    this.toolSizes.set(tool.name, size)
    if (text.length >= BIG_RESULT_CHARS)
      f.big.push({ tool: tool.name, input: toolInputSummary(tool.name, tool.input), chars: text.length, turn: f.turn })
    if (tool.name === 'AskUserQuestion') {
      this.questions.push({
        session: f.sessionId,
        at: tool.at,
        minutes: Math.round((Date.parse(record.timestamp) - Date.parse(tool.at)) / 60_000),
      })
    }
    if (text.includes('husky - pre-commit script failed')) this.precommit.preCommitFailed += 1
    if (text.includes('husky - commit-msg script failed')) this.precommit.commitMsgFailed += 1
    if (text.includes('CONFLICTING')) {
      const number = /gh pr (?:view|checks|status)\s+(\d+)/.exec(String(tool.input?.command ?? ''))?.[1]
      const pr = number ? `#${number}` : this.prFor({ description: f.description, branch: record.gitBranch })
      this.conflicts.set(pr, (this.conflicts.get(pr) ?? 0) + 1)
    }
    if (block.is_error) this.error(text, tool, f)
  }

  error(text, tool, f) {
    const kind = errorKind(text, tool.name)
    const key = `${kind}\t${tool.name}`
    this.errors.set(key, (this.errors.get(key) ?? 0) + 1)
    if (kind === 'exit') return
    const cause = `${kind}\t${errorSignature(text)}`
    const row = this.errorCauses.get(cause) ?? { count: 0, agents: new Set() }
    row.count += 1
    row.agents.add(f.agentType)
    this.errorCauses.set(cause, row)
  }

  end() {
    const f = this.file
    for (const big of f.big) {
      // Every later turn reads the result again from the cache: tokens times the turns left.
      this.bigResults.push({
        ...big,
        agent: f.agentType,
        session: f.sessionId,
        carriedTokens: Math.round((big.chars / 4) * (f.turn - big.turn)),
      })
    }
    this.bigResults = this.bigResults.sort((a, b) => b.carriedTokens - a.carriedTokens).slice(0, 25)
    for (const [file, count] of f.reads) if (count >= 3) this.repeatedReads.push({ file, count, agent: f.agentType })
    for (const [command, count] of f.commands)
      if (count >= 3) this.repeatedCommands.push({ command: command.slice(0, 160), count, agent: f.agentType })
    if (f.turn === 0) return
    if (f.agentType === 'reviewer')
      this.reviewers.push({
        ...reviewerRun(f.description),
        pr: this.prFor({ description: f.description }),
        tally: reviewerTally(f.last),
        clean: looksClean(f.last),
      })
    if (f.agentType === 'ci-watcher') {
      const pr = this.prFor({ description: f.description })
      this.ciWatchers.set(pr, (this.ciWatchers.get(pr) ?? 0) + 1)
    }
  }

  /**
   * Gaps over half an hour in a session's activity (its own and its agents'), outside question
   * waits. After the session ended its turn the gap is the user's (`user`); otherwise a tool or an
   * agent was still running (`tool`).
   */
  pauses() {
    const result = []
    for (const [session, times] of this.activity) {
      const sorted = times.sort((a, b) => a[0] - b[0])
      const questions = this.questions
        .filter((w) => w.session === session)
        .map((w) => [Date.parse(w.at), Date.parse(w.at) + w.minutes * 60_000])
      for (let i = 1; i < sorted.length; i++) {
        const [[a, turnEnd], [b]] = [sorted[i - 1], sorted[i]]
        const asked = questions.some(([s, e]) => s <= a + 1000 && e >= b - 1000)
        if (b - a >= LONG_PAUSE_MS && !asked) {
          result.push({
            session,
            at: new Date(a).toISOString(),
            minutes: Math.round((b - a) / 60_000),
            after: turnEnd ? 'user' : 'tool',
          })
        }
      }
    }
    return result
  }

  reviewerSummary() {
    const rows = new Map()
    for (const r of this.reviewers) {
      const key = `${r.angle}\t${roundLabel(r)}`
      const row = rows.get(key) ?? { runs: 0, tallied: 0, confirmed: 0, plausible: 0, notes: 0, cleanUntallied: 0 }
      row.runs += 1
      if (r.tally) {
        row.tallied += 1
        row.confirmed += r.tally.confirmed
        row.plausible += r.tally.plausible
        row.notes += r.tally.notes
      } else if (r.clean) row.cleanUntallied += 1
      rows.set(key, row)
    }
    return [...rows]
      .map(([key, row]) => {
        const [angle, round] = key.split('\t')
        return { angle, round, ...row }
      })
      .sort((a, b) => a.angle.localeCompare(b.angle, 'en') || a.round.localeCompare(b.round, 'en'))
  }

  result() {
    const table = (map, label) =>
      [...map].map(([key, t]) => ({ [label]: key, ...t })).sort((a, b) => b.weighted - a.weighted)
    const sessions = table(this.bySession, 'session').map((row) => ({ ...row, ...this.sessions.get(row.session) }))
    return {
      tokens: {
        total: [...this.byAgent.values()].reduce((sum, t) => sum + t.weighted, 0),
        byAgent: table(this.byAgent, 'agent'),
        bySkill: table(this.bySkill, 'skill'),
        byPr: table(this.byPr, 'pr').slice(0, 25),
        bySession: sessions.slice(0, 25),
        byModel: table(this.byModel, 'model'),
      },
      bigResults: this.bigResults,
      toolResultChars: [...this.toolSizes]
        .map(([tool, s]) => ({ tool, ...s }))
        .sort((a, b) => b.chars - a.chars)
        .slice(0, 15),
      repeatedReads: this.repeatedReads.sort((a, b) => b.count - a.count).slice(0, 15),
      repeatedCommands: this.repeatedCommands.sort((a, b) => b.count - a.count).slice(0, 15),
      waits: this.waits.summary(),
      questionWaits: this.questions.sort((a, b) => b.minutes - a.minutes),
      pauses: this.pauses().sort((a, b) => b.minutes - a.minutes),
      toolErrors: [...this.errors]
        .map(([key, count]) => ({ kind: key.split('\t')[0], tool: key.split('\t')[1], count }))
        .sort((a, b) => b.count - a.count),
      errorCauses: [...this.errorCauses]
        .map(([key, row]) => ({
          kind: key.split('\t')[0],
          cause: key.split('\t')[1],
          count: row.count,
          agents: [...row.agents].join(','),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 30),
      gitHooks: this.precommit,
      conflictSightings: Object.fromEntries(this.conflicts),
      reviewers: this.reviewerSummary(),
      reviewerRunsPerPr: countBy(
        this.reviewers.filter((r) => !r.plan),
        (r) => r.pr
      ),
      ciWatcherRunsPerPr: Object.fromEntries(this.ciWatchers),
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Sources

const execFileAsync = promisify(execFile)
const run = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
const gh = async (args) => JSON.parse((await execFileAsync('gh', args, { maxBuffer: 256 * 1024 * 1024 })).stdout)

/** Runs `fn` over `items`, `limit` at a time, keeping the order. */
const pool = async (items, limit, fn) => {
  const results = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index], index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

const commitDate = (ref) => run('git', ['log', '-1', '--format=%cI', ref]).trim()
const subjects = (range) => run('git', ['log', '--format=%s', range]).split('\n').filter(Boolean)

const PR_FIELDS = `number title createdAt mergedAt headRefName author { login }
  commits(first: 100) { totalCount nodes { commit { parents { totalCount } } } }
  timelineItems(first: 100, itemTypes: [HEAD_REF_FORCE_PUSHED_EVENT, READY_FOR_REVIEW_EVENT, CONVERT_TO_DRAFT_EVENT]) {
    nodes { __typename ... on HeadRefForcePushedEvent { createdAt } ... on ReadyForReviewEvent { createdAt } ... on ConvertToDraftEvent { createdAt } } }`

const fetchPrs = async (numbers) => {
  const batches = []
  for (let i = 0; i < numbers.length; i += 40) batches.push(numbers.slice(i, i + 40))
  const pages = await pool(batches, 3, async (batch) => {
    const fields = batch.map((n) => `p${n}: pullRequest(number: ${n}) { ${PR_FIELDS} }`).join('\n')
    const query = `{ repository(owner: "koekalenteri", name: "koekalenteri") { ${fields} } }`
    return Object.values((await gh(['api', 'graphql', '-f', `query=${query}`])).data.repository)
  })
  return pages.flat().filter(Boolean).map(prStats)
}

const WEEK_MS = 7 * 24 * 3_600_000

/** The window cut into weeks: GitHub lists at most 1000 runs for one `created` filter. */
export const weeks = (from, to) => {
  const [start, end] = [Date.parse(from), Date.parse(to)]
  const ranges = []
  for (let t = start; t < end; t += WEEK_MS) {
    ranges.push(`${new Date(t).toISOString()}..${new Date(Math.min(t + WEEK_MS, end) - 1000).toISOString()}`)
  }
  return ranges
}

const fetchRunPages = async (created, page = 1) => {
  const body = await gh([
    'api',
    '-X',
    'GET',
    `repos/${REPO}/actions/workflows/ci.yml/runs`,
    '-f',
    `created=${created}`,
    '-f',
    'per_page=100',
    '-f',
    `page=${page}`,
  ])
  if (body.total_count >= 1000) throw new Error(`${body.total_count} CI runs in ${created}; GitHub lists only 1000`)
  if (body.workflow_runs.length < 100) return body.workflow_runs
  return [...body.workflow_runs, ...(await fetchRunPages(created, page + 1))]
}

const fetchRuns = async (from, to) => {
  const pages = await pool(weeks(from, to), 2, (created) => fetchRunPages(created))
  const byId = new Map(pages.flat().map((r) => [r.id, r]))
  return [...byId.values()]
}

const fetchJobs = async (runs, cacheDir) => {
  mkdirSync(cacheDir, { recursive: true })
  const lists = await pool(runs, 8, async (r) => {
    const file = path.join(cacheDir, `${r.id}-${r.run_attempt}.json`)
    if (existsSync(file)) return JSON.parse(readFileSync(file, 'utf8'))
    const body = await gh([
      'api',
      '-X',
      'GET',
      `repos/${REPO}/actions/runs/${r.id}/jobs`,
      '-f',
      'filter=all',
      '-f',
      'per_page=100',
    ])
    const jobs = body.jobs.map(({ name, conclusion, run_attempt, started_at, completed_at, steps }) => ({
      name,
      conclusion,
      run_attempt,
      started_at,
      completed_at,
      steps: steps?.filter((s) => s.conclusion === 'failure').map((s) => ({ name: s.name, conclusion: s.conclusion })),
    }))
    if (r.status === 'completed') writeFileSync(file, JSON.stringify(jobs))
    return jobs
  })
  return new Map(runs.map((r, i) => [r.id, lists[i]]))
}

const jiraDay = (iso) => iso.slice(0, 10)

const fetchJira = async (version, previous, window) => {
  const credentials = credentialsFromEnv()
  if (!credentials) return { error: 'JIRA_USER_EMAIL and JIRA_API_TOKEN missing from .env' }
  const request = jiraClient(credentials)
  const versions = await (await request('/rest/api/3/project/KOE/versions')).json()
  const describe = (name) => {
    const v = versions.find((x) => x.name === name)
    return v && { name, released: v.released, releaseDate: v.releaseDate, plan: planLink(v.description) }
  }
  const issues = await searchAll(request, `project = KOE AND fixVersion = "${version}"`, {
    fields: 'summary,status,issuetype,created',
    expand: 'changelog',
  })
  const rows = issues.map((i) => ({
    key: i.key,
    type: i.fields.issuetype.name,
    status: i.fields.status.name,
    created: i.fields.created,
    summary: i.fields.summary,
    reopened: reopenings(i.changelog?.histories ?? []),
    changelogComplete: (i.changelog?.total ?? 0) <= (i.changelog?.histories?.length ?? 0),
  }))
  const bugJql = `project = KOE AND issuetype = Bug AND created >= "${jiraDay(window.to)}"${window.next ? ` AND created < "${jiraDay(window.next)}"` : ''}`
  const after = await searchAll(request, bugJql, { fields: 'summary,status,created' })
  return {
    version: describe(version),
    previousVersion: describe(previous),
    issues: rows.length,
    byType: countBy(rows, (r) => r.type),
    byStatus: countBy(rows, (r) => r.status),
    reopened: rows
      .filter((r) => r.reopened.length)
      .map(({ key, summary, reopened }) => ({
        key,
        summary,
        times: reopened.length,
        from: reopened.map((r) => r.from),
      })),
    changelogTruncated: rows.filter((r) => !r.changelogComplete).map((r) => r.key),
    bugsFoundInRelease: rows
      .filter((r) => r.type === 'Bug' && r.created >= window.from)
      .map(({ key, summary }) => ({ key, summary })),
    bugsAfterRelease: after.map((i) => ({
      key: i.key,
      status: i.fields.status.name,
      created: i.fields.created.slice(0, 10),
      summary: i.fields.summary,
    })),
  }
}

const sonar = async (params) => {
  const response = await fetch(
    `${SONAR}/issues/search?componentKeys=koekalenteri_koekalenteri&${new URLSearchParams(params)}`
  )
  if (!response.ok) throw new Error(`SonarCloud ${response.status}`)
  return response.json()
}
const facet = (body, property) =>
  Object.fromEntries(
    (body.facets.find((f) => f.property === property)?.values ?? []).filter((v) => v.count).map((v) => [v.val, v.count])
  )
const sonarDate = (iso) => new Date(iso).toISOString().replace(/\.\d+Z$/, '+0000')

const fetchSonar = async (window, prs) => {
  const main = await sonar({
    createdAfter: sonarDate(window.from),
    createdBefore: sonarDate(window.to),
    ps: '1',
    facets: 'rules,statuses',
  })
  const perPr = await pool(prs, 8, async (pr) => {
    const body = await sonar({ pullRequest: String(pr.number), ps: '1', facets: 'rules,statuses' })
    return { pr: pr.number, raised: body.total, statuses: facet(body, 'statuses'), rules: facet(body, 'rules') }
  })
  const rules = {}
  for (const p of perPr) for (const [rule, n] of Object.entries(p.rules)) rules[rule] = (rules[rule] ?? 0) + n
  return {
    main: { created: main.total, rules: facet(main, 'rules'), statuses: facet(main, 'statuses') },
    prs: {
      analysed: perPr.filter((p) => p.raised !== undefined).length,
      raised: perPr.reduce((sum, p) => sum + p.raised, 0),
      openAtLastAnalysis: perPr.reduce((sum, p) => sum + (p.statuses.OPEN ?? 0) + (p.statuses.CONFIRMED ?? 0), 0),
      withIssues: perPr
        .filter((p) => p.raised)
        .map((p) => ({ pr: p.pr, raised: p.raised, open: (p.statuses.OPEN ?? 0) + (p.statuses.CONFIRMED ?? 0) }))
        .sort((a, b) => b.raised - a.raised)
        .slice(0, 15),
      topRules: Object.entries(rules)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10),
    },
  }
}

/** The transcript folders of this repository: the main checkout's and every worktree's. */
const transcriptDirs = (mainCheckout) => {
  const projects = path.join(homedir(), '.claude', 'projects')
  const own = projectDirName(mainCheckout)
  if (!existsSync(projects)) return []
  return readdirSync(projects)
    .filter((name) => name === own || name.startsWith(`${own}-`))
    .map((name) => path.join(projects, name))
}

const readJsonl = async (file, onRecord) => {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity })
  for await (const text of lines) {
    try {
      onRecord(JSON.parse(text))
    } catch {
      // A line cut short by a crash; the rest of the file still counts.
    }
  }
}

const readMeta = (file) => {
  const meta = file.replace(/\.jsonl$/, '.meta.json')
  return existsSync(meta) ? JSON.parse(readFileSync(meta, 'utf8')) : {}
}

const sessionTitle = (dir, id) => {
  const file = path.join(dir, id, 'custom-title.json')
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).customTitle : undefined
}

/** The transcripts of every session touched inside the window, main transcript before its agents. */
const sessionFiles = (dirs, from) => {
  const since = Date.parse(from)
  const files = []
  for (const dir of dirs) {
    for (const name of readdirSync(dir).filter((n) => n.endsWith('.jsonl'))) {
      const main = path.join(dir, name)
      const id = name.replace(/\.jsonl$/, '')
      const agentsDir = path.join(dir, id, 'subagents')
      const agents = existsSync(agentsDir)
        ? readdirSync(agentsDir)
            .filter((n) => n.endsWith('.jsonl'))
            .map((n) => path.join(agentsDir, n))
        : []
      const recent = [main, ...agents].some((f) => statSync(f).mtimeMs >= since)
      if (!recent) continue
      files.push({ file: main, sessionId: id, agentType: 'main', title: sessionTitle(dir, id) })
      for (const agent of agents) {
        const meta = readMeta(agent)
        files.push({
          file: agent,
          sessionId: id,
          agentType: meta.agentType ?? 'unknown',
          description: meta.description,
        })
      }
    }
  }
  return files
}

const readTranscripts = async (mainCheckout, window, prs, skills) => {
  const dirs = transcriptDirs(mainCheckout)
  const stats = new TranscriptStats({ from: window.from, to: window.to, prs, skills })
  const files = sessionFiles(dirs, window.from)
  for (const file of files) {
    stats.begin(file)
    await readJsonl(file.file, (record) => stats.line(record))
    stats.end()
  }
  return { dirs: dirs.length, files: files.length, ...stats.result() }
}

// ---------------------------------------------------------------------------------------------
// Report

const fmt = (n) =>
  n === undefined ? '-' : Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
const tsv = (rows, columns) =>
  [columns.join('\t'), ...rows.map((r) => columns.map((c) => r[c] ?? '-').join('\t'))].join('\n')

const summary = (r) => {
  const prs = r.prs.filter((p) => !p.bot)
  const lines = [
    `# Retro ${r.version}: ${r.window.fromTag}..${r.window.toTag} (${r.window.from} .. ${r.window.to}), after: ..${r.window.next ?? 'now'}`,
    '',
    '## Quality',
    `Jira: ${r.jira.issues} issues ${JSON.stringify(r.jira.byType)}; back to In Progress: ${r.jira.reopened.length}`,
    ...r.jira.reopened.map((x) => `  ${x.key} x${x.times} from ${x.from.join(',')}: ${x.summary}`),
    `Bugs reported during the release and fixed in it: ${r.jira.bugsFoundInRelease.length}`,
    `Bugs reported after the release: ${r.jira.bugsAfterRelease.length}${r.window.next ? '' : ' (window still open)'}`,
    ...r.jira.bugsAfterRelease.map((b) => `  ${b.key} ${b.status} ${b.created}: ${b.summary}`),
    `Reverts in the release: ${r.git.reverts.length}; fix commits after it: ${r.git.fixesAfter.length}`,
    ...r.git.reverts.map((s) => `  ${s}`),
    `Sonar on main, created in the window: ${r.sonar.main.created} ${JSON.stringify(r.sonar.main.rules)}`,
    `Sonar on PRs: ${r.sonar.prs.raised} raised over ${r.sonar.prs.analysed} PRs, ${r.sonar.prs.openAtLastAnalysis} open at the last analysis; top rules ${JSON.stringify(r.sonar.prs.topRules)}`,
    '',
    'Reviewer runs per angle and round (tally = reports with a Findings line; cleanUntallied = no tally, text says nothing found):',
    tsv(r.transcripts.reviewers, [
      'angle',
      'round',
      'runs',
      'tallied',
      'confirmed',
      'plausible',
      'notes',
      'cleanUntallied',
    ]),
    '',
    '## Wasted work',
    `PRs: ${prs.length} (+${r.prs.length - prs.length} bot); open->merge h median ${median(prs.map((p) => p.openToMergeH))}, p90 ${quantile(
      prs.map((p) => p.openToMergeH),
      0.9
    )}`,
    `Branch rewrites: force-pushes ${prs.reduce((s, p) => s + p.forcePushes, 0)}, main merged in ${prs.reduce((s, p) => s + p.mainMerges, 0)} times, back to draft ${prs.reduce((s, p) => s + p.backToDraft, 0)}`,
    `Conflict sightings in transcripts: ${JSON.stringify(r.transcripts.conflictSightings)}`,
    `CI watcher rounds per PR, top: ${JSON.stringify(
      Object.entries(r.transcripts.ciWatcherRunsPerPr)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
    )}`,
    `Git hooks in agent sessions: ${JSON.stringify(r.transcripts.gitHooks)}`,
    'Slowest PRs:',
    tsv(prs.toSorted((a, b) => b.openToMergeH - a.openToMergeH).slice(0, 10), [
      'number',
      'openToMergeH',
      'readyToMergeH',
      'commits',
      'forcePushes',
      'mainMerges',
      'title',
    ]),
    '',
    '## CI',
    `Runs ${r.ci.runs} ${JSON.stringify(r.ci.byEvent)} ${JSON.stringify(r.ci.byConclusion)}; reruns ${r.ci.reruns}; run minutes median ${r.ci.runMinutes.median}, p90 ${r.ci.runMinutes.p90}`,
    tsv(r.ci.jobs.slice(0, 15), ['name', 'runs', 'median', 'p90']),
    'Red (job :: first failed step):',
    tsv(r.ci.redReasons, ['count', 'key']),
    'Flaky (failed, then passed on a rerun of the same run):',
    tsv(r.ci.flaky, ['count', 'key']),
    '',
    '## Tools',
    tsv(r.transcripts.toolErrors.slice(0, 15), ['count', 'kind', 'tool']),
    'Causes (all kinds but exit codes):',
    tsv(r.transcripts.errorCauses.slice(0, 15), ['count', 'kind', 'agents', 'cause']),
    `Waits on the user (AskUserQuestion): ${r.transcripts.questionWaits.length}, ${r.transcripts.questionWaits.reduce((s, w) => s + w.minutes, 0)} min; longest ${JSON.stringify(r.transcripts.questionWaits.slice(0, 5))}`,
    ...['user', 'tool'].map((after) => {
      const list = r.transcripts.pauses.filter((p) => p.after === after)
      const label = after === 'user' ? 'after the turn ended, no question asked' : 'while a tool or agent ran'
      return `Pauses over 30 min ${label}: ${list.length}, median ${median(list.map((p) => p.minutes)) ?? '-'} min`
    }),
    'Waits by kind and agent type (wall = seconds over the calls whose end the transcript shows, measured/calls; timedOut = the harness timeout, a reached `timeout N` or a Monitor expiry with no events; repeats = the same target polled again with nothing between; tokens = the issuing messages):',
    tsv(
      r.transcripts.waits.map((w) => ({
        ...w,
        wall: typeof w.wallSeconds === 'number' ? `${w.wallSeconds} (${w.wallMeasured}/${w.calls})` : w.wallSeconds,
        tokens: fmt(w.tokens),
      })),
      ['kind', 'agent', 'calls', 'wall', 'timedOut', 'repeats', 'movedToBackground', 'tokens']
    ),
    '',
    `## Tokens (input-equivalent; ${r.transcripts.files} transcripts in ${r.transcripts.dirs} folders)`,
    `Total ${fmt(r.transcripts.tokens.total)}`,
    tsv(
      r.transcripts.tokens.byAgent.map((x) => ({
        ...x,
        weighted: fmt(x.weighted),
        cacheRead: fmt(x.cacheRead),
        output: fmt(x.output),
      })),
      ['agent', 'turns', 'weighted', 'cacheRead', 'output']
    ),
    tsv(
      r.transcripts.tokens.bySkill.map((x) => ({ ...x, weighted: fmt(x.weighted) })),
      ['skill', 'turns', 'weighted']
    ),
    tsv(
      r.transcripts.tokens.byModel.map((x) => ({ ...x, weighted: fmt(x.weighted) })),
      ['model', 'turns', 'weighted']
    ),
    'Top PRs:',
    tsv(
      r.transcripts.tokens.byPr.slice(0, 10).map((x) => ({ ...x, weighted: fmt(x.weighted) })),
      ['pr', 'turns', 'weighted']
    ),
    'Largest tool results by tokens carried through later turns:',
    tsv(
      r.transcripts.bigResults.slice(0, 10).map((x) => ({ ...x, carriedTokens: fmt(x.carriedTokens) })),
      ['carriedTokens', 'chars', 'agent', 'tool', 'input']
    ),
    'Tool result volume:',
    tsv(
      r.transcripts.toolResultChars.slice(0, 8).map((x) => ({ ...x, chars: fmt(x.chars) })),
      ['tool', 'calls', 'chars']
    ),
    `Repeated reads (same file 3+ times in one transcript), top: ${JSON.stringify(r.transcripts.repeatedReads.slice(0, 5))}`,
    `Repeated commands (3+ times in one transcript), top: ${JSON.stringify(r.transcripts.repeatedCommands.slice(0, 5))}`,
    '',
    `Plan documents: this ${r.jira.version?.plan ?? 'none'}, previous (${r.window.previousVersion}) ${r.jira.previousVersion?.plan ?? 'none'}`,
  ]
  return lines.join('\n')
}

const parseArgs = (argv) => {
  const args = { version: undefined, out: undefined, from: undefined }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') args.out = argv[++i]
    else if (argv[i] === '--from') args.from = argv[++i]
    else args.version = argv[i].replace(/^v/, '')
  }
  if (!args.version || !args.out) throw new Error('Usage: retro.mjs <version> --out <dir> [--from <tag>]')
  return args
}

const main = async () => {
  const args = parseArgs(process.argv.slice(2))
  const root = run('git', ['rev-parse', '--show-toplevel']).trim()
  const common = run('git', ['rev-parse', '--path-format=absolute', '--git-common-dir']).trim()
  const mainCheckout = common.replace(/\/\.git$/, '')
  process.loadEnvFile(dotenvFile(root))
  run('git', ['fetch', '--quiet', '--tags', 'origin', 'main'])

  const toTag = `v${args.version}`
  const tags = run('git', ['tag']).split('\n').filter(Boolean)
  const around = neighbourTags(tags, toTag)
  const fromTag = args.from ?? around.from
  const window = {
    fromTag,
    toTag,
    from: commitDate(fromTag),
    to: commitDate(toTag),
    next: around.next && commitDate(around.next),
    previousVersion: fromTag.slice(1),
  }
  const releaseSubjects = subjects(`${fromTag}..${toTag}`)
  const afterSubjects = subjects(`${toTag}..${around.next ?? 'origin/main'}`)
  const git = {
    commits: releaseSubjects.length,
    reverts: releaseSubjects.filter(isRevert),
    fixesInRelease: releaseSubjects.filter(isFix).length,
    fixesAfter: afterSubjects.filter(isFix),
  }

  const prs = await fetchPrs(prNumbers(releaseSubjects))
  const prKeys = prs.map((p) => ({ number: p.number, branch: p.branch, keys: p.title.match(/KOE-\d+/g) ?? [] }))
  const runs = await fetchRuns(window.from, window.to)
  const jobs = await fetchJobs(runs, path.join(args.out, 'cache', 'jobs'))
  const [jira, sonarResult, transcripts] = await Promise.all([
    fetchJira(args.version, window.previousVersion, window),
    fetchSonar(window, prs),
    readTranscripts(mainCheckout, window, prKeys, readdirSync(path.join(root, '.claude', 'skills'))),
  ])

  const result = {
    version: args.version,
    window,
    git,
    prs,
    ci: ciSummary(runs, jobs),
    jira,
    sonar: sonarResult,
    transcripts,
  }
  mkdirSync(args.out, { recursive: true })
  const file = path.join(args.out, `retro-${args.version}.json`)
  writeFileSync(file, JSON.stringify(result, null, 2))
  console.log(summary(result))
  console.log(`\nFull result: ${file}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}
