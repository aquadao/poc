import Account from './account'
import Blockchain from './blockchain'
import { withEvent, toLPToken, TokenSymbol, LPToken, CurrencyId, parseLPToken, log, RATE_PER_UPDATE } from './utils'
import Oracle from './oracle'

interface Subscription {
  currency: CurrencyId
  amount: number
  vestingPeriod: number // hours
  duration: number // hours
  minRatio: number // at least this amount of subscribed currency per aDAO
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

  subscriptions = {} as Record<number, SubscriptionDetails>
  nextSubscriptionId = 0

  oracle: Oracle

  constructor(public state: Blockchain) {
    this.account = new Account('DAO', state)
    this.oracle = new Oracle(state)
  }

  mint(to: Account, amount: number) {
    return withEvent(`mint`, { to, amount }, () => {
      this.state.tokens.deposit(TokenSymbol.aDAO, to.address, amount)
    })
  }

  subscribe(origin: Account, subId: number, paymentAmount: number, minReceiveAmount: number) {
    return withEvent(`subscribe`, { subId, paymentAmount, minReceiveAmount }, () => {
      const sub = this.subscriptions[subId]
      if (!sub) {
        throw new Error(`Subscription ${subId} does not exist`)
      }

      origin.transfer(sub.currency, this.account, paymentAmount)

      const daoPrice = this.state.oracle.getPrice(TokenSymbol.aDAO)
      const paymentValue = this.oracle.getPrice(sub.currency) * paymentAmount

      const idlePeriodCount = Math.floor(
        (this.state.now - sub.lastTradeTime) / sub.discountParameters.idleIncreasePeriod
      )
      const discountIncrease = idlePeriodCount * sub.discountParameters.idleIncreasePercentage
      const discountDecrease = sub.soldAmount * sub.discountParameters.decreasePercentagePerUnit
      const discount = Math.min(
        sub.discountParameters.maxDiscount,
        sub.lastDiscount + discountIncrease - discountDecrease
      )

      const discountedPrice = daoPrice * (1 - discount)
      const startPrice = discountedPrice

      const inc = daoPrice * sub.discountParameters.decreasePercentagePerUnit
      const receiveAmount = (Math.sqrt(2 * inc * paymentValue + startPrice ** 2) - startPrice) / inc

      const finalAmount = Math.min(receiveAmount, paymentAmount / sub.minRatio)

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

      const marketPrice = this.state.dex.getPrice(TokenSymbol.aDAO, TokenSymbol.aUSD)
      const soldPrice = paymentValue / finalAmount
      const soldRatio = paymentAmount / finalAmount

      log('subscription sold', {
        subId,
        soldAmount: finalAmount,
        soldRatio,
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

  treasuryValue() {
    // price of DAO is excluded
    const assets = this.state.tokens.balances[this.account.address]
    return Object.entries(assets).reduce(
      (sum, [currency, amount]) => this.state.oracle.getPrice(currency as CurrencyId) * amount + sum,
      0
    )
  }

  holdingDaoAmount() {
    const sdaoAmount = this.state.tokens.balances[this.account.address][TokenSymbol.sDAO] ?? 0
    return this.state.stoken.fromStakedToken(sdaoAmount)
  }

  onUpdate() {
    withEvent(`Dao.onUpdate`, {}, () => {
      const totalSupply = this.state.tokens.total[TokenSymbol.aDAO] ?? 0
      const toMint = totalSupply * RATE_PER_UPDATE

      const oldRate = this.state.stoken.getExchangeRate()

      this.state.stoken.inflate(toMint)

      const newRate = this.state.stoken.getExchangeRate()

      const rateAPY = ((newRate - oldRate) / oldRate + 1) ** (24 * 365) - 1

      log('Dao update', { oldRate, newRate, rateAPY })
    })
  }

  printInfo() {
    console.log('Dao info')
    const daoAmount = this.holdingDaoAmount()
    const totalDao = this.state.tokens.total[TokenSymbol.aDAO] ?? 0
    const currentDebt = totalDao - daoAmount
    const treasuryValue = this.treasuryValue()
    console.table({
      daoAmount,
      totalDao,
      currentDebt,
      treasuryValue,
      softBacking: treasuryValue / currentDebt,
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
