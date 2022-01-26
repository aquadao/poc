import Account from './account'
import Blockchain from './blockchain'
import { withEvent, TokenSymbol, RATE_PER_UPDATE } from './utils'

export default class SToken {
  treasuryShare = 0.04
  daoShare = 0.01
  // this means first day of staking have no reward
  // and people will lost principle if stake for less than a day
  // the fee is redistrubuted to all other stakers
  unstakeFee = RATE_PER_UPDATE * 24

  account: Account

  constructor(public state: Blockchain) {
    this.account = new Account('SToken', state)
  }

  stake(origin: Account, amount: number) {
    return withEvent(`stake`, { amount }, () =>
      this.withInvariant(true, () => {
        const toMint = this.toStakedToken(amount)
        origin.transfer(TokenSymbol.aDAO, this.account, amount)
        this.state.tokens.deposit(TokenSymbol.sDAO, origin.address, toMint)
      })
    )
  }

  unstake(origin: Account, amount: number) {
    return withEvent(`unstake`, { amount }, () =>
      this.withInvariant(false, () => {
        const toRedeem = this.fromStakedToken(amount)
        const fee = this.unstakeFee * toRedeem
        const finalToRedeem = toRedeem - fee
        this.state.tokens.withdraw(TokenSymbol.sDAO, origin.address, amount)
        this.account.transfer(TokenSymbol.aDAO, origin, finalToRedeem)

        return finalToRedeem
      })
    )
  }

  mint(to: Account, amount: number) {
    withEvent(`mint`, { to, amount }, () => {
      this.withInvariant(true, () => {
        const totalOtherShare = this.treasuryShare + this.daoShare
        const totalMint = amount / (1 - totalOtherShare)
        const toTreasury = totalMint * this.treasuryShare
        const toDao = totalMint * this.daoShare

        const amountStaked = this.toStakedToken(amount)
        const toTreasuryStaked = this.toStakedToken(toTreasury)
        const toDaoStaked = this.toStakedToken(toDao)

        this.state.tokens.deposit(TokenSymbol.aDAO, this.account.address, totalMint)

        // mint & stake the treasury and dao share
        this.state.tokens.deposit(TokenSymbol.sDAO, to.address, amountStaked)
        this.state.tokens.deposit(TokenSymbol.sDAO, this.state.treasury.account.address, toTreasuryStaked)
        this.state.tokens.deposit(TokenSymbol.sDAO, this.state.dao.account.address, toDaoStaked)

        this.state.treasury.principle += toTreasury
      })
    })
  }

  inflate(amount: number) {
    withEvent(`inflate`, { amount }, () => {
      this.withInvariant(false, () => {
        const totalOtherShare = this.treasuryShare + this.daoShare
        const totalMint = amount * (1 - totalOtherShare)
        const toTreasury = totalMint * this.treasuryShare
        const toDao = totalMint * this.daoShare

        const toTreasuryStaked = this.toStakedToken(toTreasury)
        const toDaoStaked = this.toStakedToken(toDao)

        // mint
        this.state.tokens.deposit(TokenSymbol.aDAO, this.account.address, totalMint)

        // stake the treasury and dao share
        this.state.tokens.deposit(TokenSymbol.sDAO, this.state.treasury.account.address, toTreasuryStaked)
        this.state.tokens.deposit(TokenSymbol.sDAO, this.state.dao.account.address, toDaoStaked)

        this.state.treasury.principle += toTreasury
      })
    })
  }

  getExchangeRate() {
    const total = this.state.tokens.balances[this.account.address]?.[TokenSymbol.aDAO] ?? 0
    const supply = this.state.tokens.total[TokenSymbol.sDAO] ?? 0
    if (supply === 0) {
      return 1
    }
    return total / supply
  }

  toStakedToken(amount: number) {
    return amount / this.getExchangeRate()
  }

  fromStakedToken(amount: number) {
    return amount * this.getExchangeRate()
  }

  withInvariant<R>(exact: boolean, action: () => R) {
    const rate = this.getExchangeRate()
    const ret = action()
    const newRate = this.getExchangeRate()
    if (exact) {
      if (Math.abs(rate / newRate - 1) > 0.000001) {
        throw new Error(`Exchange rate changed from ${rate} to ${newRate}`)
      }
    } else {
      if (rate > newRate) {
        throw new Error(`Exchange rate reduced from ${rate} to ${newRate}`)
      }
    }

    return ret
  }
}
