#!/usr/bin/env bash
# Runs the using-grok-bot-app node --test suites (no app, no network).
cd "$(dirname "$0")/../skills/using-grok-bot-app/scripts" || exit 1
exec node --test ensure.test.mjs send.test.mjs sidebar.test.mjs transcript.test.mjs lib/tui.test.ts
