// How the agents wait and what each way costs, from the session transcripts (retro.mjs feeds it).
//
// A wait is one tool call of a kind below. Its wall time runs from the call to its result; for a
// call that goes on in the background (run_in_background, Monitor, a foreground command the
// harness moved to the background, ScheduleWakeup) it runs to the notice that ends it: the task
// notification with a status or a Monitor expiry, or the wakeup's firing with the same prompt.
// A call whose end is not in the transcript has no wall time; a row with none says "not measured".

/** The wait kinds, in the order the table lists them. */
const WAIT_KINDS = [
  'sleep',
  'poll-loop',
  'gh-pr-checks-watch',
  'gh-run-watch',
  'bash-background',
  'monitor',
  'wakeup',
]

const NOT_MEASURED = 'not measured'

/** The command with its quoted text emptied, so that a string a loop greps for is no command. */
const unquoted = (command) => command.replaceAll(/'[^']*'|"[^"]*"/g, "''")

const isPollLoop = (command) => {
  const loop = command.search(/\b(?:until|while|for)\b/)
  return loop >= 0 && /\bsleep\s+\d/.test(command.slice(loop))
}

/** The kind of wait a foreground command is; the most specific one when it matches several. */
const commandKind = (command) => {
  if (/\bgh\s+pr\s+checks\b[^;&|]*--watch\b/.test(command)) return 'gh-pr-checks-watch'
  if (/\bgh\s+run\s+watch\b/.test(command)) return 'gh-run-watch'
  if (isPollLoop(command)) return 'poll-loop'
  if (/\bsleep\s+\d/.test(command)) return 'sleep'
  return undefined
}

/** The wait kind of a tool call, or undefined when the call is no wait. */
export const waitKind = (name, input = {}) => {
  if (name === 'Monitor') return 'monitor'
  if (name === 'ScheduleWakeup') return 'wakeup'
  if (name !== 'Bash') return undefined
  if (input.run_in_background) return 'bash-background'
  return commandKind(unquoted(String(input.command ?? '')))
}

