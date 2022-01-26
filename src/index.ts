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
  alice.addLiquidity(TokenSymbol.DOT, TokenSymbol.aUSD, 1_000_000, 30_000_000)

  state.tokens.printInfo()

  {
    // bootstrap
    // 1 $DAO = 0.6 aUSD, 0.02 lcDOT

    console.log('Seed DAO reserve')
    state.treasury.account.transfer(TokenSymbol.aUSD, state.dao.account, 600_000)
    state.treasury.account.transfer(TokenSymbol.lcDOT, state.dao.account, 40_000)

    state.dao.printInfo()

    console.log('Mint initial $DAO')
    state.dao.mint(state.treasury.account, 400_000)

    state.dao.printInfo()

    // add liquidity, initial price of $4
    const lp = state.treasury.account.addLiquidity(TokenSymbol.aUSD, TokenSymbol.aDAO, 800_000, 200_000)
    state.treasury.account.transfer(toLPToken(TokenSymbol.aUSD, TokenSymbol.aDAO), state.dao.account, lp)

    state.treasury.fund(state.treasury.account, 50_000)

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
    currency: toLPToken(TokenSymbol.aUSD, TokenSymbol.aDAO),
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
    currency: toLPToken(TokenSymbol.lcDOT, TokenSymbol.DOT),
    amount: 250_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minRatio: 0.15,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 1,
      idleIncreasePercentage: 0.01,
      decreasePercentagePerUnit: 0.2 / 250_000,
    },
  })

  const subId3 = state.dao.createSubscription({
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

  const subId4 = state.dao.createSubscription({
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

  const subId5 = state.dao.createSubscription({
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

  alice.subscribe(subId2, 100, 0)
  alice.subscribe(subId3, 100, 0)
  alice.subscribe(subId4, 100, 0)
  alice.subscribe(subId5, 100, 0)

  alice.unstakeDao(50)

  const lp = alice.addLiquidity(TokenSymbol.aDAO, TokenSymbol.aUSD, 10, 100)

  alice.subscribe(subId1, lp, 0)

  state.printInfo()
}

main()
