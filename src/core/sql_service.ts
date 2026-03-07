import * as mysql from 'mysql'

type ZEventType = 'err'|'log'
type ZOnErrorCallback = (err: mysql.MysqlError) => any
type ZOnLogCallback = (log: string) => any

export type ZSQLOptions = mysql.PoolConfig & {
  dateStringTimezone?: string
  parseBooleans?: boolean
}

/**
 * A scoped transaction handle passed to the `transaction()` callback.
 * All queries executed through this handle run on the same connection
 * inside a single BEGIN / COMMIT / ROLLBACK block.
 */
export interface ZTransaction {
  /** Run a raw query inside the transaction (no type conversions). */
  query<T = any>(sql: string, params?: any[] | { [key: string]: any }): Promise<T[]>
  query(sql: string, params?: any[] | { [key: string]: any }): Promise<{ insertId: number; affectedRows: number }>

  /** Run a query with automatic date/boolean conversions inside the transaction. */
  exec<T = any>(opt: { query: string; params?: any[] | { [key: string]: any } }): Promise<T[]>
  exec(opt: { query: string; params?: any[] | { [key: string]: any } }): Promise<{ insertId: number; affectedRows: number }>
}

export class ZSQLService {

  private pool: mysql.Pool
  private defaultPoolconfig: mysql.PoolConfig = {
    connectionLimit: 10,
    timeout: 20000,
    connectTimeout: 20000,
    acquireTimeout: 20000,
  }
  private listeners: { [eventName: string]: (ZOnErrorCallback|ZOnLogCallback)[] } = {'err': [],'log': []}
  private databaseName: string

  public get database(): string {
    return this.databaseName
  }

  /**
   * Creates a new ZSQLService instance with a MySQL connection pool.
   * @param options - MySQL pool configuration options including custom dateStringTimezone and parseBooleans settings
   */
  constructor(private options: ZSQLOptions) {
    this.databaseName = options.database!
    this.pool = mysql.createPool(Object.assign({}, this.defaultPoolconfig, options))
    this.pool.on('connection', (connection: mysql.Connection) => {
      // connection.config.queryFormat = function (query, values) {
      // }
      connection.on('error', (err) => {
        this.triggerEvent('err', err)
      })
      connection.on('close', (err) => {
        this.triggerEvent('err', err)
      })
    })
  }

  /**
   * Registers an event listener for database errors or logs.
   * @param eventName - The event type to listen for ('err' or 'log')
   * @param listener - The callback function to execute when the event occurs
   * @throws Error if the event name is not supported
   */
  public on(eventName: 'err', listener: ZOnErrorCallback): void
  public on(eventName: 'log', listener: ZOnLogCallback): void
  public on(eventName: ZEventType, listener: ZOnErrorCallback|ZOnLogCallback): void {
    if (!this.listeners.hasOwnProperty(eventName))
      throw new Error(`EventName not supported for ZSqlService.on(${eventName}, ...)`)
    this.listeners[eventName].push(listener)
  }

  private triggerEvent(eventName: ZEventType, args: any[]) {
    this.listeners[eventName].map((listener) => {
      listener.apply(undefined, args)
    })
  }

  private getPoolConnection(): Promise<mysql.PoolConnection> {
    return new Promise<any>((resolve, reject) => {
      this.pool.getConnection((err: mysql.MysqlError, con: mysql.PoolConnection) =>
        (err) ? reject(err) : resolve(con))
    })
  }

  /**
   * Executes a SQL query with automatic type conversion for dates and booleans.
   * Converts TINYINT(1) columns to booleans if parseBooleans option is enabled.
   * Converts date strings to Date objects if dateStringTimezone option is set.
   * @template T - The expected result type
   * @param opt - Query options containing the SQL query string and optional parameters
   * @param opt.query - The SQL query string to execute
   * @param opt.params - Optional query parameters (array for positional, object for named parameters)
   * @returns Promise resolving to query results with type conversions applied
   */
  public async exec(opt: { query: string, params?: any[]|{[key: string]: any} }): Promise<{insertId: number, affectedRows: number}>
  public async exec<T=any>(opt: { query: string, params?: any[]|{[key: string]: any} }): Promise<T[]>
  public async exec<T>(opt: { query: string, params?: any[]|{[key: string]: any} }): Promise<{insertId: number, affectedRows: number}|T[]> {
    const { results, fields } = await this.queryWithFields<T>(opt.query, opt.params)
    if (!Array.isArray(results)) {
      return results
    }
    if (!this.options.dateStringTimezone && !this.options.parseBooleans) {
      return results
    }

    // Build a set of column names that are TINYINT(1) for boolean conversion
    const booleanColumns = new Set<string>()
    if (this.options.parseBooleans && fields) {
      fields.forEach(field => {
        // Check if column is TINYINT(1) - type 1 is TINY, length 1 means TINYINT(1)
        if (field.type === 1 && field.length === 1) {
          booleanColumns.add(field.name)
        }
      })
    }

    return results.map(row => {
      Object.keys(row).map(key => {
        if (this.options.dateStringTimezone && this.isSqlDate(row[key])) {
          row[key] = new Date(row[key] + this.options.dateStringTimezone)
        }
        if (this.options.parseBooleans && booleanColumns.has(key) && (row[key] === 0 || row[key] === 1)) {
          row[key] = row[key] === 1
        }
      })
      return row
    })
  }


