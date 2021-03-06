import Blockchain from './blockchain'
import Account from './account'
import { TokenSymbol, CurrencyId, toLPToken } from './utils'

const main = () => {
  const state = new Blockchain()

  // disable swap fee to make number looks nicer
  state.dex.fee = 0

  const alice = new Account('alice', state)
  const bob = new Account('bob', state)
  const charlie = new Account('charlie', state)

  state.tokens.balances = {
    [state.treasury.account.address]: {
      [TokenSymbol.DOT]: 5_000_000,
      [TokenSymbol.lcDOT]: 5_000_000,
      [TokenSymbol.aUSD]: 5_000_000,
    },
    [alice.address]: {
      [TokenSymbol.ACA]: 10_000_000,
      [TokenSymbol.DOT]: 10_000_000,
      [TokenSymbol.lcDOT]: 10_000_000,
      [TokenSymbol.aUSD]: 100_000_000,
    },
    [bob.address]: {
      [TokenSymbol.ACA]: 10_000_000,
      [TokenSymbol.DOT]: 10_000_000,
      [TokenSymbol.lcDOT]: 10_000_000,
      [TokenSymbol.aUSD]: 10_000_000,
    },
    [charlie.address]: {
      [TokenSymbol.ACA]: 10_000_000,
      [TokenSymbol.DOT]: 10_000_000,
      [TokenSymbol.lcDOT]: 10_000_000,
      [TokenSymbol.aUSD]: 10_000_000,
    },
  } as Record<string, Record<CurrencyId, number>>

  alice.addLiquidity(TokenSymbol.DOT, TokenSymbol.lcDOT, 1_000_000, 650_000)
  alice.addLiquidity(TokenSymbol.lcDOT, TokenSymbol.aUSD, 1_000_000, 20_000_000)
  alice.addLiquidity(TokenSymbol.ACA, TokenSymbol.aUSD, 1_000_000, 3_000_000)

  state.tokens.printInfo()

  {
    // bootstrap

    console.log('Seed DAO reserve')
    state.treasury.account.transfer(TokenSymbol.aUSD, state.dao.account, 600_000)
    state.treasury.account.transfer(TokenSymbol.lcDOT, state.dao.account, 20_000)

    state.dao.printInfo()

    console.log('Mint initial $DAO')
    state.dao.mint(state.treasury.account, 1_000_000)

    state.dao.printInfo()

    // add liquidity, initial price of $
    const lp = state.treasury.account.addLiquidity(TokenSymbol.aUSD, TokenSymbol.aDAO, 500_000, 500_000)
    state.treasury.account.transfer(toLPToken(TokenSymbol.aUSD, TokenSymbol.aDAO), state.dao.account, lp)

    state.treasury.fund(state.treasury.account, 500_000)

    state.printInfo()
  }

  // state.update()

  // alice.stakeAca(1000)
  // bob.stakeAca(1000)

  // state.update()

  // alice.claim()
  // alice.claim()

  // state.update()

  // alice.unstakeAca(1000)
  // bob.unstakeAca(1000)

  const subId1 = state.dao.createSubscription({
    currency: TokenSymbol.aUSD,
    amount: 250_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minRatio: 3,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 1,
      idleIncreasePercentage: 0.01,
      decreasePercentagePerUnit: 0.2 / 250_000,
    },
  })

  const subId2 = state.dao.createSubscription({
    currency: TokenSymbol.lcDOT,
    amount: 150_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minRatio: 0.15,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 1,
      idleIncreasePercentage: 0.01,
      decreasePercentagePerUnit: 0.2 / 150_000,
    },
  })

  const subId3 = state.dao.createSubscription({
    currency: TokenSymbol.DOT,
    amount: 100_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minRatio: 0.1,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 1,
      idleIncreasePercentage: 0.01,
      decreasePercentagePerUnit: 0.2 / 100_000,
    },
  })

  const subId4 = state.dao.createSubscription({
    currency: TokenSymbol.ACA,
    amount: 100_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minRatio: 1,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 1,
      idleIncreasePercentage: 0.01,
      decreasePercentagePerUnit: 0.2 / 100_000,
    },
  })

  alice.subscribe(subId1, 50_000, 0)
  alice.subscribe(subId2, 1_000, 0)
  alice.subscribe(subId3, 1_000, 0)
  alice.subscribe(subId4, 1_000, 0)

  state.printInfo()

  state.update()
  state.update()
  state.update()
  state.update()
  state.update()
  state.update()
  state.update()
  state.update()

  state.printInfo()
}

main()
