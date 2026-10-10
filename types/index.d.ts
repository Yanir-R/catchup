export type CatchupDismissed = { text: string; src: number[]; run?: number }

export type CatchupLine = {
  tone: 'head' | 'label' | 'item' | 'sub' | 'rec' | 'dim' | 'warn'
  text: string
  section?: 'next' | 'needs' | 'failed' | 'done' | 'fixed' | 'running' | 'unchecked' | 'decided'
  /** The open item this line stands for, so a button can mark it handled. */
  dismiss?: CatchupDismissed
}

export type CatchupSummary = {
  headline: string
  decisions: Array<{ ask: string; options: string[]; recommend: string | null; ifIgnored: string | null; src: number[]; kind?: 'decide' | 'do' }>
  failed: Array<{ text: string; fixed: boolean; src: number[] }>
  done: Array<{ text: string; proof: string | null; src: number[] }>
  running: Array<{ text: string; src: number[] }>
  notChecked: Array<{ text: string; why: string | null; src: number[] }>
  decided: Array<{ text: string; src: number[] }>
  next: string | null
}

export type CatchupData = {
  summary: CatchupSummary
  range: { first: number; last: number; agentMessages: number }
  /** Identifies this summary, so a handled item is matched exactly within it and loosely in a later run. */
  run?: number
}

export type CatchupView = {
  status: 'idle' | 'working' | 'done' | 'error'
  /** Lines drawn when there is no structured summary: a failure, a raw answer, an empty range. */
  lines: CatchupLine[]
  /** The structured summary. The pane draws it, so a dismissal or a toggle needs no new model call. */
  data: CatchupData | null
  label: string
  at: number
}

export type CatchupUnread = {
  /** Why the button shows: many messages below the screen, or you were away. */
  reason: 'many' | 'afk' | null
  /** How many agent messages the button will summarize. */
  n: number
  /** Where its range starts in the session's messages. */
  from: number
}

declare module 'claude-code' {
  interface PluginState {
    catchup: {
      view: CatchupView
      unread: CatchupUnread
      lastPromptAt: number
      dismissedAt: number
      dismissed: CatchupDismissed[]
      expanded: boolean
    }
  }
}
