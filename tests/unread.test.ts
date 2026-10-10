import { expect, test } from 'claude-code/testing'

import { countBelow, lowestVisible } from '../hooks/lib/unread'
import type { Row } from '../hooks/lib/unread'
import { agent, user } from './helpers'

const messages = [user('alpha'), agent('bravo'), user('charlie'), agent('delta'), agent('echo'), agent('foxtrot')]

const on = (snip: string): Row => ({ snip, toolUseId: '', isOnScreen: true })
const off = (snip: string): Row => ({ snip, toolUseId: '', isOnScreen: false })

test('the lowest row on screen sets how many are below', () => {
  expect(countBelow([on('bravo'), on('charlie'), on('delta')], messages)).toBe(2)
})

test('the last message on screen means 0 below', () => {
  expect(countBelow([on('foxtrot')], messages)).toBe(0)
})

test('rows off screen are ignored', () => {
  expect(countBelow([on('bravo'), off('foxtrot')], messages)).toBe(4)
})

test('no row on screen means unknown', () => {
  expect(countBelow([off('bravo')], messages)).toBe(null)
  expect(countBelow([], messages)).toBe(null)
})

test('a row that matches several messages takes the match nearest the sure rows', () => {
  const quoted = [user('start'), agent('the word delta here'), agent('mid'), agent('later: the word delta here'), agent('end')]
  // 'mid' is sure (index 2); 'delta' matches 1 and 3; 3 is as near as 1, reduce keeps the first, so the sure row decides.
  expect(countBelow([on('mid'), on('the word delta here')], quoted)).toBe(2)
  // a sure row at 3 pulls the ambiguous row to 3, not to 1.
  expect(countBelow([on('end'), on('the word delta here')], quoted)).toBe(0)
})

test('a tool row is found by its call id', () => {
  const rows = [user('go'), agent('', [{ tool_use_id: 'abc', tool: 'Bash', input: {} }]), agent('done')]

  expect(countBelow([{ snip: '', toolUseId: 'abc', isOnScreen: true }], rows)).toBe(1)
})

test('the lowest visible index is where a range from the screen starts', () => {
  expect(lowestVisible([on('bravo'), on('delta')], messages)).toBe(3)
  expect(lowestVisible([off('delta')], messages)).toBe(null)
})
