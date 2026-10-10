import type { Engine, OnScreen, Register } from 'claude-code'

import { matchPhrase, parseArgs } from './lib/parse'
import { countAgentMessages, lastPromptIndex, pickStart } from './lib/slice'
import { SYSTEM_PROMPT } from './lib/prompt'
import { deliveryFor } from './lib/actions'
import type { Button as Which } from './lib/actions'
import { placeReply } from './lib/reply'
import { remember } from './lib/dismiss'
import type { Dismissed } from './lib/dismiss'
import { present, textsFor } from './lib/present'
import type { Data } from './lib/present'
import { toPlainText } from './lib/render'
import type { Line } from './lib/render'
import { display, lookOf } from './lib/style'
import { summarize } from './lib/summarize'
import type { Reply } from './lib/summarize'
import { lowestVisible } from './lib/unread'
import type { Row } from './lib/unread'

const PANE = 'catchup'
const MAX_ROWS = 400

type Unread = { reason: 'many' | 'afk' | null; n: number; from: number }

/** Everything the mod remembers. It lives in memory only: no state, no store, no file. */
type Memory = {
  view: View
  // Open items the person marked handled, and whether the pane shows every section.
  dismissed: Dismissed[]
  expanded: boolean
  unread: Unread
  lastPromptAt: number
  dismissedAt: number
}

function freshMemory(now: number): Memory {
  return {
    view: { status: 'idle', lines: [], data: null, label: '', at: 0 },
    dismissed: [],
    expanded: false,
    unread: { reason: null, n: 0, from: 0 },
    lastPromptAt: now,
    dismissedAt: 0,
  }
}

type RowProps = { text?: string; tool_use_id?: string; onScreen?: OnScreen | null }

function number(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback
}

type Context = { model: string; running: AbortController | null }

type Surface = Parameters<Engine['ui']['copy']>[0]['surface']

/** Fills the prompt box with the reply template; the clipboard is the fallback. */
async function fillReply($: Engine, text: string, surface: Surface): Promise<void> {
  await placeReply(
    {
      read: () => $.prompt.read(),
      fill: input => $.prompt.fill(input),
      copy: t => $.ui.copy({ text: t, surface }),
      toast: message => $.ui.toast(message),
    },
    text,
  )
}

/** Marks an open item as handled, so it stays hidden from the pane, the handoff and the reply template. */
function dismissItem($: Engine, mem: Memory, item: Dismissed, runId: number | undefined): void {
  mem.dismissed = remember(mem.dismissed, { ...item, run: runId })
  $.ui.invalidate('ui.render')
}

type View = { status: 'idle' | 'working' | 'done' | 'error'; lines: Line[]; data: Data | null; label: string; at: number }

/** Sends a button's text where its table says: the clipboard, or (reply template only) the prompt box. */
async function deliver($: Engine, mem: Memory, which: Which, v: View, surface: Surface): Promise<void> {
  const handled = mem.dismissed
  const texts = v.data === null ? { text: toPlainText(v.lines), handoff: '', reply: '' } : textsFor(v.data, handled)
  const delivery = deliveryFor(which, texts)

  if (delivery.to === 'prompt-box') {
    await fillReply($, delivery.text, surface)

    return
  }

  const copied = await $.ui.copy({ text: delivery.text, surface })
  $.ui.toast(copied.isCopied ? delivery.done : 'Could not reach the clipboard.')
}

/** What to summarize: the last `n` messages, everything from an index, or (both empty) since the last prompt. */
type Range = { n: number | null; from?: number }

async function askModel($: Engine, prompt: string, model: string, signal: AbortSignal): Promise<Reply> {
  const r = await $.model.complete(
    { model, system: SYSTEM_PROMPT, prompt, maxTokens: 1800, effort: 'low', timeoutMs: 90_000 },
    { signal },
  )

  if (r.isAnswered) {
    return { ok: true, text: r.text.trim() }
  }

  return { ok: false, reason: r.reason === 'api-error' ? `the model call failed (${r.error})` : `the model call ended (${r.reason})` }
}