/** What a wait polls: the PR or run it names, else the command without its sleeps. */
export const waitTarget = (name, input = {}) => {
  if (name === 'ScheduleWakeup') return `prompt:${input.prompt ?? ''}`
  const command = String(input.command ?? '')
  const pr = /\bgh\s+pr\s+[a-z]+\s+#?(\d+)/.exec(command)?.[1]
  if (pr) return `pr:${pr}`
  const run = /\bgh\s+run\s+(?:watch|view)\s+(\d+)/.exec(command)?.[1]
  if (run) return `run:${run}`
  return command
    .replaceAll(/\bsleep\s+[\d.]+\s*;?/g, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
}

const timedOutText = (text) => /Command timed out after/.test(text)
/** The seconds a `timeout N` in the command allows; reaching them means it fired, whatever the exit code. */
const timeoutLimit = (input) =>
  Number(/(?:^|[^-\w])timeout\s+(\d+)\s/.exec(String(input?.command ?? ''))?.[1] ?? Infinity)
const movedId = (text) => /Command was moved to the background \(ID: (\w+)\)/.exec(text)?.[1]
const backgroundId = (text, toolUseResult) =>
  toolUseResult?.backgroundTaskId ??
  toolUseResult?.taskId ??
  /with ID: (\w+)|\(task (\w+)/.exec(text)?.slice(1).find(Boolean)

/** The text of a record that may carry a task notification: a queued, user or attachment line. */
const noticeText = (record) => {
  if (record.type === 'queue-operation') return String(record.content ?? '')
  if (record.type === 'attachment') return String(record.attachment?.prompt ?? '')
  if (record.type === 'user' && typeof record.message?.content === 'string') return record.message.content
  return ''
}

/** The task notifications that end their task: those with a status, and Monitor expiries. */
const endingNotices = (text) =>
  [...text.matchAll(/<task-notification>([\s\S]*?)<\/task-notification>/g)]
    .map(([, body]) => ({
      task: /<task-id>(\w+)<\/task-id>/.exec(body)?.[1],
      status: /<status>(\w+)<\/status>/.test(body),
      expired: body.includes('[Monitor expired'),
      // An expiry after events is a watch that ended; one that saw nothing waited in vain.
      empty: /\[Monitor expired\b[^\]]*\bwith (?:no|0) events?\b/.test(body),
    }))
    .filter((n) => n.task && (n.status || n.expired))

const seconds = (from, to) => (Date.parse(to) - Date.parse(from)) / 1000

export class WaitStats {
  constructor(weigh) {
    this.weigh = weigh // usage -> input-equivalent tokens
    this.calls = []
    this.costed = new Set()
    this.tokens = new Map()
  }

  /** A new transcript: its tool ids, task ids and wakeups are its own. */
  begin(agent) {
    this.agent = agent
    this.byToolId = new Map()
    this.tasks = new Map()
    this.wakeups = new Map()
    this.last = undefined
  }

  /** A tool call. A wait is recorded; any other call is something else happening between polls. */
  use(block, record) {
    const kind = waitKind(block.name, block.input)
    if (!kind) {
      this.interrupt()
      return
    }
    const target = waitTarget(block.name, block.input)
    const call = {
      kind,
      agent: this.agent,
      at: record.timestamp,
      limit: timeoutLimit(block.input),
      timedOut: false,
      repeat: false,
      moved: false,
    }
    const message = record.message?.id ?? record.uuid
    // Calls of one message run side by side: the second is no poll after the first.
    if (target && this.last?.target === target && this.last.message !== message) {
      call.repeat = true
    }
    this.last = { target, call, message }
    this.calls.push(call)
    this.byToolId.set(block.id, call)
    if (kind === 'wakeup') this.wakeups.set(String(block.input?.prompt ?? ''), call)
    this.cost(record, call)
  }

  /** The tokens of the message that issued the call, once per message, kind and agent. */
  cost(record, call) {
    const key = `${call.kind}\t${call.agent}`
    const once = `${record.message?.id ?? record.uuid}\t${key}`
    if (!record.message?.usage || this.costed.has(once)) return
    this.costed.add(once)
    this.tokens.set(key, (this.tokens.get(key) ?? 0) + this.weigh(record.message.usage))
  }

  result(block, record, text) {
    const call = this.byToolId.get(block.tool_use_id)
    if (!call) return
    if (timedOutText(text)) call.timedOut = true
    const moved = movedId(text)
    if (moved) {
      call.moved = true
      this.tasks.set(moved, call)
    } else if (call.kind === 'bash-background' || call.kind === 'monitor') {
      const task = backgroundId(text, record.toolUseResult)
      if (task) this.tasks.set(task, call)
    } else if (call.kind !== 'wakeup') {
      call.wall = seconds(call.at, record.timestamp)
      if (call.wall >= call.limit) call.timedOut = true
    }
  }

  /** A line that is no tool call or result: a notice may end a task, a user line breaks a poll run. */
  notice(record) {
    for (const n of endingNotices(noticeText(record))) {
      const call = this.tasks.get(n.task)
      if (!call) continue
      this.tasks.delete(n.task)
      call.wall = seconds(call.at, record.timestamp)
      if (n.empty) call.timedOut = true
    }
    if (record.type !== 'user' || typeof record.message?.content !== 'string') return
    this.interrupt()
    const wakeup = record.turnOrigin === 'scheduled' && this.wakeups.get(record.message.content)
    if (wakeup) {
      this.wakeups.delete(record.message.content)
      wakeup.wall = seconds(wakeup.at, record.timestamp)
    }
  }

  /** Something other than a tool call happened (a user line, a notice): the next poll is no repeat. */
  interrupt() {
    this.last = undefined
  }

  /** One row per kind and agent type; wall seconds over the calls whose end was seen. */
  summary() {
    const rows = new Map()
    for (const call of this.calls) {
      const key = `${call.kind}\t${call.agent}`
      const row = rows.get(key) ?? {
        kind: call.kind,
        agent: call.agent,
        calls: 0,
        wallSeconds: 0,
        wallMeasured: 0,
        timedOut: 0,
        repeats: 0,
        movedToBackground: 0,
        tokens: this.tokens.get(key) ?? 0,
      }
      row.calls += 1
      if (call.wall !== undefined) {
        row.wallSeconds += call.wall
        row.wallMeasured += 1
      }
      row.timedOut += Number(call.timedOut)
      row.repeats += Number(call.repeat)
      row.movedToBackground += Number(call.moved)
      rows.set(key, row)
    }
    return [...rows.values()]
      .map((row) => ({
        ...row,
        wallSeconds: row.wallMeasured ? Math.round(row.wallSeconds) : NOT_MEASURED,
      }))
      .sort(
        (a, b) => WAIT_KINDS.indexOf(a.kind) - WAIT_KINDS.indexOf(b.kind) || a.agent.localeCompare(b.agent, 'en')
      )
  }
}
