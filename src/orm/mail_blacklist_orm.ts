import { ZOrm } from "./orm"
import { ZSQLService } from "../sql_service"
import { ZCryptoService } from "../crypto_service"
import { ZMailBlacklist, ZMailBlacklistSearch } from "../typings"

export class ZMailBlacklistOrm extends ZOrm {

  private hashSalt: string
  private sqlService: ZSQLService

  constructor(opt: { alias?: string, sqlService: ZSQLService, hashSalt?: string }) {
    super({ alias: opt.alias ?? 'email_blacklist' })
    this.sqlService = opt.sqlService
    this.hashSalt = opt.hashSalt ?? 'ZTECHNO'
  }

  async genEmailUnsubscribeHash({email}: { email: string }): Promise<string> {
    const existingHash = await this.findOne({email})
    if (existingHash !== undefined) {
      return existingHash.hash!
    }
    const hash = ZCryptoService.hash('sha512', `${this.hashSalt}-${email}`)
    await this.create({ email, hash, is_blacklisted: 0 })
    return hash
  }

  public async create(item: Omit<ZMailBlacklist, 'updated_at'|'created_at'>) {
		const res = await this.sqlService.query((`
      INSERT INTO \`${this.alias}\` (email, hash, is_blacklisted, updated_at, created_at)
      VALUES (:email, :hash, :is_blacklisted, NOW(), NOW())
      ON DUPLICATE KEY UPDATE hash=:hash, updated_at=NOW()
    `), item)
    return item // return Object.assign(item, { invoice_id: res.insertId }) as ZMailBlacklist
  }

	public async findOne(conditions: Partial<ZMailBlacklist>) {
    const rows = await this.findAll(conditions, {limit: 1})
    return rows[0]
	}

  public async findAll(conditions?: Partial<ZMailBlacklistSearch>, opt?: { limit?: number }) {
    const whereKeys = Object.keys(conditions ?? {})
    const whereClause = (whereKeys.length) ? `WHERE ${whereKeys.map(key => `${key}=:${key}`).join(' AND ')}` : ''
    const limit = opt?.limit ? `LIMIT ${opt.limit}` : ''

    return await this.sqlService.exec<ZMailBlacklist[]>({
      query: (/*SQL*/`SELECT * FROM \`${this.alias}\` ${whereClause} ${limit}`),
      params: conditions
    })
  }

  public async update({email, is_blacklisted}: Pick<ZMailBlacklist, 'email'|'is_blacklisted'>): Promise<boolean> {
		const res = await this.sqlService.query(`
      UPDATE \`${this.alias}\` SET is_blacklisted=:is_blacklisted, updated_at=NOW() WHERE email=:email
    `, {email, is_blacklisted})
    return res.affectedRows !== 0
  }


  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE \`${this.alias}\` (
        \`email\` varchar(512) NOT NULL,
        \`hash\` varchar(256) NOT NULL,
        \`is_blacklisted\` tinyint(1) NOT NULL DEFAULT 0,
        \`updated_at\` datetime NOT NULL DEFAULT current_timestamp(),
        \`created_at\` datetime NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`email\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)
  }
}