async function makeSummary($: Engine, mem: Memory, range: Range, mine: AbortController, model: string): Promise<void> {
  const all = await $.session.messages()
  const start = range.from !== undefined && range.from <= all.length ? range.from : pickStart(all, range.n)
  const picked = all.slice(start)
  const count = countAgentMessages(picked)
  const noun = (n: number): string => (n === 1 ? 'message' : 'messages')
  const label =
    range.from !== undefined
      ? `${count} new ${noun(count)}`
      : range.n === null
        ? `${count} ${noun(count)} since your last message`
        : `last ${picked.length} ${noun(picked.length)}`

  if (picked.length === 0) {
    const text = `No messages after your last prompt. Checked ${all.length} messages; your last prompt is number ${lastPromptIndex(all) + 1}.`
    mem.view = { status: 'done', lines: [{ tone: 'dim', text }], data: null, label, at: Date.now() }
    $.ui.invalidate('ui.render')

    return
  }

  const result = await summarize(picked, start + 1, prompt => askModel($, prompt, model, mine.signal))

  if (mine.signal.aborted) {
    return
  }

  const failed: Line[] = [{ tone: 'warn', text: result.ok ? '' : `Catch-up failed: ${result.reason}. Run it again.` }]
  const lines = result.ok ? result.lines : failed

  const data = result.ok && result.data !== undefined ? { ...result.data, run: Date.now() } : null

  mem.view = { status: result.ok ? 'done' : 'error', lines, data, label, at: Date.now() }
  $.ui.invalidate('ui.render')
}

/** Opens the pane at once and does the work on a timer, so the caller returns fast. */
async function begin($: Engine, mem: Memory, range: Range, ctx: Context): Promise<void> {
  ctx.running?.abort()
  const mine = new AbortController()
  ctx.running = mine

  await $.ui.open({ id: PANE, title: 'Catch-up' })
  const label = range.from !== undefined ? 'new messages' : range.n === null ? 'since your last message' : `last ${range.n} ${range.n === 1 ? 'message' : 'messages'}`
  mem.view = { status: 'working', lines: [], data: null, label, at: Date.now() }
  $.ui.invalidate('ui.render')
  mem.dismissedAt = (await $.session.messages()).length
  const begun = async (): Promise<void> => {
    await makeSummary($, mem, range, mine, ctx.model)
  }
  $.clock.after(0, begun)
}

