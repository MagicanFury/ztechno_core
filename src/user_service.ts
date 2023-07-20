import { ZUser } from "ztechno_core"
import { ZCryptoService } from "./crypto_service"
import { ZSqlService } from "./sql_service"

type ZRequiredUserColumns = {
  name: string
  role: string|null
  pass: string
  admin: 0|1
}
type ZUserCredentials = {
  name: string
  pass: string
}

type ZUserSession = {
  session: string
}

export class ZUserService {

  private tableName: string
  private sqlService: ZSqlService
  private salt: string

  constructor({ sqlService, tableName }: { sqlService: ZSqlService, tableName?: string }) {
    this.sqlService = sqlService
    this.tableName = tableName || 'users'
    this.salt = sqlService.database
  }

  private async checkTableExists() {
    const res = await this.sqlService.query<any[]>(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${this.sqlService.database}' AND table_name = '${this.tableName}'
      LIMIT 1
    `)
    return res.length > 0
  }

  public async checkTableHasAdmin() {
    const res = await this.sqlService.query<any[]>(`
      SELECT id FROM \`${this.tableName}\` WHERE admin=1
    `)
    return res.length > 0
  }

  private async createTable() {
    await this.sqlService.query(`
      CREATE TABLE \`${this.tableName}\` (
        \`id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
        \`name\` varchar(64) NOT NULL,
        \`role\` varchar(64) DEFAULT NULL,
        \`pass\` varchar(512) NOT NULL,
        \`session\` varchar(512) NOT NULL,
        \`admin\` tinyint(1) NOT NULL,
        \`updated_at\` datetime NOT NULL DEFAULT current_timestamp(),
        \`created_at\` datetime NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`name_UNIQUE\` (\`name\`),
        KEY \`name\` (\`name\`),
        KEY \`createdat\` (\`created_at\`),
        KEY \`updatedat\` (\`updated_at\`),
        KEY \`session\` (\`session\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=latin1 COLLATE=latin1_swedish_ci
    `)
  }

  public async ensureTableExists() {
    const exists = await this.checkTableExists()
    if (!exists) {
      await this.createTable()
    }
  }

  public async register({name, pass, role, admin}: ZRequiredUserColumns): Promise<{ session: string }> {
    const session = this.genSession({ name, pass })
    await this.sqlService.query(`
      INSERT INTO \`${this.tableName}\` (name, pass, session, role, admin)
      VALUES (?, ?, ?, ?, ?)
    `, [name, this.hashPass({name, pass}), session, role, admin])
    return { session }
  }

  public async find(opt: { email: string }): Promise<ZUser|undefined> {
    const rows = await this.sqlService.query<ZUser[]>(`
      SELECT id, name, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
      WHERE name=?`, [opt.email]
    )
    return rows[0]
  }

  public async auth(opt: ZUserSession|ZUserCredentials): Promise<{user?: ZUser, session?: string, authenticated: boolean}>
  public async auth(opt: Partial<ZUserSession & ZUserCredentials>): Promise<{user?: ZUser, session?: string, authenticated: boolean}> {
    if (!opt.session && (!opt.name && !opt.pass)) {
      return { authenticated: false }
    }
    const res = await ((opt.session) ? this.sqlService.query<ZUser[]>(`
      SELECT id, name, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
      WHERE session=?`, [opt.session]
    ) : this.sqlService.query<ZUser[]>(`
      SELECT id, name, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
      WHERE name=? AND pass=?`, [opt.name, this.hashPass(opt as any)]
    ))
    return (res.length === 0) ? { authenticated: false } : { user: res[0], session: res[0].session, authenticated: true }
  }

  private genSession({ name }: ZUserCredentials) {
    const salt = this.salt
    const data = name + (Date.now() * Math.random())
    return ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt })
  }

  private hashPass({ name, pass }: ZUserCredentials): string {
    const salt = name + this.salt
    return ZCryptoService.hash('sha256', pass, { saltMode: 'simple', salt })
  }

}