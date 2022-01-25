import { CurrencyId, withEvent } from './utils'

export default class Tokens {
  balances = {} as Record<string, Record<CurrencyId, number>>
  total = {} as Record<string, number>

  mutate(currency: CurrencyId, address: string, fn: (amount: number) => number) {
    if (!this.balances[address]) {
      this.balances[address] = {} as Record<CurrencyId, number>
    }
    const before = this.balances[address][currency] ?? 0
    const after = fn(before)
    if (after < 0 || isNaN(after)) {
      throw new Error(`Invalid mutate: ${address} ${before} ${after}`)
    }
    this.balances[address][currency] = after
  }

  deposit(currency: CurrencyId, address: string, amount: number) {
    withEvent(`deposit`, { currency, address, amount }, () => {
      if (amount < 0) {
        throw new Error(`Invalid deposit: ${address} ${amount}`)
      }
      this.mutate(currency, address, (before) => before + amount)
      this.total[currency] = (this.total[currency] ?? 0) + amount
    })
  }

  withdraw(currency: CurrencyId, address: string, amount: number) {
    withEvent(`withdraw`, { currency, address, amount }, () => {
      if (amount < 0) {
        throw new Error(`Invalid withdraw: ${address} ${amount}`)
      }
      this.mutate(currency, address, (before) => before - amount)
      this.total[currency] = (this.total[currency] ?? 0) - amount
    })
  }

  transfer(currency: CurrencyId, from: string, to: string, amount: number) {
    withEvent(`transfer`, { currency, from, to, amount }, () => {
      if (amount < 0) {
        throw new Error(`Invalid transfer: ${from} ${to} ${amount}`)
      }
      this.mutate(currency, from, (before) => before - amount)
      this.mutate(currency, to, (before) => before + amount)
    })
  }

  printInfo() {
    console.log('Tokens info')
    console.table(this.balances)
  }
}
