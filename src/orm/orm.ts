import { ZSQLService } from "../core/sql_service"

export class ZOrm {

  public readonly alias: string
  protected sqlService: ZSQLService
  
  constructor(opt: { alias: string, sqlService: ZSQLService }) {
    this.alias = opt.alias
    this.sqlService = opt.sqlService
  }

  public async ensureTableExists() {
    const exists = await this.checkTableExists()
    if (!exists) {
      await this.createTable()
    }
  }

  private async checkTableExists() {
    const res = await this.sqlService.query<any[]>(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${this.sqlService.database}' AND table_name = '${this.alias}'
      LIMIT 1
    `)
    return res.length > 0
  }

  public async createTable() {
    throw new Error(`${this.alias} Create Table Statement Not Implemented!`)
  }
}