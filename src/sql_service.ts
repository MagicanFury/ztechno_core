import * as mysql from 'mysql'

let instance: ZSqlService | null = null
type ZEventType = 'err'|'log'
type ZOnErrorCallback = (err: mysql.MysqlError) => any
type ZOnLogCallback = (log: string) => any

export class ZSqlService {

  private pool: mysql.Pool
  private defaultPoolconfig: mysql.PoolConfig = {
    connectionLimit: 10,
    timeout: 20000,
    connectTimeout: 20000,
    acquireTimeout: 20000,
  }
  private listeners: { [eventName: string]: (ZOnErrorCallback|ZOnLogCallback)[] } = {'err': [],'log': []}
  private databaseName: string

  constructor(options: mysql.PoolConfig) {
    this.databaseName = options.database!
    this.pool = mysql.createPool(Object.assign({}, this.defaultPoolconfig, options))
    this.pool.on('connection', (connection: mysql.Connection) => {
      connection.on('error', (err) => {
        this.triggerEvent('err', err)
      })
      connection.on('close', (err) => {
        this.triggerEvent('err', err)
      })
    })
  }

  public get database(): string {
    return this.databaseName
  }

  public on(eventName: 'err', listener: ZOnErrorCallback)
  public on(eventName: 'log', listener: ZOnLogCallback)
  public on(eventName: ZEventType, listener: ZOnErrorCallback|ZOnLogCallback) {
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

  public async query(sql: string, escaped: any[] = []): Promise<any> {
    try {
      const con: mysql.PoolConnection = await this.getPoolConnection()
      try {
        const output = await new Promise((resolve, reject) => {
          con.query(sql, escaped, (err, result) =>
          (err) ? reject(err) : resolve(result))
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

  public static get(options: mysql.PoolConfig): ZSqlService {
    if (instance == null) {
      instance = new ZSqlService(options)
    }
    return instance
  }
}