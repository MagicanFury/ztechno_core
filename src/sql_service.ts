import * as mysql from 'mysql'

let instance: ZSqlService | null = null
const handleError = (err: any) => { if (err) throw err }

export class ZSqlService {

  private pool: mysql.Pool
  private defaultPoolconfig: mysql.PoolConfig = {
    timeout: 20000,
    connectTimeout: 10
  }

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

  private getPoolConnection(): Promise<mysql.PoolConnection> {
    return new Promise<any>((resolve, reject) => {
      this.pool.getConnection((err: mysql.MysqlError, con: mysql.PoolConnection) => 
        (err) ? reject(err) : resolve(con))
    })
  }

  async query(sql: string, escaped: any[] = []): Promise<any> {
    const con = await this.getPoolConnection()
    try {
      const output = await new Promise((resolve, reject) => {
        con.query(sql, escaped, (err, result) =>
          (err) ? reject(err) : resolve(result))
      })
      return output
    } catch (err) {
      handleError(err)
    } finally {
      con.release()
    }
  }

  static get(credentials?: mysql.ConnectionConfig): ZSqlService {
    if (instance == null) {
      instance = new ZSqlService(credentials)
    }
    return instance
  }
}
