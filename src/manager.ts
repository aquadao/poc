import Account from './account'
import Blockchain from './blockchain'
import { TokenSymbol, CurrencyId, toLPToken, withEvent, log } from './utils'

export interface Allocation {
  value: number
  range: number
}

interface Diff {
  currency: CurrencyId
  current: number
  target: number
  diff: number
  rangeDiff: number
  diffAmount: number
}

export abstract class Strategy {
  maxTradeAmount = 50000
  minTradeAmount = 500
  tradeAmountPercent = 0.1

  abstract rebalance(diff: Record<CurrencyId, Diff>): Record<CurrencyId, Diff>

  tradeAmount(diff: number, maxAmount: number) {
    const absDiff = Math.abs(diff)
    if (maxAmount <= this.minTradeAmount || absDiff <= this.minTradeAmount) {
      return 0
    }
    const amount = absDiff * this.tradeAmountPercent
    return Math.min(Math.max(this.minTradeAmount, amount), this.maxTradeAmount, maxAmount)
  }
}

class LiquidityProviderStrategyAusdAdao extends Strategy {
  constructor(public manger: Manager) {
    super()
  }

  rebalance(diff: Record<CurrencyId, Diff>) {
    return withEvent(`LiquidityProviderStrategyAusdAdao.rebalance`, { }, () => {
      const lp = toLPToken(TokenSymbol.aDAO, TokenSymbol.aUSD)
      const lpDiff = diff[lp]
      const tempAccount = new Account('temp', this.manger.state)
      const daoAccount = this.manger.state.dao.account
      if (lpDiff && lpDiff.rangeDiff < 0) {
        const maxAmount = diff[TokenSymbol.aUSD].diffAmount
        const amount = this.tradeAmount(lpDiff.diffAmount, maxAmount) / 2 // amount is single side, the total amount is twice
        if (amount > 0) {
          const adaoToMint = this.manger.state.dex.getPrice(TokenSymbol.aDAO, TokenSymbol.aUSD) * amount
          this.manger.state.tokens.deposit(TokenSymbol.aDAO, tempAccount.address, adaoToMint)
          daoAccount.transfer(TokenSymbol.aUSD, tempAccount, amount)
          tempAccount.addLiquidity(TokenSymbol.aDAO, TokenSymbol.aUSD, adaoToMint, amount)
          tempAccount.transfer(lp, daoAccount, this.manger.state.tokens.balances[tempAccount.address][lp])
          if (Object.values(this.manger.state.tokens.balances[tempAccount.address]).some((v) => v > 0)) {
            throw new Error('temp account has some tokens')
          }
          log('rebalance', { amount, adaoToMint })
          return {
            ...diff,
            lp: {
              ...lpDiff,
              diffAmount: lpDiff.diffAmount - amount * 2,
            }
          }
        }
      }
      return diff
    })

  }
}

class LiquidityProviderStrategyAusdOther extends Strategy {
  constructor(public manger: Manager, public currency: TokenSymbol) {
    super()
  }

  rebalance(diff: Record<CurrencyId, Diff>) {
    return withEvent(`LiquidityProviderStrategyAusd${this.currency}.rebalance`, { }, () => {
      const lp = toLPToken(this.currency, TokenSymbol.aUSD)
      const lpDiff = diff[lp]
      const daoAccount = this.manger.state.dao.account
      if (lpDiff && lpDiff.rangeDiff < 0) {
        const price = this.manger.state.dex.getPrice(this.currency, TokenSymbol.aUSD)
        const maxAmount = diff[TokenSymbol.aUSD].diffAmount
        const maxOtherToAdd = this.manger.state.tokens.balances[daoAccount.address][this.currency]
        const maxOtherToAddAmount = maxOtherToAdd * price
        const amount = this.tradeAmount(lpDiff.diffAmount, Math.min(maxAmount, maxOtherToAddAmount)) / 2 // amount is single side, the total amount is twice
        const otherToAdd = price * amount
        if (amount > 0 && otherToAdd > 0) {
          daoAccount.addLiquidity(this.currency, TokenSymbol.aUSD, otherToAdd, amount)
          log('rebalance', { amount, otherToAdd })
          return {
            ...diff,
            lp: {
              ...lpDiff,
              diffAmount: lpDiff.diffAmount - amount * 2,
            }
          }
        }
      }
      return diff
    })

  }
}

export default class Manager {
  targetAllocatioin = {
    aUSD: {
      // 0 - 20
      value: 10,
      range: 10,
    },
    DOT: {
      value: 0,
      range: 5,
    },
    lcDOT: {
      value: 0,
      range: 5,
    },
    ACA: {
      value: 0,
      range: 0,
    },
    [toLPToken(TokenSymbol.aUSD, TokenSymbol.aDAO)]: {
      // 20 - 30
      value: 60,
      range: 5,
    },
    [toLPToken(TokenSymbol.aUSD, TokenSymbol.lcDOT)]: {
      // 15 - 20
      value: 15,
      range: 5,
    },
    [toLPToken(TokenSymbol.aUSD, TokenSymbol.ACA)]: {
      // 15 - 20
      value: 15,
      range: 5,
    },
  }

  strategies = [
    new LiquidityProviderStrategyAusdAdao(this),
    new LiquidityProviderStrategyAusdOther(this, TokenSymbol.DOT),
    new LiquidityProviderStrategyAusdOther(this, TokenSymbol.lcDOT),
    new LiquidityProviderStrategyAusdOther(this, TokenSymbol.ACA),
  ]

