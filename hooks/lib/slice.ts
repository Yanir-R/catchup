import type { SessionMessage } from 'claude-code'

// Rows the engine stores as user messages that the person did not type.
const NOT_A_PROMPT = ['<command-', '<local-command', '<cross-session-message', '<system-reminder', '[SYSTEM']

/** True for a message the person typed. */
export function isPrompt(m: SessionMessage): boolean {
  if (m.role !== 'user' || (m.toolResults?.length ?? 0) > 0) {
    return false
  }

  const text = m.text.trim()

  return text !== '' && !NOT_A_PROMPT.some(start => text.startsWith(start))
}

/** Where the person's last prompt is, or -1. */
export function lastPromptIndex(messages: readonly SessionMessage[]): number {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (isPrompt(messages[i])) {
      return i
    }
  }

  return -1
}

/** Everything after the person's last prompt. */
export function sinceLastPrompt(messages: readonly SessionMessage[]): SessionMessage[] {
  return messages.slice(lastPromptIndex(messages) + 1)
}

// Messages from another session or a background task arrive as user rows.
const FROM_OTHERS = ['<cross-session-message', '<task-notification']

/**
 * True for what a person reads as one message from an agent: an assistant
 * message with text, or a message another session or a task sent. Tool calls,
 * tool results, the person's own prompts and command rows are not messages
 * in this sense: one reply that runs many tools is still one message.
 */
export function isAgentMessage(m: SessionMessage): boolean {
  const text = m.text.trim()

  if (m.role === 'assistant') {
    return text !== ''
  }

  return FROM_OTHERS.some(start => text.startsWith(start))
}

export function countAgentMessages(messages: readonly SessionMessage[]): number {
  return messages.filter(isAgentMessage).length
}

/** Where the range starts: `n` from the end, or just after the last prompt when `n` is null. */
export function pickStart(messages: readonly SessionMessage[], n: number | null): number {
  return n === null ? lastPromptIndex(messages) + 1 : Math.max(0, messages.length - n)
}

/** The last `n` messages, or all messages since the last prompt when `n` is null. */
export function pick(messages: readonly SessionMessage[], n: number | null): SessionMessage[] {
  return messages.slice(pickStart(messages, n))
}
