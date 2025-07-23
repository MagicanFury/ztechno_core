import { ZCryptoService } from "./crypto_service"
import { ZSQLService } from "./sql_service"
import { ZRequiredUserColumns, ZUser, ZUserSession, ZUserCredentials } from "./typings"

export class ZUserService {

  private tableName: string
  private sqlService: ZSQLService
  private salt: string

  constructor({ sqlService, tableName }: { sqlService: ZSQLService, tableName?: string }) {
    this.sqlService = sqlService
    this.tableName = tableName || 'users'
    this.salt = sqlService.database
  }

  protected async checkTableExists() {
    const res = await this.sqlService.query<any[]>(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${this.sqlService.database}' AND table_name = '${this.tableName}'
      LIMIT 1
    `)
    return res.length > 0
  }

  public async checkTableHasAdmin() {
    const res = await this.sqlService.query<any[]>(`
      SELECT user_id FROM \`${this.tableName}\` WHERE admin=1
    `)
    return res.length > 0
  }

  protected async createTable() {
    await this.sqlService.query(`
      CREATE TABLE \`${this.tableName}\` (
        \`user_id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
        \`email\` varchar(64) NOT NULL,
        \`role\` varchar(64) DEFAULT NULL,
        \`pass\` varchar(512) NOT NULL,
        \`session\` varchar(512) NOT NULL,
        \`admin\` tinyint(1) NOT NULL,
        \`updated_at\` datetime NOT NULL DEFAULT current_timestamp(),
        \`created_at\` datetime NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`user_id\`),
        UNIQUE KEY \`email_UNIQUE\` (\`email\`),
        KEY \`email\` (\`email\`),
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

  public async register({email, pass, role, admin}: ZRequiredUserColumns): Promise<{ session: string }> {
    const session = this.genSession({ email, pass })
    await this.sqlService.query(`
      INSERT INTO \`${this.tableName}\` (email, pass, session, role, admin)
      VALUES (?, ?, ?, ?, ?)
    `, [email, this.hashPass({email, pass}), session, role, admin])
    return { session }
  }

  public async fetch(opt?: { limit: number }) {
    const rows = await this.sqlService.query<any[]>(`
      SELECT user_id, email, role, admin, created_at FROM \`${this.tableName}\`
      LIMIT ?
    `, [opt.limit])
    return rows
  }

  public async exists(opt: { email: string }|{ user_id: number }): Promise<boolean> {
    const user = await this.find(opt)
    return user !== undefined
  }

  public async find(opt: { email: string }|{ user_id: number }): Promise<ZUser|undefined>
  public async find(opt: any): Promise<ZUser|undefined> {
    if (opt.email !== undefined) {
      const rows = await this.sqlService.query<ZUser>(`
        SELECT user_id, email, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
        WHERE email=?`, [opt.email]
      )
      return rows[0]
    } else if (opt.user_id !== undefined) {
      const rows = await this.sqlService.query<ZUser>(`
        SELECT user_id, email, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
        WHERE user_id=?`, [opt.user_id]
      )
      return rows[0]
    } else {
      throw new Error(`Unexpected Input for ZUserService.find(${JSON.stringify(opt)})`)
    }
  }

  public async auth(opt: ZUserSession|ZUserCredentials): Promise<{user?: ZUser, session?: string, authenticated: boolean}>
  public async auth(opt: Partial<ZUserSession & ZUserCredentials>): Promise<{user?: ZUser, session?: string, authenticated: boolean}> {
    if (!opt.session && (!opt.email && !opt.pass)) {
      return { authenticated: false }
    }
    const res = await ((opt.session) ? this.sqlService.query<ZUser>(`
      SELECT user_id, email, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
      WHERE session=?`, [opt.session]
    ) : this.sqlService.query<ZUser>(`
      SELECT user_id, email, session, role, admin, updated_at, created_at FROM \`${this.tableName}\`
      WHERE email=? AND pass=?`, [opt.email, this.hashPass(opt as any)]
    ))
    return (res.length === 0) ? { authenticated: false } : { user: res[0], session: res[0].session, authenticated: true }
  }

  private genSession({ email }: ZUserCredentials) {
    const salt = this.salt
    const data = email + (Date.now() * Math.random())
    return ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt })
  }

  private hashPass({ email, pass }: ZUserCredentials): string {
    const salt = email + this.salt
    return ZCryptoService.hash('sha256', pass, { saltMode: 'simple', salt })
  }

}