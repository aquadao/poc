import Account from './account'
import Blockchain from './blockchain'
import { withEvent, toLPToken, TokenSymbol, LPToken, CurrencyId, parseLPToken, log, RATE_PER_UPDATE } from './utils'
import Oracle from './oracle'

interface Subscription {
  currency: CurrencyId
  amount: number
  vestingPeriod: number // hours
  duration: number // hours
  minPrice: number
  discountParameters: {
    initialDiscount: number // signed number, could be negative
    maxDiscount: number
    // start increase discount if no new subscription for this period
    idleIncreasePeriod: number // hour
    // the amount of discount increase
    idleIncreasePercentage: number
    // every unit sold will reduce discount by this percentage.
    // the final discount could be negative which means people better buy it from market
    decreasePercentagePerUnit: number
  }
}

interface SubscriptionDetails extends Subscription {
  soldAmount: number
  lastTradeTime: number
  lastDiscount: number
}

export default class Dao {
  account: Account
  backing = {
    [TokenSymbol.aUSD]: 0.6,
    [TokenSymbol.lcDOT]: 0.02,
  }

  subscriptions = {} as Record<number, SubscriptionDetails>
  nextSubscriptionId = 0

  oracle: Oracle

  constructor(public state: Blockchain) {
    this.account = new Account('DAO', state)
    this.oracle = new Oracle(state)
  }

  mint(to: Account, amount: number) {
    return withEvent(`mint`, { to, amount }, () => {
      this.state.tokens.deposit(TokenSymbol.DAO, to.address, amount)
      this.checkInvariant()
    })
  }

  subscribe(origin: Account, subId: number, paymentAmount: number, minReceiveAmount: number) {
    return withEvent(`subscribe`, { subId, paymentAmount, minReceiveAmount }, () => {
      const sub = this.subscriptions[subId]
      if (!sub) {
        throw new Error(`Subscription ${subId} does not exist`)
      }

      origin.transfer(sub.currency, this.account, paymentAmount)

      const daoPrice = this.state.oracle.getPrice(TokenSymbol.DAO)
      const paymentValue = this.oracle.getPrice(sub.currency) * paymentAmount

      const idlePeriodCount = Math.floor(
        (this.state.now - sub.lastTradeTime) / sub.discountParameters.idleIncreasePeriod
      )
      const discountIncrease = idlePeriodCount * sub.discountParameters.idleIncreasePercentage
      // TODO: consider take current discount into account that the hight the discount, the faster decreasing
      const discountDecrease = sub.soldAmount * sub.discountParameters.decreasePercentagePerUnit
      const discount = Math.min(
        sub.discountParameters.maxDiscount,
        sub.lastDiscount + discountIncrease - discountDecrease
      )

      const discountedPrice = daoPrice * (1 - discount)
      const startPrice = Math.max(discountedPrice, sub.minPrice)

      const inc = daoPrice * sub.discountParameters.decreasePercentagePerUnit
      const finalAmount = (Math.sqrt(2 * inc * paymentValue + startPrice ** 2) - startPrice) / inc

      const remainingAmount = sub.amount - sub.soldAmount
      if (finalAmount > remainingAmount) {
        throw new Error(`Subscription ${subId} is full`)
      }

      if (finalAmount < minReceiveAmount) {
        throw new Error(`Not enough amount to receive: ${finalAmount} < ${minReceiveAmount}`)
      }

      sub.soldAmount += finalAmount
      sub.lastTradeTime = this.state.now

      this.state.stoken.mint(origin, finalAmount)

      this.checkInvariant()

      const marketPrice = this.state.dex.getPrice(TokenSymbol.DAO, TokenSymbol.aUSD)
      const soldPrice = paymentValue / finalAmount

      log('subscription sold', {
        subId,
        soldAmount: finalAmount,
        soldPrice,
        marketPrice,
        discount: 1 - soldPrice / marketPrice,
      })

      return finalAmount
    })
  }

  createSubscription(sub: Subscription) {
    return withEvent(`createSubscription`, sub, () => {
      const id = this.nextSubscriptionId++
      this.subscriptions[id] = {
        ...sub,
        soldAmount: 0,
        lastTradeTime: this.state.now,
        lastDiscount: sub.discountParameters.initialDiscount,
      }
      return id
    })
  }

