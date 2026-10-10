/** Where a button sends its text. Only one button may write to the prompt box. */
export type Delivery = { to: 'clipboard'; text: string; done: string } | { to: 'prompt-box'; text: string }

export type Button = 'copy' | 'handoff' | 'reply'

type Texts = { text?: string; handoff?: string; reply?: string }

/**
 * The delivery of each button. Copy and Copy handoff go to the clipboard and
 * nothing else; the reply template is the one that fills the prompt box, so the
 * person can edit it there. Keeping this a table makes the rule easy to check.
 */
export function deliveryFor(button: Button, v: Texts): Delivery {
  switch (button) {
    case 'copy':
      return { to: 'clipboard', text: v.text ?? '', done: 'The summary is on the clipboard.' }
    case 'handoff':
      return { to: 'clipboard', text: v.handoff ?? '', done: 'The handoff is on the clipboard. Paste it into a new session.' }
    case 'reply':
      return { to: 'prompt-box', text: v.reply ?? '' }
  }
}