  /**
   * Legacy method to execute a SQL query. Uses uppercase property names for backwards compatibility.
   * Applies date and boolean conversions if configured. Consider using exec() directly for new code.
   * @template T - The expected result type
   * @param opt - Query options
   * @param opt.Query - The SQL query string to execute
   * @param opt.Params - Named parameters for the query
   * @returns Promise resolving to query results
   */
  public async fetch<T=any>(opt: { Query: string, Params: {[key: string]: any}|any[] }): Promise<T[]>
  public async fetch<T=any>(query: string, params: {[key:string]: any}|any[]) : Promise<T[]>
  public async fetch<T>(opt: { Query: string, Params: {[key: string]: any}|any[] }|string, params?: {[key:string]: any}|any[]): Promise<T[]> {
    if (typeof opt === 'string') {
      return await this.exec<T>({ query: opt, params })
    }
    return await this.exec<T>({ query: opt.Query, params: opt.Params })
  }

  /**
   * Executes a SQL query without type conversions.
   * Supports both positional (array) and named (object) parameters.
   * @template T - The expected result type
   * @param sql - The SQL query string to execute
   * @param params - Optional query parameters (array for positional with ?, object for named with :key)
   * @returns Promise resolving to query results or insert/update metadata
   */
  public async query(sql: string, params?: any[]|{[key: string]: any}): Promise<{insertId: number, affectedRows: number}>
  public async query<T = any>(sql: string, params?: any[]|{[key: string]: any}): Promise<T[]>
  public async query<T>(sql: string, params?: any[]|{[key: string]: any}): Promise<{insertId: number, affectedRows: number}|T[]> {
    try {
      const con: mysql.PoolConnection = await this.getPoolConnection()
      try {
        const output = await new Promise<T[]>((resolve, reject) => {
          if (Array.isArray(params)) {
            con.query(sql, params, (err, result) => (err) ? reject(err) : resolve(result))
          } else {
            sql = this.formatQueryParams(con, sql, params)
            con.query(sql, (err, result) => (err) ? reject(err) : resolve(result))
          }
        })
        con.release()
        return output
      } catch (err) {
        con.release()
        throw err
      }
    } catch (err) {
      throw err
    }
  }

  private async queryWithFields<T>(sql: string, params?: any[]|{[key: string]: any}): Promise<{ results: T[], fields: mysql.FieldInfo[] }> {
    try {
      const con: mysql.PoolConnection = await this.getPoolConnection()
      try {
        const output = await new Promise<{ results: T[], fields: mysql.FieldInfo[] }>((resolve, reject) => {
          if (Array.isArray(params)) {
            con.query(sql, params, (err, results, fields) => {
              if (err) {
                reject(err)
              } else {
                resolve({ results, fields })
              }
            })
          } else {
            sql = this.formatQueryParams(con, sql, params)
            con.query(sql, (err, results, fields) => {
              if (err) {
                reject(err)
              } else {
                resolve({ results, fields })
              }
            })
          }
        })
        con.release()
        return output
      } catch (err) {
        con.release()
        throw err
      }
    } catch (err) {
      throw err
    }
  }

  private formatQueryParams(con: mysql.PoolConnection, query, values) {
    if (!values) {
      return query
    }
    return query.replace(/\:(\w+)/g, (txt: any, key: any) => {
      return (values.hasOwnProperty(key)) ? con.escape(values[key]) : txt
    })
  }

  private isSqlDate(str: string) {
    if (str && typeof str === 'string' && str[4] === '-' && str[7] === '-' && str[10] === ' ' && str[13] === ':' && str[16] === ':') {
      return true
    }
    return false
  }

  // ── Transaction helpers ────────────────────────────────────────────