  private checkInvariant() {
    const debt = this.state.tokens.total[this.account.address]
    const totalReserve = this.totalReserve()
    if (totalReserve <= debt) {
      throw new Error(`DAO reserve is too low: ${totalReserve} < ${debt}`)
    }
  }

  totalReserve() {
    const assets = Object.entries(this.state.tokens.balances[this.account.address])
    const totalBackingAmount = Object.fromEntries(Object.keys(this.backing).map((currency) => [currency, 0])) as Record<
      CurrencyId,
      number
    >
    for (const [currency, amount] of assets) {
      const backingAmount = this.backingAmount(currency as CurrencyId, amount)
      for (const [currency, value] of Object.entries(backingAmount)) {
        totalBackingAmount[currency] += value
      }
    }
    const daoAmount = assets[TokenSymbol.DAO] || 0
    return Math.min(...Object.values(totalBackingAmount)) + daoAmount
  }

  backingAmount(currency: CurrencyId, amount: number) {
    if (currency === TokenSymbol.DOT) {
      currency = TokenSymbol.lcDOT
    }
    if (this.isBackingAsset(currency)) {
      return { [currency]: amount / this.backing[currency] }
    }
    if (currency === toLPToken(TokenSymbol.aUSD, TokenSymbol.DAO)) {
      const total = this.state.tokens.total[currency] ?? 0
      const [a, b] = currency.split('-')
      const pool0 = this.state.tokens.balances[this.state.dex.lpAccount(currency).address][a]
      const pool1 = this.state.tokens.balances[this.state.dex.lpAccount(currency).address][b]
      const value = ((Math.sqrt(pool0 * pool1) * amount) / total) * 2
      return {
        [TokenSymbol.aUSD]: value / this.backing[TokenSymbol.aUSD],
      }
    }
    if (currency === toLPToken(TokenSymbol.lcDOT, TokenSymbol.DOT)) {
      const total = this.state.tokens.total[currency] ?? 0
      const [a, b] = currency.split('-')
      const pool0 = this.state.tokens.balances[this.state.dex.lpAccount(currency).address][a]
      const pool1 = this.state.tokens.balances[this.state.dex.lpAccount(currency).address][b]
      const value = ((Math.sqrt(pool0 * pool1) * amount) / total) * 2
      return {
        [TokenSymbol.lcDOT]: value / this.backing[TokenSymbol.lcDOT],
      }
    }
    return {}
  }

  private isBackingAsset(currency: CurrencyId) {
    return this.backing[currency] != null
  }

  treasuryValue() {
    // price of DAO is excluded
    const assets = this.state.tokens.balances[this.account.address]
    return Object.entries(assets).reduce(
      (sum, [currency, amount]) => this.state.oracle.getPrice(currency as CurrencyId) * amount + sum,
      0
    )
  }

  onUpdate() {
    withEvent(`Dao.onUpdate`, {}, () => {
      const totalSupply = this.state.tokens.total[TokenSymbol.sDAO] ?? 0
      const toMint = totalSupply * RATE_PER_UPDATE

      const oldRate = this.state.stoken.getExchangeRate()

      this.state.stoken.inflate(toMint)

      const newRate = this.state.stoken.getExchangeRate()

      const rateAPY = ((newRate - oldRate) / oldRate + 1) ** (24 * 365) - 1

      this.checkInvariant()

      log('Dao update', { oldRate, newRate, rateAPY })
    })
  }

  printInfo() {
    console.log('Dao info')
    const totalReserve = this.totalReserve()
    const currentDebt = this.state.tokens.total[TokenSymbol.DAO] ?? 0
    const availableReserve = totalReserve - currentDebt
    const runwayPercent = totalReserve / currentDebt
    const runwayDays = Math.log(runwayPercent) / Math.log(RATE_PER_UPDATE + 1) / 24
    const treasuryValue = this.treasuryValue()
    console.table({
      totalReserve,
      currentDebt,
      availableReserve,
      runwayDays,
      treasuryValue,
    })
    console.table(
      Object.fromEntries(
        Object.entries(this.subscriptions).map(([key, { discountParameters, ...sub }]) => [
          key,
          { ...sub, ...discountParameters },
        ])
      )
    )
  }
}
