import Blockchain from './blockchain'
import { CurrencyId, LPToken, parseLPToken, TokenSymbol, toLPToken, withEvent } from './utils'

export default class Oracle {
  prices = {
    [TokenSymbol.ACA]: 3,
    [TokenSymbol.DOT]: 30,
    [TokenSymbol.aUSD]: 1,
    [TokenSymbol.lcDOT]: 20,
  }

  averagingPeriod = 3 * 24 // 3 day
  aggregatedPrice = {} as Record<TokenSymbol, number>

  constructor(public state: Blockchain) {}

  getTokenPrice(token: TokenSymbol) {
    if (token === TokenSymbol.sDAO) {
      return this.getTokenPrice(TokenSymbol.aDAO) * this.state.stoken.fromStakedToken(1)
    }
    if (token === TokenSymbol.aDAO) {
      const aggregatedPrice = this.aggregatedPrice[toLPToken(TokenSymbol.aDAO, TokenSymbol.aUSD)]
      if (!aggregatedPrice) {
        return this.state.dex.getPrice(TokenSymbol.aDAO, TokenSymbol.aUSD)
      }
      return aggregatedPrice / this.averagingPeriod
    }
    if (this.prices[token] == null) {
      throw new Error(`Token price not available for ${token}`)
    }
    return this.prices[token]
  }

  getPrice(currency: CurrencyId) {
    const pair = parseLPToken(currency)
    if (pair) {
      const price0 = this.getTokenPrice(pair[0])
      const price1 = this.getTokenPrice(pair[1])
      const lpAddr = this.state.dex.lpAccount(currency as LPToken).address
      const pool0 = this.state.tokens.balances[lpAddr][pair[0]]
      const pool1 = this.state.tokens.balances[lpAddr][pair[1]]
      return ((Math.sqrt(pool0 * pool1) * Math.sqrt(price0 * price1)) / this.state.tokens.total[currency]) * 2
    }
    return this.getTokenPrice(currency as TokenSymbol)
  }

  updateTokenPrice(token: TokenSymbol, price: number) {
    withEvent(`updateTokenPrice`, { token, price }, () => {
      this.prices[token] = price
    })
  }

  onUpdate() {
    withEvent(`Oracle.onUpdate`, {}, () => {
      const daoPrice = this.state.dex.getPrice(TokenSymbol.aDAO, TokenSymbol.aUSD)
      const lp = toLPToken(TokenSymbol.aDAO, TokenSymbol.aUSD)
      if (!this.aggregatedPrice[lp]) {
        this.aggregatedPrice[lp] = daoPrice * this.averagingPeriod
      } else {
        this.aggregatedPrice[lp] *= (this.averagingPeriod - 1) / this.averagingPeriod
        this.aggregatedPrice[lp] += daoPrice
      }
    })
  }

  printInfo() {
    console.log('Oracle info')
    console.table(this.prices)
  }
}
