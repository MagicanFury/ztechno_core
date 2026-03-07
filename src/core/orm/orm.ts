import { ZSQLService } from "../sql_service"

/**
 * Safely converts a value to a JSON string for storage in a JSON column.
 * Prevents the mysql driver from expanding plain objects into `key`=value pairs.
 */
export function toJsonColumn(value: any): string | null {
  if (value == null) return null
  return typeof value === 'string' ? value : JSON.stringify(value)
}

/**
 * Converts an ISO 8601 date string (e.g. from Mollie API) to MySQL DATETIME format.
 * Accepts `2026-02-26T00:47:04+00:00` → `2026-02-26 00:47:04`
 */
export function toDatetime(value: string | null | undefined): string | null {
  if (value == null) return null
  const d = new Date(value)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Converts a Date object to MySQL DATETIME format.
 */
export function formatDatetime(value: Date): string {
  return value.toISOString().slice(0, 19).replace('T', ' ')
}

/**
 * Converts a date-only string (e.g. `2026-02-26`) to MySQL DATETIME format.
 */
export function toDatetimeFromDateOnly(value: string | null | undefined): string | null {
  if (value == null) return null
  return toDatetime(`${value}T00:00:00Z`)
}

export class ZOrm {

  public readonly alias: string
  protected sqlService: ZSQLService
  
  constructor(opt: { alias: string, sqlService: ZSQLService }) {
    this.alias = opt.alias
    this.sqlService = opt.sqlService
  }

  public async ensureTableExists() {
    const exists = await this.checkTableExists()
    if (!exists) {
      await this.createTable()
    }
  }

  private async checkTableExists() {
    const res = await this.sqlService.query<any[]>(`
      SELECT ENGINE, VERSION, CREATE_TIME FROM information_schema.tables
      WHERE table_schema = '${this.sqlService.database}' AND table_name = '${this.alias}'
      LIMIT 1
    `)
    return res.length > 0
  }

  public async createTable() {
    throw new Error(`${this.alias} Create Table Statement Not Implemented!`)
  }
}