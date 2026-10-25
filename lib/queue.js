const limit = () => Math.max(1, Number(process.env.MAX_CONCURRENCY || 1))

let active = 0
const waiters = []

export async function withSlot(fn) {
  const max = limit()
  if (active >= max) await new Promise((r) => waiters.push(r))
  active++
  try {
    return await fn()
  } finally {
    active--
    const next = waiters.shift()
    if (next) next()
  }
}

export const stats = () => ({ active, queued: waiters.length })
