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
      [TokenSymbol.aUSD]: 30_000_000,
    },
    [alice.address]: {
      [TokenSymbol.aUSD]: 10000000,
    },
    [bob.address]: {
      [TokenSymbol.aUSD]: 10000000,
    },
    [charlie.address]: {
      [TokenSymbol.aUSD]: 10000000,
      [TokenSymbol.DAO]: 10000000,
    },
  } as Record<string, Record<CurrencyId, number>>

  state.tokens.printInfo()

  {
    // bootstrap
    // 1 $DAO = 5 $aUSD

    state.dao.backing[TokenSymbol.aUSD] = 5
    delete state.dao.backing[TokenSymbol.lcDOT]

    console.log('Seed DAO reserve')
    state.treasury.account.transfer(TokenSymbol.aUSD, state.dao.account, 5_000_000)

    state.dao.printInfo()

    // we should have reserve of 1_000_000 $DAO
    // with 1 year of 400% APY runway, we can mint 250_000 $DAO

    console.log('Mint initial $DAO')
    state.dao.mint(state.treasury.account, 250_000)

    state.dao.printInfo()
  }

  // add liquidity, initial price of $5, the current soft backing value
  state.treasury.account.addLiquidity(TokenSymbol.aUSD, TokenSymbol.DAO, 1_250_000, 250_000)

  state.update()

  const subId = state.dao.createSubscription({
    currency: TokenSymbol.aUSD,
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

  // const val = state.treasury.account.subscribe(subId, 1000, 0);

  const buy_all_payment = 5 * 1.05 * 250_000
  const val = state.treasury.account.subscribe(subId, buy_all_payment, 0)

  console.log(val)

  state.printInfo()
}

main()
