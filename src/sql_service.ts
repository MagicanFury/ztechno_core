import * as mysql from 'mysql';

let instance: ZSqlService | null = null;
const logError = (err: any) => {
  if (err) throw err;
};
let creds: mysql.ConnectionConfig | undefined;

export class ZSqlService {
  public static init(credentials: mysql.ConnectionConfig) {
    creds = credentials;
  }

  connect(): Promise<mysql.Connection> {
    return new Promise<any>((resolve, reject) => {
      const con = mysql.createConnection(creds!);
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

  static get(): ZSqlService {
    if (instance == null) {
      instance = new ZSqlService();
    }
    return instance;
  }
}