  private beginTransaction(con: mysql.PoolConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      con.beginTransaction((err) => (err ? reject(err) : resolve()))
    })
  }

  private commitTransaction(con: mysql.PoolConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      con.commit((err) => (err ? reject(err) : resolve()))
    })
  }

  private rollbackTransaction(con: mysql.PoolConnection): Promise<void> {
    return new Promise((resolve, reject) => {
      con.rollback(() => resolve()) // rollback should not throw
    })
  }

  private queryOnConnection<T>(con: mysql.PoolConnection, sql: string, params?: any[] | { [key: string]: any }): Promise<T[]> {
    return new Promise<T[]>((resolve, reject) => {
      if (Array.isArray(params)) {
        con.query(sql, params, (err, result) => (err ? reject(err) : resolve(result)))
      } else {
        sql = this.formatQueryParams(con, sql, params)
        con.query(sql, (err, result) => (err ? reject(err) : resolve(result)))
      }
    })
  }

  private queryOnConnectionWithFields<T>(con: mysql.PoolConnection, sql: string, params?: any[] | { [key: string]: any }): Promise<{ results: T[]; fields: mysql.FieldInfo[] }> {
    return new Promise((resolve, reject) => {
      if (Array.isArray(params)) {
        con.query(sql, params, (err, results, fields) => (err ? reject(err) : resolve({ results, fields })))
      } else {
        sql = this.formatQueryParams(con, sql, params)
        con.query(sql, (err, results, fields) => (err ? reject(err) : resolve({ results, fields })))
      }
    })
  }

  private buildExecOnConnection(con: mysql.PoolConnection) {
    const self = this
    return async function execOnConnection<T = any>(opt: { query: string; params?: any[] | { [key: string]: any } }): Promise<any> {
      const { results, fields } = await self.queryOnConnectionWithFields<T>(con, opt.query, opt.params)
      if (!Array.isArray(results)) return results
      if (!self.options.dateStringTimezone && !self.options.parseBooleans) return results

      const booleanColumns = new Set<string>()
      if (self.options.parseBooleans && fields) {
        fields.forEach(field => {
          if (field.type === 1 && field.length === 1) booleanColumns.add(field.name)
        })
      }
      return results.map(row => {
        Object.keys(row).map(key => {
          if (self.options.dateStringTimezone && self.isSqlDate(row[key])) {
            row[key] = new Date(row[key] + self.options.dateStringTimezone)
          }
          if (self.options.parseBooleans && booleanColumns.has(key) && (row[key] === 0 || row[key] === 1)) {
            row[key] = row[key] === 1
          }
        })
        return row
      })
    }
  }

  /**
   * Executes a callback inside a database transaction.
   * Automatically calls BEGIN before and COMMIT after the callback.
   * If the callback throws, the transaction is rolled back and the error is re-thrown.
   *
   * @template T - The return type of the callback
   * @param fn - An async function that receives a {@link ZTransaction} handle
   * @returns The value returned by `fn`
   *
   * @example
   * ```ts
   * const result = await sqlService.transaction(async (trx) => {
   *   await trx.query('INSERT INTO orders (customer_id) VALUES (:id)', { id: 42 })
   *   await trx.query('UPDATE inventory SET stock = stock - 1 WHERE product_id = :pid', { pid: 7 })
   *   return 'done'
   * })
   * ```
   */
  public async transaction<T = void>(fn: (trx: ZTransaction) => Promise<T>): Promise<T> {
    const con = await this.getPoolConnection()
    await this.beginTransaction(con)

    const trx: ZTransaction = {
      query: ((sql: string, params?: any[] | { [key: string]: any }) => {
        return this.queryOnConnection(con, sql, params)
      }) as ZTransaction['query'],
      exec: this.buildExecOnConnection(con) as ZTransaction['exec'],
    }

    try {
      const result = await fn(trx)
      await this.commitTransaction(con)
      con.release()
      return result
    } catch (err) {
      await this.rollbackTransaction(con)
      con.release()
      throw err
    }
  }

  /**
   * Changes the active database by closing the current connection pool and creating a new one.
   * All active connections will be gracefully closed before switching.
   * @param newDatabase - The name of the database to switch to
   * @returns Promise that resolves when the database has been changed successfully
   * @throws Error if the pool cannot be closed or new pool cannot be created
   */
  public async changeDatabase(newDatabase: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pool.end((err) => {
        if (err) {
          reject(err)
          return
        }
        this.databaseName = newDatabase
        const newOptions = { ...this.options, database: newDatabase }
        this.pool = mysql.createPool(Object.assign({}, this.defaultPoolconfig, newOptions))
        
        this.pool.on('connection', (connection: mysql.Connection) => {
          connection.on('error', (err) => {
            this.triggerEvent('err', err)
          })
          connection.on('close', (err) => {
            this.triggerEvent('err', err)
          })
        })
        
        resolve()
      })
    })
  }
}