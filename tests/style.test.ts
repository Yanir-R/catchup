import { expect, test } from 'claude-code/testing'

import type { Line } from '../hooks/lib/render'
import { display, lookOf } from '../hooks/lib/style'

const line = (tone: Line['tone'], section?: Line['section'], text = 'x'): Line => ({ tone, section, text })

test('NEEDS YOU is a solid colored bar and the next step is bold and colored', () => {
  expect(lookOf(line('label', 'needs'))).toEqual({ bold: true, color: 'warning', inverse: true })
  expect(lookOf(line('item', 'next'))).toEqual({ bold: true, color: 'suggestion' })
})

test('each section has its own color', () => {
  const colors = (['needs', 'failed', 'done', 'fixed', 'running', 'unchecked', 'decided', 'next'] as const).map(s => lookOf(line('label', s)).color)

  expect(new Set(colors).size).toBe(8)
  expect(colors.every(c => typeof c === 'string')).toBe(true)
})

test('only theme keys are used, so the colors follow the person theme', () => {
  const theme = ['warning', 'error', 'success', 'inactive', 'permission', 'remember', 'merged', 'suggestion']

  for (const s of ['needs', 'failed', 'done', 'fixed', 'running', 'unchecked', 'decided', 'next'] as const) {
    expect(theme.includes(lookOf(line('label', s)).color ?? '')).toBe(true)
  }
})

test('the question you must answer is bold; its details are dim', () => {
  expect(lookOf(line('item', 'needs')).bold).toBe(true)
  expect(lookOf(line('sub', 'needs'))).toEqual({ dim: true })
  expect(lookOf(line('dim'))).toEqual({ dim: true })
  expect(lookOf(line('item', 'done'))).toEqual({})
})

test('labels carry a symbol, so sections differ without color', () => {
  const symbols = (['needs', 'failed', 'done', 'fixed', 'running', 'unchecked', 'decided'] as const).map(s => display(line('label', s, 'LABEL')).trim()[0])

  expect(new Set(symbols).size).toBe(7)
  expect(display(line('label', 'needs', 'NEEDS YOU (2)'))).toBe(' ▶ NEEDS YOU (2) ')
  expect(display(line('item', 'next', 'Next: go'))).toBe('→ Next: go')
  expect(display(line('sub', 'needs', 'Options: A'))).toBe('   Options: A')
})

test('the recommendation line is green and bold, so it stands out from the options', () => {
  expect(lookOf(line('rec', 'needs'))).toEqual({ bold: true, color: 'success' })
  expect(display(line('rec', 'needs', '★ Recommended: B'))).toBe('   ★ Recommended: B')
})

test('FAILED is a solid red bar like NEEDS YOU, so it can be read on a dark pane', () => {
  expect(lookOf(line('label', 'failed'))).toEqual({ bold: true, color: 'error', inverse: true })
  expect(lookOf(line('label', 'done')).inverse).toBe(false)
})