  constructor(public state: Blockchain) {}

  updateAllocation(currency: CurrencyId, allocation: Allocation) {
    withEvent(`updateAllocation`, { currency, allocation }, () => {
      this.targetAllocatioin[currency] = allocation
    })
  }

  getTargetAllocations() {
    const targetAllocatioin = {} as Record<
      CurrencyId,
      { value: number; range: number; percent: number; minPercent: number; maxPercent: number }
    >
    let targetTotal = 0
    for (const [currency, allocation] of Object.entries(this.targetAllocatioin)) {
      targetTotal += allocation.value
    }
    for (const [currency, allocation] of Object.entries(this.targetAllocatioin)) {
      targetAllocatioin[currency] = {
        ...allocation,
        percent: allocation.value / targetTotal,
        minPercent: Math.max(allocation.value - allocation.range, 0) / targetTotal,
        maxPercent: Math.min(allocation.value + allocation.range, targetTotal) / targetTotal,
      }
    }

    return targetAllocatioin
  }

  getCurrentAllocations() {
    const assets = this.state.tokens.balances[this.state.dao.account.address]
    delete assets[TokenSymbol.aDAO]
    delete assets[TokenSymbol.sDAO]
    const values = {} as Record<CurrencyId, { amount: number; value: number; percent: number }>
    let currentTotal = 0

    for (const [currency, amount] of Object.entries(assets)) {
      const value = this.state.oracle.getPrice(currency as CurrencyId) * amount
      values[currency] = {
        amount,
        value,
      }
      currentTotal += value
    }

    for (const key of Object.keys(values)) {
      values[key].percent = values[key].value / currentTotal
    }

    return [values, currentTotal] as [typeof values, number]
  }

  getAllocationDiff() {
    const [currentAllocations, totalValue] = this.getCurrentAllocations()
    const targetAllocatioins = this.getTargetAllocations()

    const sortedCurrentAllocations = Object.entries(currentAllocations)
    sortedCurrentAllocations.sort(([a], [b]) => a.localeCompare(b))

    const sortedTargetAloocations = Object.entries(targetAllocatioins)
    sortedTargetAloocations.sort(([a], [b]) => a.localeCompare(b))

    const diff = [] as Array<Diff>

    let i = 0
    let j = 0
    for (; i < sortedCurrentAllocations.length && j < sortedTargetAloocations.length; ) {
      const [currency, current] = sortedCurrentAllocations[i]
      const [currencyTarget, target] = sortedTargetAloocations[j]

      const targetValue = totalValue * target.percent
      const targetAmount = targetValue / this.state.oracle.getPrice(currencyTarget as CurrencyId)

      if (currency === currencyTarget) {
        let rangeDiff = 0
        if (current.percent < target.minPercent) {
          rangeDiff = current.percent - target.minPercent
        } else if (current.percent > target.maxPercent) {
          rangeDiff = current.percent - target.maxPercent
        }
        diff.push({
          currency: currency as CurrencyId,
          current: current.percent,
          target: target.percent,
          diff: current.percent - target.percent,
          rangeDiff,
          diffAmount: current.amount - targetAmount,
        })
        i++
        j++
      } else if (currency < currencyTarget) {
        diff.push({
          currency: currency as CurrencyId,
          current: current.percent,
          target: 0,
          diff: current.percent,
          rangeDiff: current.percent,
          diffAmount: current.amount,
        })
        i++
      } else {
        diff.push({
          currency: currencyTarget as CurrencyId,
          current: 0,
          target: target.percent,
          diff: -target.percent,
          rangeDiff: -target.minPercent,
          diffAmount: -targetAmount,
        })
        j++
      }
    }

    for (; i < sortedCurrentAllocations.length; i++) {
      const [currency, current] = sortedCurrentAllocations[i]
      diff.push({
        currency: currency as CurrencyId,
        current: current.percent,
        target: 0,
        diff: current.percent,
        rangeDiff: current.percent,
        diffAmount: current.amount,
      })
    }
    for (; j < sortedTargetAloocations.length; j++) {
      const [currency, target] = sortedTargetAloocations[j]

      const targetValue = totalValue / target.percent
      const targetAmount = targetValue / this.state.oracle.getPrice(currency as CurrencyId)

      diff.push({
        currency: currency as CurrencyId,
        current: 0,
        target: target.percent,
        diff: -target.percent,
        rangeDiff: -target.minPercent,
        diffAmount: -targetAmount,
      })
    }

    return Object.fromEntries(diff.map((diff) => [diff.currency, diff])) as Record<CurrencyId, Diff>
  }

  onUpdate() {
    withEvent(`Manager.onUpdate`, {}, () => {
      const diff = this.getAllocationDiff()
      // trigger one stragegy at a time to avoid making too many trades in a single block
      // NOTE: for real implementation, we want something like this so that we execute one stragegy at every interval
      // and execute them in round robin
      // if now % interval == 0
      //   let idx = now / inteval % strategies.length
      let i = this.state.now % this.strategies.length
      this.strategies[i].rebalance(diff)
    })
  }

  printInfo() {
    console.log('Manager info')

    const [currentAllocations] = this.getCurrentAllocations()
    const targetAllocatioin = this.getTargetAllocations()

    console.log('Target Allocations')
    console.table(targetAllocatioin)

    console.log('Current Allocations')
    console.table(currentAllocations)

    console.log('Allocation Diff')
    console.table(this.getAllocationDiff())
  }
}
