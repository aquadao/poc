import Tokens from './tokens'
import Dex from './dex'
import Dao from './dao'
import Treasury from './treasury'
import Oracle from './oracle'
import SToken from './stoken'
import Manager from './manager'
import { withEvent } from './utils'

export default class Blockchain {
  tokens: Tokens
  dex: Dex
  dao: Dao
  treasury: Treasury
  oracle: Oracle
  stoken: SToken
  manager: Manager

  now = 0

  constructor() {
    this.tokens = new Tokens()
    this.dex = new Dex(this)
    this.dao = new Dao(this)
    this.treasury = new Treasury(this)
    this.oracle = new Oracle(this)
    this.stoken = new SToken(this)
    this.manager = new Manager(this)
  }

  update(count = 1) {
    for (let i = 0; i < count; i++) {
      this.now++
      withEvent(`update`, { now: this.now }, () => {
        this.oracle.onUpdate()
        this.dao.onUpdate()
        this.manager.onUpdate()
      })
    }
  }

  printInfo() {
    this.dex.printInfo()
    this.tokens.printInfo()
    this.dao.printInfo()
    this.oracle.printInfo()
    this.manager.printInfo()
  }
}
