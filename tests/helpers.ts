import type { SessionMessage } from 'claude-code'

export function user(text: string): SessionMessage {
  return { role: 'user', text, toolUses: [] }
}

export function agent(text: string, toolUses: SessionMessage['toolUses'] = []): SessionMessage {
  return { role: 'assistant', text, toolUses }
}

export function toolResult(): SessionMessage {
  return { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 't1', text: 'ok', isError: false, result: null }] }
}
