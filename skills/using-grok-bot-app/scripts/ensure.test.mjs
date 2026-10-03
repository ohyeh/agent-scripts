// node --test skills/using-grok-bot-app/scripts/ensure.test.mjs — what ensure.mjs decides from /json/list.
// Starting and stopping the app is checked live (it quits the real app).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { judge } from './ensure.mjs'

const renderer = { type: 'page', url: 'file:///Applications/Grok%20Bot.app/Contents/Resources/app.asar/dist/renderer/index.html' }

test('nothing listening → down (restart or launch)', () => assert.equal(judge(null), 'down'))
test('the renderer answers → ok (nothing done)', () => assert.equal(judge([renderer]), 'ok'))
test('listening with no page → no-window (reopen, no restart)', () => assert.equal(judge([]), 'no-window'))
test('another app on the port → taken (never killed)', () => assert.equal(judge([{ type: 'page', url: 'http://localhost:3000/' }]), 'taken'))
