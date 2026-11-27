import { ZOrm } from "./orm"
import { ZSQLService } from "../sql_service"
import { ZMailLog, ZMailLogCreate, ZMailLogSearch, ZMailLogPage } from "../types/mail_types"

const MAX_PAGE_SIZE = 100

export class ZMailLogOrm extends ZOrm {

  constructor(opt: { sqlService: ZSQLService, alias?: string }) {
    super({ sqlService: opt.sqlService, alias: opt.alias ?? 'email_log' })
  }

  public async create(item: ZMailLogCreate): Promise<number> {
    const res = await this.sqlService.query(/*SQL*/`
      INSERT INTO \`${this.alias}\` (
        status, recipient, cc, from_address, subject, category, context_type, context_id,
        message_id, smtp_response, accepted, rejected, error_message, attachment_count, created_at
      ) VALUES (
        :status, :recipient, :cc, :from_address, :subject, :category, :context_type, :context_id,
        :message_id, :smtp_response, :accepted, :rejected, :error_message, :attachment_count, NOW()
      )
    `, {
      status: item.status,
      recipient: item.recipient,
      cc: item.cc ?? null,
      from_address: item.from_address ?? null,
      subject: item.subject,
      category: item.category ?? null,
      context_type: item.context_type ?? null,
      context_id: item.context_id ?? null,
      message_id: item.message_id ?? null,
      smtp_response: item.smtp_response ?? null,
      accepted: item.accepted ?? null,
      rejected: item.rejected ?? null,
      error_message: item.error_message ?? null,
      attachment_count: item.attachment_count ?? 0,
    })
    return res.insertId
  }

  /** Newest first. `pageSize` is capped at 100; `page` starts at 1. */
  public async findPage(conditions?: ZMailLogSearch, opt?: { page?: number, pageSize?: number }): Promise<ZMailLogPage> {
    const pageSize = Math.min(Math.max(Math.floor(opt?.pageSize ?? 25) || 25, 1), MAX_PAGE_SIZE)
    const page = Math.max(Math.floor(opt?.page ?? 1) || 1, 1)

    const where: string[] = []
    const params: { [key: string]: any } = {}
    if (conditions?.status) {
      where.push('status = :status')
      params.status = conditions.status
    }
    if (conditions?.category) {
      where.push('category = :category')
      params.category = conditions.category
    }
    if (conditions?.context_type) {
      where.push('context_type = :context_type')
      params.context_type = conditions.context_type
    }
    if (conditions?.context_id) {
      where.push('context_id = :context_id')
      params.context_id = conditions.context_id
    }
    if (conditions?.q) {
      where.push('(recipient LIKE :q OR subject LIKE :q)')
      params.q = `%${conditions.q.replace(/[\\%_]/g, '\\$&')}%`
    }
    const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const counted = await this.sqlService.exec<{ total: number }>({
      query: /*SQL*/`SELECT COUNT(*) AS total FROM \`${this.alias}\` ${whereClause}`,
      params,
    })
    const rows = await this.sqlService.exec<ZMailLog>({
      query: /*SQL*/`
        SELECT * FROM \`${this.alias}\` ${whereClause}
        ORDER BY created_at DESC, id DESC
        LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}
      `,
      params,
    })
    return { rows, total: Number(counted[0]?.total ?? 0), page, pageSize }
  }

  public override async createTable(): Promise<void> {
    await this.sqlService.query(/*SQL*/`
      CREATE TABLE \`${this.alias}\` (
        \`id\` int(11) NOT NULL AUTO_INCREMENT,
        \`status\` enum('sent','failed','skipped_blacklisted') NOT NULL,
        \`recipient\` varchar(512) NOT NULL,
        \`cc\` varchar(1024) DEFAULT NULL,
        \`from_address\` varchar(512) DEFAULT NULL,
        \`subject\` varchar(1024) NOT NULL,
        \`category\` varchar(64) DEFAULT NULL,
        \`context_type\` varchar(64) DEFAULT NULL,
        \`context_id\` varchar(64) DEFAULT NULL,
        \`message_id\` varchar(512) DEFAULT NULL,
        \`smtp_response\` varchar(1024) DEFAULT NULL,
        \`accepted\` text DEFAULT NULL,
        \`rejected\` text DEFAULT NULL,
        \`error_message\` text DEFAULT NULL,
        \`attachment_count\` int(11) NOT NULL DEFAULT 0,
        \`created_at\` datetime NOT NULL DEFAULT current_timestamp(),
        PRIMARY KEY (\`id\`),
        KEY \`created_at\` (\`created_at\`),
        KEY \`status\` (\`status\`),
        KEY \`recipient\` (\`recipient\`(191)),
        KEY \`context\` (\`context_type\`, \`context_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `)
  }
}
