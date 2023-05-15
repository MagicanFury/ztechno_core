import * as mysql from 'mysql'

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

  public get database(): string {
    return this.databaseName
  }

  constructor(options: mysql.PoolConfig) {
    this.databaseName = options.database!
    this.pool = mysql.createPool(Object.assign({}, this.defaultPoolconfig, options))
    this.pool.on('connection', (connection: mysql.Connection) => {
      connection.config.queryFormat = function (query, values) {
        if (!values) {
          return query
        }
        return query.replace(/\:(\w+)/g, function (txt: any, key: any) {
          return (values.hasOwnProperty(key)) ? this.escape(values[key]) : txt
        }.bind(this))
      }
      connection.on('error', (err) => {
        this.triggerEvent('err', err)
      })
      connection.on('close', (err) => {
        this.triggerEvent('err', err)
      })
    })
  }

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

  public async query<T = any>(sql: string, params?: {[key: string]: any}): Promise<T[]>
  public async query<T = any>(sql: string, params?: any[]): Promise<T[]>
  public async query<T = any>(sql: string, params: any): Promise<T[]> {
    try {
      const con: mysql.PoolConnection = await this.getPoolConnection()
      try {
        const output = await new Promise<T[]>((resolve, reject) => {
          con.query(sql, params, (err, result) => (err) ? reject(err) : resolve(result))
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
}