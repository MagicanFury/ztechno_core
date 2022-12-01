import { ZSqlService } from "./sql_service"

type ZRequiredUserColumns = {
  name: string
  role: string|null
  pass: string
  admin: 0|1
}

export class ZUserService {

  private tableName: string
  private sqlService: ZSqlService

  constructor({ sqlService, tableName }: { sqlService: ZSqlService, tableName?: string }) {
    this.sqlService = sqlService
    this.tableName = tableName || 'users'
  }

  private async checkTableExists() {
    const res = await this.sqlService.query(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${this.sqlService.database}' AND table_name = '${this.tableName}'
      LIMIT 1
    `)
    return res.length > 0
  }

  private async createTable() {
    await this.sqlService.query(`
      CREATE TABLE \`${this.tableName}\` (
        \`id\` int(10) unsigned zerofill NOT NULL,
        \`name\` varchar(64) NOT NULL,
        \`role\` varchar(64) DEFAULT NULL,
        \`pass\` varchar(512) NOT NULL,
        \`admin\` tinyint(1) NOT NULL DEFAULT 0,
        \`updated_at\` datetime NOT NULL DEFAULT current_timestamp(),
        \`created_at\` datetime NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        KEY \`name\` (\`name\`),
        KEY \`createdat\` (\`created_at\`),
        KEY \`updatedat\` (\`updated_at\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci;
    `)
  }

  public async ensureTableExists() {
    const exists = await this.checkTableExists()
    if (!exists) {
      await this.createTable()
    }
  }

  public async register({name, pass, role, admin}: ZRequiredUserColumns) {
    await this.sqlService.query(`
      INSERT INTO \`${this.tableName}\` (name, pass, role, admin)
      VALUES (?, ?, ?, ?)
    `, [name, pass, role, admin])
  }

}