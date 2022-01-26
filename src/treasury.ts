import Blockchain from './blockchain'
import Account from './account'
import { withEvent, TokenSymbol, log, normalize } from './utils'

export default class Treasury {
  // claim fee is required otherwise the claimer will enjoy 100% of the rewards of the claimed amount
  // whereas the people did not claim need to share it with others
  // so the best strategy will be claim as frequently as possible
  // a big enough fee will incentive people to claim as late as possible
  claimFee = 0.3

  account: Account

  totalShares = 0
  totalWithdrawn = 0
  accountInfo = {} as Record<string, { shares: number; withdrawn: number }>
  principle = 0

  constructor(public state: Blockchain) {
    this.account = new Account('Treasury', state)
  }

  stake(origin: Account, amount: number) {
    withEvent(`stake`, { origin, amount }, () => {
      origin.transfer(TokenSymbol.ACA, this.account, amount)

      const change = this.totalShares == 0 ? 0 : amount / this.totalShares

      let info = this.accountInfo[origin.address]
      if (!info) {
        this.accountInfo[origin.address] = info = { shares: 0, withdrawn: 0 }
      }

      info.shares += amount
      this.totalShares += amount

      const additionalWithdrawn = info.withdrawn * change
      info.withdrawn += additionalWithdrawn
      this.totalWithdrawn += additionalWithdrawn
    })
  }

  unstake(origin: Account, amount: number) {
    withEvent(`unstake`, { origin, amount }, () => {
      this.claim(origin)

      const info = this.accountInfo[origin.address]

      if (info.shares < amount) {
        throw new Error(`Account ${origin.address} has only ${info.shares} shares to unstake`)
      }
    })
  }

  claim(origin: Account) {
    withEvent(`claim`, { origin }, () => {
      const info = this.accountInfo[origin.address]
      if (!info || info.shares === 0) {
        return
      }

      const sharePercent = info.shares / this.totalShares
      const totalRewards =
        this.state.stoken.fromStakedToken(this.state.tokens.balances[this.account.address][TokenSymbol.sDAO]) -
        this.principle +
        this.totalWithdrawn

      const rewards = normalize(totalRewards * sharePercent - info.withdrawn)

      info.withdrawn += rewards
      this.totalWithdrawn += rewards

      const amount = this.state.stoken.toStakedToken(rewards)
      const fee = amount * this.claimFee
      const finalAmount = amount - fee

      this.account.transfer(TokenSymbol.sDAO, origin, finalAmount)

      log(`claim`, { finalAmount, fee })
    })
  }

  fund(origin: Account, amount: number) {
    withEvent(`fund`, { origin, amount }, () => {
      origin.transfer(TokenSymbol.aDAO, this.account, amount)
      this.account.stakeDao(amount)
      this.principle += amount
    })
  }
}
