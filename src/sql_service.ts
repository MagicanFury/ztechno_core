import * as mysql from 'mysql'

let instance: ZSqlService | null = null
const handleError = (err: any) => { if (err) throw err }

type ZEventType = 'err'|'log'
type ZOnErrorCallback = (err: mysql.MysqlError) => any
type ZOnLogCallback = (log: string) => any

export class ZSqlService {

  private pool: mysql.Pool
  private defaultPoolconfig: mysql.PoolConfig = {
    timeout: 20000,
    connectTimeout: 10
  }
  private listeners: { [eventName: string]: (ZOnErrorCallback|ZOnLogCallback)[] } = {'err': [],'log': []}

  constructor(options: mysql.PoolConfig) {
    this.pool = mysql.createPool(Object.assign({}, this.defaultPoolconfig, options))
    this.pool.on('connection', (connection: mysql.Connection) => {
      connection.on('error', (err) => {
        console.error(new Date(), 'MySQL error', err.code)
      })
      connection.on('close', (err) => {
        console.error(new Date(), 'MySQL close', err)
      })
    })
  }

  public on(eventName: 'err', listener: ZOnErrorCallback)
  public on(eventName: 'log', listener: ZOnLogCallback)
  public on(eventName: ZEventType, listener: ZOnErrorCallback|ZOnLogCallback) {
    if (!this.listeners.hasOwnProperty(eventName))
      throw new Error(`EventName not supported for ZSqlService.on(${eventName}, ...)`)
    this.listeners[eventName].push(listener)
  }

  private getPoolConnection(): Promise<mysql.PoolConnection> {
    return new Promise<any>((resolve, reject) => {
      this.pool.getConnection((err: mysql.MysqlError, con: mysql.PoolConnection) => 
        (err) ? reject(err) : resolve(con))
    })
  }

  public async query(sql: string, escaped: any[] = []): Promise<any> {
    try {
      let con: mysql.PoolConnection = await this.getPoolConnection()
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