export const register: Register = (on, options) => {
  const threshold = number(options.threshold, 8)
  const afkMs = number(options.afkMinutes, 10) * 60_000
  const model = typeof options.model === 'string' && options.model !== '' ? options.model : 'haiku'

  // A render hook may not write state: it fills this map and a timer reads it.
  const rows = new Map<string, Row>()
  let isDirty = true
  let ticks = 0
  let lastShown = ''
  const ctx: Context = { model, running: null }
  const mem = freshMemory(Date.now())

  function track(requestId: string, props: RowProps): void {
    // Rows with no viewport report (another surface) are never counted.
    const isOnScreen = props.onScreen !== undefined && props.onScreen !== null
    rows.set(requestId, { snip: (props.text ?? '').trim().slice(0, 60), toolUseId: props.tool_use_id ?? '', isOnScreen })

    if (rows.size > MAX_ROWS) {
      const oldest = rows.keys().next()

      if (oldest.done !== true) {
        rows.delete(oldest.value)
      }
    }

    isDirty = true
  }

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'catchup',
      description: 'Summarize the messages you have not read. Optional: a number of messages.',
    })

    $.clock.every(700, async () => {
      ticks += 1

      if (ticks % 30 === 0) {
        isDirty = true
      }

      if (!isDirty) {
        return
      }

      isDirty = false
      const all = await $.session.messages()
      const lowest = lowestVisible([...rows.values()], all)
      const belowFrom = lowest === null ? all.length : lowest + 1
      const below = countAgentMessages(all.slice(belowFrom))
      const sinceFrom = lastPromptIndex(all) + 1
      const since = countAgentMessages(all.slice(sinceFrom))
      const away = Date.now() - mem.lastPromptAt
      let shown: { reason: 'many' | 'afk' | null; n: number; from: number } = { reason: null, n: 0, from: 0 }

      if (all.length > mem.dismissedAt) {
        if (below >= threshold) {
          shown = { reason: 'many', n: below, from: belowFrom }
        } else if (since >= 1 && away >= afkMs) {
          shown = { reason: 'afk', n: since, from: sinceFrom }
        }
      }

      const key = `${shown.reason}:${shown.n}:${shown.from}`

      if (key !== lastShown) {
        lastShown = key
        mem.unread = shown
        $.ui.invalidate('ui.render')
      }
    })

    return next(e)
  })

  on('command.run', { command: 'catchup' }, async ($, e) => {
    const request = parseArgs(e.args)

    if ('error' in request) {
      return { text: request.error }
    }

    await begin($, mem, { n: request.n }, ctx)

    return { text: 'summary pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const request = matchPhrase(e.text)

    if (request === null) {
      if (e.origin.kind === 'composer') {
        mem.lastPromptAt = Date.now()
        isDirty = true
      }

      return next(e)
    }

    await begin($, mem, { n: request.n }, ctx)

    return { drop: 'summary pane opened.' }
  })

  // /clear, /resume and /branch start another conversation: forget the summary of the old one.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    Object.assign(mem, freshMemory(Date.now()))
    rows.clear()
    lastShown = ''
    isDirty = true
    $.ui.invalidate('ui.render')

    return next(e)
  })

  on('session.append', ($, e, next) => {
    isDirty = true

    return next(e)
  })

  on('ui.render', { component: 'UserMessage' }, ($, e, next) => {
    track(String(e.requestId), e.props)

    return next(e)
  })

  on('ui.render', { component: 'AssistantMessage' }, ($, e, next) => {
    track(String(e.requestId), e.props)

    return next(e)
  })

  on('ui.render', { component: 'ToolUse' }, ($, e, next) => {
    track(String(e.requestId), e.props)

    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const u = mem.unread

    if (e.props.hasSurvey || u.reason === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const why = u.reason === 'many' ? `${u.n} new messages below. ` : `${u.n} messages since your last message. `

    return (
      <Box>
        <Text dimColor>{why}</Text>
        <Button key="catchup" label={`Catch up (${u.n})`} onPress={() => begin($, mem, { n: u.n, from: u.from }, ctx)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const v = mem.view
    const handled = mem.dismissed
    const isOpen = mem.expanded
    const isDone = v.status === 'done' || v.status === 'error'
    const data = v.data ?? null
    const shown = data === null ? { lines: v.lines ?? [], hidden: 0 } : present(data, handled, isOpen)
    const texts = data === null ? null : textsFor(data, handled)
    const canDismiss = shown.lines.some(l => l.dismiss !== undefined)

    // Draw every line: the engine scrolls the body, so a cut here would hide text with no way to reach it.
    return (
      <Box flexDirection="column">
        <Text bold>Catch-up: {v.label}</Text>
        {v.status === 'working' && <Text dimColor>Reading the messages...</Text>}
        {v.status === 'idle' && <Text dimColor>Run /catchup, or type "brief me".</Text>}
        {isDone &&
          shown.lines.map((line, i) => {
            const look = lookOf(line)
            const item = line.dismiss
            const text = (
              <Text bold={look.bold} color={look.color} inverse={look.inverse} dimColor={look.dim}>
                {display(line)}
              </Text>
            )

            return item === undefined ? (
              text
            ) : (
              <Box>
                <Button key={`done:${i}`} label="✓" onPress={() => dismissItem($, mem, item, data === null ? undefined : data.run)} />
                {text}
              </Box>
            )
          })}
        {isDone && canDismiss && <Text dimColor>✓ marks an item as handled and hides it from now on.</Text>}
        {isDone && shown.lines.length > 8 && <Text dimColor>Tab to focus this pane. Arrow keys scroll. [#n] is a message number.</Text>}
        <Box flexWrap="wrap" gap={1}>
          <Button key="again" label="Run again" onPress={() => begin($, mem, { n: null }, ctx)} />
          {isDone && <Button key="copy" label="Copy" onPress={() => deliver($, mem, 'copy', v, e.surface)} />}
          {isDone && data !== null && <Button key="expand" label={isOpen ? 'Show less' : 'Show all'} onPress={() => { mem.expanded = !mem.expanded; $.ui.invalidate('ui.render') }} />}
          {isDone && shown.hidden > 0 && <Button key="restore" label={`Show hidden (${shown.hidden})`} onPress={() => { mem.dismissed = []; $.ui.invalidate('ui.render') }} />}
        </Box>
        {isDone && texts !== null && texts.handoff !== '' && (
          <Box flexDirection="column">
            <Box>
              <Button key="handoff" label="Copy handoff" onPress={() => deliver($, mem, 'handoff', v, e.surface)} />
            </Box>
            <Text dimColor>  Clipboard only. Paste it into a new session.</Text>
            {texts.reply !== '' && (
              <Box>
                <Button key="reply" label="Reply template" onPress={() => deliver($, mem, 'reply', v, e.surface)} />
              </Box>
            )}
            {texts.reply !== '' && <Text dimColor>  Fills the prompt box. You edit it there, then press Enter.</Text>}
          </Box>
        )}
      </Box>
    )
  })
}
