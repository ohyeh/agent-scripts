import type { Register } from 'claude-code'

// T0c scaffold: loads and passes events through. Watch, poll and wake land in T2-T8.
export const register: Register = on => {
  on('session.start', async ($, e, next) => next(e))
}
