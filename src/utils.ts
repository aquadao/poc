export const BASE_APY = 4 // 400%
export const RATE_PER_UPDATE = Math.pow(BASE_APY + 1, 1 / (365 * 24)) - 1

export const enum TokenSymbol {
  ACA = 'ACA',
  DOT = 'DOT',
  aUSD = 'aUSD',
  lcDOT = 'lcDOT',
  LDOT = 'LDOT',
  DAO = 'DAO',
  sDAO = 'sDAO',
}

export type LPToken = `${keyof typeof TokenSymbol}-${keyof typeof TokenSymbol}`

export type CurrencyId = keyof typeof TokenSymbol | LPToken

let eventLevel = 0

export const log = (msg: string, args: Object) => {
  console.log(
    '  '.repeat(eventLevel),
    msg,
    Object.entries(args)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
  )
}

export const withEvent = <R>(event: string, args: Object, fn: () => R) => {
  log(event, args)
  eventLevel++
  try {
    return fn()
  } finally {
    eventLevel--
    if (eventLevel === 0) {
      console.log()
    }
  }
}

export const toLPToken = (a: TokenSymbol, b: TokenSymbol) => {
  const pair = [a, b]
  pair.sort()
  return `${pair[0]}-${pair[1]}` as LPToken
}

export const parseLPToken = (token: CurrencyId) => {
  const [a, b] = token.split('-')
  if (b == null) {
    return false
  }
  return [a, b] as [TokenSymbol, TokenSymbol]
}

export const normalize = (n: number) => (Math.abs(n) < 0.000001 ? 0 : n)
