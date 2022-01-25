import type Blockchain from './blockchain'
import { CurrencyId, TokenSymbol } from './utils'

export default class Account {
  constructor(public address: string, public state: Blockchain) {}

  transfer(currency: CurrencyId, to: Account, amount: number) {
    this.state.tokens.transfer(currency, this.address, to.address, amount)
  }

  addLiquidity(a: TokenSymbol, b: TokenSymbol, amountA: number, maxAmountB: number) {
    return this.state.dex.addLiquidity(this, a, b, amountA, maxAmountB)
  }

  removeLiquidity(a: TokenSymbol, b: TokenSymbol, share: number) {
    this.state.dex.removeLiquidity(this, a, b, share)
  }

  swapExactSupply(a: TokenSymbol, b: TokenSymbol, supplyAmount: number) {
    return this.state.dex.swapExactSupply(this, a, b, supplyAmount)
  }

  subscribe(subId: number, amount: number, minReceiveAmount: number) {
    return this.state.dao.subscribe(this, subId, amount, minReceiveAmount)
  }

  stakeDao(amount: number) {
    this.state.stoken.stake(this, amount)
  }

  unstakeDao(amount: number) {
    this.state.stoken.unstake(this, amount)
  }

  stakeAca(amount: number) {
    this.state.treasury.stake(this, amount)
  }

  unstakeAca(amount: number) {
    this.state.treasury.unstake(this, amount)
  }

  claim() {
    this.state.treasury.claim(this)
  }

  toString() {
    return this.address
  }
}
