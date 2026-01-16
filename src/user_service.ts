import { ZCryptoService } from "./crypto_service"
import { ZSQLService } from "./sql_service"
import { ZRequiredUserColumns, ZRequiredUserColumnsExtended, ZUser, ZUserCore, ZUserSession, ZUserCredentials, ZUserTableConfig } from "./typings"

/**
 * Generic User Service that can be extended with custom user fields
 * @template TUser - The user type (defaults to ZUser for backward compatibility)
 * @template TUserCreate - The user creation type (defaults to ZRequiredUserColumns)
 */
export class ZUserService<TUser extends ZUserCore = ZUser, TUserCreate extends ZRequiredUserColumns = ZRequiredUserColumns> {

  protected tableName: string
  protected sqlService: ZSQLService
  protected tableConfig: ZUserTableConfig
  
  private salt: string

  /**
   * Creates a new ZUserService instance
   * @param options - Configuration options including SQL service and optional table configuration
   */
  constructor({ sqlService, tableConfig }: { sqlService: ZSQLService, tableConfig?: ZUserTableConfig }) {
    this.sqlService = sqlService
    this.tableConfig = tableConfig || {}
    this.tableName = this.tableConfig.tableName || 'users'
    this.salt = sqlService.database
  }

  /**
   * Gets the base table columns definition
   * @returns SQL column definitions for core user fields
   * @protected
   */
  protected getBaseTableColumns(): string {
    return `
      \`user_id\` int(10) unsigned NOT NULL AUTO_INCREMENT,
      \`email\` varchar(255) NOT NULL,
      \`role\` varchar(64) DEFAULT NULL,
      \`pass\` varchar(512) NOT NULL,
      \`session\` varchar(512) NOT NULL,
      \`admin\` tinyint(1) NOT NULL DEFAULT 0,
      \`updated_at\` datetime NOT NULL DEFAULT current_timestamp() ON UPDATE current_timestamp(),
      \`created_at\` datetime NOT NULL DEFAULT current_timestamp()
    `
  }

  /**
   * Gets custom table columns if defined
   * @returns SQL column definitions for custom fields
   * @protected
   */
  protected getCustomTableColumns(): string {
    if (!this.tableConfig.customColumns) return ''
    
    return Object.entries(this.tableConfig.customColumns)
      .map(([columnName, definition]) => `\`${columnName}\` ${definition}`)
      .join(',\n      ')
  }

  /**
   * Gets base table indexes
   * @returns SQL index definitions for core fields
   * @protected
   */
  protected getBaseTableIndexes(): string {
    return `
      PRIMARY KEY (\`user_id\`),
      UNIQUE KEY \`email_UNIQUE\` (\`email\`),
      KEY \`email\` (\`email\`),
      KEY \`role\` (\`role\`),
      KEY \`admin\` (\`admin\`),
      KEY \`created_at\` (\`created_at\`),
      KEY \`updated_at\` (\`updated_at\`),
      KEY \`session\` (\`session\`)
    `
  }

  /**
   * Gets custom table indexes if defined
   * @returns SQL index definitions for custom fields
   * @protected
   */
  protected getCustomTableIndexes(): string {
    if (!this.tableConfig.customIndexes) return ''
    
    return this.tableConfig.customIndexes
      .map(index => index.trim())
      .filter(index => index.length > 0)
      .join(',\n      ')
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
    const baseColumns = this.getBaseTableColumns()
    const customColumns = this.getCustomTableColumns()
    const baseIndexes = this.getBaseTableIndexes()
    const customIndexes = this.getCustomTableIndexes()
    
    const allColumns = customColumns 
      ? `${baseColumns},\n      ${customColumns}`
      : baseColumns
      
    const allIndexes = customIndexes
      ? `${baseIndexes},\n      ${customIndexes}`
      : baseIndexes

    await this.sqlService.query(`
      CREATE TABLE \`${this.tableName}\` (
        ${allColumns},
        ${allIndexes}
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `)
  }

  public async ensureTableExists() {
    const exists = await this.checkTableExists()
    if (!exists) {
      await this.createTable()
    }
  }

