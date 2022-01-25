import { LPToken, TokenSymbol, withEvent, toLPToken, log } from './utils'
import Blockchain from './blockchain'
import Account from './account'

export default class Dex {
  pools = new Set<LPToken>()
  lpAcc = {} as Record<LPToken, Account>
  fee = 0.003

  constructor(public state: Blockchain) {}

  lpAccount(token: LPToken) {
    if (!this.lpAcc[token]) {
      this.lpAcc[token] = new Account(`LP-${token}`, this.state)
    }
    return this.lpAcc[token]
  }

  addLiquidity(origin: Account, a: TokenSymbol, b: TokenSymbol, maxAmountA: number, maxAmountB: number) {
    return withEvent(`addLiquidity`, { origin, a, b, maxAmountA, maxAmountB }, () => {
      const lp = toLPToken(a, b)
      this.pools.add(lp)
      const lpAcc = this.lpAccount(lp)

      if (maxAmountA == 0 || maxAmountB == 0) {
        throw new Error(`Invalid addLiquidity: ${a} ${b} ${maxAmountA} ${maxAmountB}`)
      }

      const totalShares = this.state.tokens.total[lp] ?? 0
      let newShare = 0
      let transferAmountA = 0
      let transferAmountB = 0

      if (totalShares == 0) {
        const rate0 = 1
        const rate1 = maxAmountA / maxAmountB
        const share0 = rate0 * maxAmountA
        const share1 = rate1 * maxAmountB

        newShare = share0 + share1
        transferAmountA = maxAmountA
        transferAmountB = maxAmountB
      } else {
        const pool0 = this.state.tokens.balances[lpAcc.address][a]
        const pool1 = this.state.tokens.balances[lpAcc.address][b]
        const rate0 = pool1 / pool0
        const inputRate0 = maxAmountB / maxAmountA
        if (inputRate0 <= rate0) {
          const rate1 = pool0 / pool1
          const amount0 = rate1 * maxAmountB
          newShare = (amount0 / pool0) * totalShares

          transferAmountA = amount0
          transferAmountB = maxAmountB
        } else {
          const amount1 = rate0 * maxAmountA
          newShare = (amount1 / pool1) * totalShares

          transferAmountA = maxAmountA
          transferAmountB = amount1
        }
      }

      this.state.tokens.deposit(lp, origin.address, newShare)
      origin.transfer(a, lpAcc, transferAmountA)
      origin.transfer(b, lpAcc, transferAmountB)

      return newShare
    })
  }

  removeLiquidity(origin: Account, a: TokenSymbol, b: TokenSymbol, share: number) {
    withEvent(`removeLiquidity`, { origin, a, b, share }, () => {
      const lp = toLPToken(a, b)
      this.pools.add(lp)
      const lpAcc = this.lpAccount(lp)

      const pool0 = this.state.tokens.balances[lpAcc.address][a]
      const pool1 = this.state.tokens.balances[lpAcc.address][b]

      const totalShares = this.state.tokens.total[lp] ?? 0
      const proportion = share / totalShares
      const remove0 = proportion * pool0
      const remove1 = proportion * pool1

      this.state.tokens.withdraw(lp, origin.address, share)
      lpAcc.transfer(a, origin, remove0)
      lpAcc.transfer(b, origin, remove1)
    })
  }

  swapExactSupply(origin: Account, a: TokenSymbol, b: TokenSymbol, supplyAmount: number) {
    return withEvent(`swapExactSupply`, { origin, a, b, supplyAmount }, () => {
      const lp = toLPToken(a, b)
      const lpAcc = this.lpAccount(lp)

      const supplyPool = this.state.tokens.balances[lpAcc.address][a]
      const targetPool = this.state.tokens.balances[lpAcc.address][b]

      const supplyAmountWithFee = supplyAmount * (1 - this.fee)
      const numerator = supplyAmountWithFee * targetPool
      const denominator = supplyPool + supplyAmountWithFee

      const targetAmount = numerator / denominator

      origin.transfer(a, lpAcc, supplyAmount)
      lpAcc.transfer(b, origin, targetAmount)

      log('swapExactSupply success', { price: targetAmount / supplyAmount, supplyAmount, targetAmount })
      return targetAmount
    })
  }

  getPrice(a: TokenSymbol, b: TokenSymbol) {
    const lp = toLPToken(a, b)
    const lpAcc = this.lpAccount(lp)

    const pool0 = this.state.tokens.balances[lpAcc.address][a]
    const pool1 = this.state.tokens.balances[lpAcc.address][b]

    return pool1 / pool0
  }

  printInfo() {
    console.log('Dex info')
    const data = Array.from(this.pools).map((pool) => {
      const lpAcc = this.lpAccount(pool)
      const [a, b] = pool.split('-')
      const pool0 = this.state.tokens.balances[lpAcc.address][a]
      const pool1 = this.state.tokens.balances[lpAcc.address][b]
      const two_percent_depth_a = ((Math.sqrt(2) * 5) / 7 - 1) * pool0
      const two_percent_depth_b = (Math.sqrt(102) / 10 - 1) * pool1
      return {
        pool,
        totalShares: this.state.tokens.total[pool],
        pool0,
        pool1,
        price: +(pool1 / pool0).toFixed(4),
        two_percent_depth_a: +two_percent_depth_a.toFixed(4),
        two_percent_depth_b: +two_percent_depth_b.toFixed(4),
      }
    })
    console.table(data)
  }
}
