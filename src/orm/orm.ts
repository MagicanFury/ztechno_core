import { ZSQLService } from "../sql_service"

export class ZOrm {

  public readonly alias: string
  
  constructor(opt: { alias: string }) {
    this.alias = opt.alias
  }

  public async ensureTableExists(sqlService: ZSQLService) {
    const exists = await this.checkTableExists(sqlService)
    if (!exists) {
      await this.createTable(sqlService)
    }
  }

  private async checkTableExists(sqlService: ZSQLService) {
    const res = await sqlService.query<any[]>(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${sqlService.database}' AND table_name = '${this.alias}'
      LIMIT 1
    `)
    return res.length > 0
  }

  public async createTable(sqlService: ZSQLService) {
    throw new Error(`${this.alias} Create Table Statement Not Implemented!`)
  }
}