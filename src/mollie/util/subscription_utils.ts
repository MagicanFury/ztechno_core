export type SubscriptionIntervalUnit = 'day' | 'week' | 'month'

export type ParsedSubscriptionInterval = {
  count: number
  unit: SubscriptionIntervalUnit
}

const pad = (value: number) => (value < 10 ? `0${value}` : String(value))

export function parseSubscriptionInterval(input: string): ParsedSubscriptionInterval {
  const normalized = String(input || '').trim().toLowerCase()
  const match = normalized.match(/^(\d+)\s*(day|days|week|weeks|month|months)$/)
  if (!match) {
    throw new Error(`Invalid interval "${input}". Expected "N days", "N weeks" or "N months".`)
  }
  const count = Number(match[1])
  if (!Number.isFinite(count) || count <= 0) {
    throw new Error(`Invalid interval count "${match[1]}".`)
  }
  const unitRaw = match[2]
  const unit: SubscriptionIntervalUnit = unitRaw.startsWith('day')
    ? 'day'
    : unitRaw.startsWith('week')
      ? 'week'
      : 'month'
  return { count, unit }
}

export function addSubscriptionInterval(date: Date, interval: ParsedSubscriptionInterval): Date {
  const out = new Date(date.getTime())
  if (interval.unit === 'day') {
    out.setUTCDate(out.getUTCDate() + interval.count)
  } else if (interval.unit === 'week') {
    out.setUTCDate(out.getUTCDate() + interval.count * 7)
  } else {
    out.setUTCMonth(out.getUTCMonth() + interval.count)
  }
  return out
}

export function formatDateOnly(date: Date): string {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}
