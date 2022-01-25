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
      [TokenSymbol.DOT]: 1_000_000,
      [TokenSymbol.lcDOT]: 1_000_000,
      [TokenSymbol.aUSD]: 3_000_000,
    },
    [alice.address]: {
      [TokenSymbol.ACA]: 10000000,
      [TokenSymbol.aUSD]: 10000000,
    },
    [bob.address]: {
      [TokenSymbol.ACA]: 10000000,
      [TokenSymbol.aUSD]: 10000000,
    },
    [charlie.address]: {
      [TokenSymbol.ACA]: 10000000,
      [TokenSymbol.aUSD]: 10000000,
    },
  } as Record<string, Record<CurrencyId, number>>

  state.tokens.printInfo()

  {
    // bootstrap
    // 1 $DAO = 0.6 aUSD, 0.02 lcDOT

    console.log('Seed DAO reserve')
    state.treasury.account.transfer(TokenSymbol.aUSD, state.dao.account, 600_000)
    state.treasury.account.transfer(TokenSymbol.lcDOT, state.dao.account, 20_000)

    state.dao.printInfo()

    // we should have reserve of 1_000_000 $DAO
    // with 1 year of 400% APY runway, we can mint 250_000 $DAO

    console.log('Mint initial $DAO')
    state.dao.mint(state.treasury.account, 250_000)

    state.dao.printInfo()

    state.treasury.fund(state.treasury.account, 50_000)
  }

  // add liquidity, initial price of $4, the current soft backing value
  const lp = state.treasury.account.addLiquidity(TokenSymbol.aUSD, TokenSymbol.DAO, 1_000_000, 200_000)

  state.update()

  alice.stakeAca(1000)
  bob.stakeAca(1000)

  state.update()

  alice.claim()
  alice.claim()

  state.update()

  alice.unstakeAca(1000)
  bob.unstakeAca(1000)

  const subId = state.dao.createSubscription({
    currency: toLPToken(TokenSymbol.aUSD, TokenSymbol.DAO),
    amount: 250_000,
    vestingPeriod: 5 * 24, // 5 days
    duration: 30 * 24, // 30 days
    minPrice: 2,
    discountParameters: {
      initialDiscount: 0.05,
      maxDiscount: 0.2,
      idleIncreasePeriod: 2, // 2 horus
      idleIncreasePercentage: 0.01, // 1% per 2 hours
      decreasePercentagePerUnit: 0.2 / 250_000, // 20% in total. this means if people buy all the subscription in first second, the average price will be 105% of market price
    },
  })

  state.treasury.account.subscribe(subId, 100, 0)

  state.printInfo()
}

main()
