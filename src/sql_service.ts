import * as mysql from 'mysql'

let instance: ZSqlService | null = null
const logError = (err: any) => { if (err) throw err }

export class ZSqlService {

  constructor(
    private credentials: mysql.ConnectionConfig
  ) {}

  connect(): Promise<mysql.Connection> {
    return new Promise<any>((resolve, reject) => {
      const con = mysql.createConnection(this.credentials);
      con.connect((err: any) => {
        if (err) return reject(err);
        resolve(con);
      });
    });
  }

  async query(sql: string, escaped: any[] = []): Promise<any> {
    const con = await this.connect();
    const output = await new Promise((resolve, reject) => {
      con.query(sql, escaped, (err, result) => {
        if (err) return reject(err);
        resolve(result);
      });
    });
    con.end(logError);
    return output;
  }

  static get(credentials?: mysql.ConnectionConfig): ZSqlService {
    if (instance == null) {
      instance = new ZSqlService(credentials);
    }
    return instance;
  }
}