  /**
   * Registers a new user with extensible data
   * @param userData - User data including core fields and any custom fields
   * @returns Promise resolving to session information
   */
  public async register(userData: TUserCreate): Promise<{ session: string }> {
    const session = this.genSession({ email: userData.email, pass: userData.pass })
    
    // Build dynamic SQL for insertion
    const coreFields = ['email', 'pass', 'session', 'role', 'admin']
    const customFields = Object.keys(userData).filter(key => !coreFields.includes(key) && key !== 'pass')
    
    const allFields = [...coreFields, ...customFields]
    const placeholders = allFields.map(() => '?').join(', ')
    const fieldNames = allFields.map(field => `\`${field}\``).join(', ')
    
    const values = allFields.map(field => {
      if (field === 'pass') return this.hashPass({ email: userData.email, pass: userData.pass })
      if (field === 'session') return session
      return (userData as any)[field]
    })

    await this.sqlService.query(`
      INSERT INTO \`${this.tableName}\` (${fieldNames})
      VALUES (${placeholders})
    `, values)
    
    return { session }
  }

  /**
   * Gets all available columns for SELECT queries
   * @returns Comma-separated list of column names
   * @protected
   */
  protected getSelectColumns(): string {
    const baseColumns = ['user_id', 'email', 'session', 'role', 'admin', 'updated_at', 'created_at']
    const customColumns = this.tableConfig.customColumns ? Object.keys(this.tableConfig.customColumns) : []
    
    return [...baseColumns, ...customColumns]
      .map(col => `\`${col}\``)
      .join(', ')
  }

  public async find(opt: { email: string }|{ user_id: number }): Promise<TUser|undefined>
  public async find(opt: any): Promise<TUser|undefined> {
    const selectColumns = this.getSelectColumns()
    
    if (opt.email !== undefined) {
      const rows = await this.sqlService.fetch<TUser>({
        Query: (/*SQL*/`
          SELECT ${selectColumns} FROM \`${this.tableName}\`
          WHERE email=:email
        `), 
        Params: {email: opt.email}
      })
      return rows[0]
    } else if (opt.user_id !== undefined) {
      const rows = await this.sqlService.fetch<TUser>({
        Query: (/*SQL*/`
          SELECT ${selectColumns} FROM \`${this.tableName}\`
          WHERE user_id=:user_id
        `),
        Params: {user_id: opt.user_id}
      })
      return rows[0]
    } else {
      throw new Error(`Unexpected Input for ZUserService.find(${JSON.stringify(opt)})`)
    }
  }

  public async auth(opt: ZUserSession|ZUserCredentials): Promise<{user?: TUser, session?: string, authenticated: boolean}>
  public async auth(opt: Partial<ZUserSession & ZUserCredentials>): Promise<{user?: TUser, session?: string, authenticated: boolean}> {
    if (!opt.session && (!opt.email && !opt.pass)) {
      return { authenticated: false }
    }
    const selectColumns = this.getSelectColumns()
    const res = await ((opt.session) ? this.sqlService.fetch<TUser>({
      Query: (/*SQL*/`
        SELECT ${selectColumns} FROM \`${this.tableName}\` WHERE session=?
      `),
      Params: [opt.session]
    }) : this.sqlService.fetch<TUser>({
      Query: (/*SQL*/`
        SELECT ${selectColumns} FROM \`${this.tableName}\` WHERE email=? AND pass=?
      `),
      Params: [opt.email, this.hashPass(opt as any)]
    }))
    return (res.length === 0) ? { authenticated: false } : { user: res[0], session: res[0].session, authenticated: true }
  }

  public async fetch(opt?: { limit?: number }): Promise<TUser[]> {
    const selectColumns = this.getSelectColumns()
    const limit = opt?.limit || 100
    
    const rows = await this.sqlService.fetch<TUser>(`
      SELECT ${selectColumns} FROM \`${this.tableName}\`
      ORDER BY created_at DESC
      LIMIT ?
    `, [limit])
    return rows as TUser[]
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