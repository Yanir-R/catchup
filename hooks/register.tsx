import { atom, read, update } from 'claude-code'
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

const view = atom({ plugin: 'catchup', key: 'view' } as const, {
  status: 'idle' as const,
  lines: [],
  data: null,
  label: '',
  at: 0,
})
// Open items the person marked handled, and whether the pane shows every section. Both last for the session.
const dismissed = atom({ plugin: 'catchup', key: 'dismissed' } as const, [])
const expanded = atom({ plugin: 'catchup', key: 'expanded' } as const, false)
const unread = atom({ plugin: 'catchup', key: 'unread' } as const, { reason: null, n: 0, from: 0 })
const lastPromptAt = atom({ plugin: 'catchup', key: 'lastPromptAt' } as const, 0)
const dismissedAt = atom({ plugin: 'catchup', key: 'dismissedAt' } as const, 0)

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
async function dismissItem($: Engine, item: Dismissed): Promise<void> {
  await update($, dismissed, list => remember(list, item))
}

type View = { status: 'idle' | 'working' | 'done' | 'error'; lines: Line[]; data: Data | null; label: string; at: number }

/** Sends a button's text where its table says: the clipboard, or (reply template only) the prompt box. */
async function deliver($: Engine, which: Which, v: View, surface: Surface): Promise<void> {
  const handled = await read($, dismissed)
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

async function run($: Engine, range: Range, mine: AbortController, model: string): Promise<void> {
  const all = await $.session.messages()
  const start = range.from !== undefined && range.from <= all.length ? range.from : pickStart(all, range.n)
  const picked = all.slice(start)
  const count = countAgentMessages(picked)
  const label =
    range.from !== undefined
      ? `${count} new messages`
      : range.n === null
        ? `${count} messages since your last message`
        : `last ${picked.length} messages`

  if (picked.length === 0) {
    const text = `No messages after your last prompt. Checked ${all.length} messages; your last prompt is number ${lastPromptIndex(all) + 1}.`
    await update($, view, () => ({ status: 'done', lines: [{ tone: 'dim', text }], data: null, label, at: Date.now() }))

    return
  }

  const result = await summarize(picked, start + 1, prompt => askModel($, prompt, model, mine.signal))

  if (mine.signal.aborted) {
    return
  }

  const failed: Line[] = [{ tone: 'warn', text: result.ok ? '' : `Catch-up failed: ${result.reason}. Run it again.` }]
  const lines = result.ok ? result.lines : failed

  const data = result.ok && result.data !== undefined ? result.data : null

  await update($, view, () => ({ status: result.ok ? 'done' : 'error', lines, data, label, at: Date.now() }))
}

/** Opens the pane at once and does the work on a timer, so the caller returns fast. */
async function begin($: Engine, range: Range, ctx: Context): Promise<void> {
  ctx.running?.abort()
  const mine = new AbortController()
  ctx.running = mine

  await $.ui.open({ id: PANE, title: 'Catch-up' })
  await update($, view, () => ({ status: 'working', lines: [], data: null, label: range.from !== undefined ? 'new messages' : range.n === null ? 'since your last message' : `last ${range.n} messages`, at: Date.now() }))
  const total = (await $.session.messages()).length
  await update($, dismissedAt, () => total)
  $.clock.after(0, () => void run($, range, mine, ctx.model))
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

    if ((await read($, lastPromptAt)) === 0) {
      await update($, lastPromptAt, () => Date.now())
    }

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
      const dismissed = await read($, dismissedAt)
      const away = Date.now() - (await read($, lastPromptAt))
      let shown: { reason: 'many' | 'afk' | null; n: number; from: number } = { reason: null, n: 0, from: 0 }

      if (all.length > dismissed) {
        if (below >= threshold) {
          shown = { reason: 'many', n: below, from: belowFrom }
        } else if (since >= 1 && away >= afkMs) {
          shown = { reason: 'afk', n: since, from: sinceFrom }
        }
      }

      const key = `${shown.reason}:${shown.n}:${shown.from}`

      if (key !== lastShown) {
        lastShown = key
        await update($, unread, () => shown)
      }
    })

    return next(e)
  })

  on('command.run', { command: 'catchup' }, async ($, e) => {
    const request = parseArgs(e.args)

    if ('error' in request) {
      return { text: request.error }
    }

    await begin($, { n: request.n }, ctx)

    return { text: 'summary pane opened.' }
  })

  on('prompt.submit', async ($, e, next) => {
    const request = matchPhrase(e.text)

    if (request === null) {
      if (e.origin.kind === 'composer') {
        await update($, lastPromptAt, () => Date.now())
        isDirty = true
      }

      return next(e)
    }

    await begin($, { n: request.n }, ctx)

    return { drop: 'summary pane opened.' }
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
    const u = await read($, unread)

    if (e.props.hasSurvey || u.reason === null) {
      return next(e)
    }

    const { Box, Button, Text } = $.ui.resolve(e)
    const why = u.reason === 'many' ? `${u.n} new messages below. ` : `${u.n} messages since your last message. `

    return (
      <Box>
        <Text dimColor>{why}</Text>
        <Button key="catchup" label={`Catch up (${u.n})`} onPress={() => begin($, { n: u.n, from: u.from }, ctx)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const v = await read($, view)
    const handled = await read($, dismissed)
    const isOpen = await read($, expanded)
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
                <Button key={`done:${i}`} label="✓" onPress={() => dismissItem($, item)} />
                {text}
              </Box>
            )
          })}
        {isDone && canDismiss && <Text dimColor>✓ marks an item as handled and hides it from now on.</Text>}
        {isDone && shown.lines.length > 8 && <Text dimColor>Tab to focus this pane. Arrow keys scroll. [#n] is a message number.</Text>}
        <Box flexWrap="wrap" gap={1}>
          <Button key="again" label="Run again" onPress={() => begin($, { n: null }, ctx)} />
          {isDone && <Button key="copy" label="Copy" onPress={() => deliver($, 'copy', v, e.surface)} />}
          {isDone && data !== null && <Button key="expand" label={isOpen ? 'Show less' : 'Show all'} onPress={() => update($, expanded, open => !open)} />}
          {isDone && shown.hidden > 0 && <Button key="restore" label={`Show hidden (${shown.hidden})`} onPress={() => update($, dismissed, () => [])} />}
        </Box>
        {isDone && texts !== null && texts.handoff !== '' && (
          <Box flexDirection="column">
            <Box>
              <Button key="handoff" label="Copy handoff" onPress={() => deliver($, 'handoff', v, e.surface)} />
            </Box>
            <Text dimColor>  Clipboard only. Paste it into a new session.</Text>
            {texts.reply !== '' && (
              <Box>
                <Button key="reply" label="Reply template" onPress={() => deliver($, 'reply', v, e.surface)} />
              </Box>
            )}
            {texts.reply !== '' && <Text dimColor>  Fills the prompt box. You edit it there, then press Enter.</Text>}
          </Box>
        )}
      </Box>
    )
  })
}
