import { ZSQLService } from "../sql_service"
import type { 
  DatabaseSchema, 
  TableDefinition, 
  ViewDefinition, 
  FunctionDefinition, 
  ProcedureDefinition, 
  TriggerDefinition, 
  EventDefinition,
  SchemaImportOptions,
  SchemaImportResult
} from "./types"

/**
 * MySQL Schema Importer
 * 
 * Imports and applies database schemas from JSON or other schema definitions.
 * Can create tables, views, stored procedures, functions, triggers, and events.
 * 
 * @example
 * ```typescript
 * const importer = new MySQLSchemaImporter()
 * 
 * // Load schema from JSON file
 * const schema = await importer.loadSchemaFromFile('./schema/database.json')
 * 
 * // Apply schema to database
 * const result = await importer.applySchema(schema, {
 *   dropExisting: false,
 *   createTables: true,
 *   createViews: true
 * })
 * 
 * console.log(`Created ${result.tablesCreated.length} tables`)
 * ```
 */
export class MySQLSchemaImporter {

  constructor(private sql: ZSQLService) {}
  
  /**
   * Load schema from JSON file
   */
  public async loadSchemaFromFile(filePath: string): Promise<DatabaseSchema> {
    const fs = require('fs')
    const content = fs.readFileSync(filePath, 'utf8')
    return JSON.parse(content) as DatabaseSchema
  }

  /**
   * Load schema from JSON string
   */
  public loadSchemaFromJSON(jsonString: string): DatabaseSchema {
    return JSON.parse(jsonString) as DatabaseSchema
  }

  /**
   * Apply complete schema to database
   */
  public async applySchema(
    schema: DatabaseSchema,
    options?: SchemaImportOptions & {
      targetDatabase?: string  // Target database name for updating references
    }
  ): Promise<SchemaImportResult> {
    const defaultOptions: SchemaImportOptions = {
      dropExisting: false,
      createTables: true,
      createViews: true,
      createFunctions: true,
      createProcedures: true,
      createTriggers: true,
      createEvents: true,
      skipErrors: false,
      dryRun: false
    }

    const opts = { ...defaultOptions, ...options }
    const result: SchemaImportResult = {
      success: true,
      tablesCreated: [],
      viewsCreated: [],
      functionsCreated: [],
      proceduresCreated: [],
      triggersCreated: [],
      eventsCreated: [],
      errors: [],
      warnings: []
    }

    try {
      // Disable foreign key checks during import
      if (!opts.dryRun) {
        await this.sql.query('SET FOREIGN_KEY_CHECKS = 0')
      }

      // Create tables first (because of dependencies)
      if (opts.createTables && schema.tables) {
        for (const table of schema.tables) {
          try {
            await this.createTable(table, opts)
            result.tablesCreated.push(table.name)
          } catch (error: any) {
            result.errors.push({
              object: `table:${table.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Create views
      if (opts.createViews && schema.views) {
        for (const view of schema.views) {
          try {
            await this.createView(view, opts, schema.databaseName, opts.targetDatabase)
            result.viewsCreated.push(view.name)
          } catch (error: any) {
            result.errors.push({
              object: `view:${view.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Create functions
      if (opts.createFunctions && schema.functions) {
        for (const func of schema.functions) {
          try {
            await this.createFunction(func, opts)
            result.functionsCreated.push(func.name)
          } catch (error: any) {
            result.errors.push({
              object: `function:${func.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Create procedures
      if (opts.createProcedures && schema.procedures) {
        for (const proc of schema.procedures) {
          try {
            await this.createProcedure(proc, opts)
            result.proceduresCreated.push(proc.name)
          } catch (error: any) {
            result.errors.push({
              object: `procedure:${proc.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Create triggers
      if (opts.createTriggers && schema.triggers) {
        for (const trigger of schema.triggers) {
          try {
            await this.createTrigger(trigger, opts)
            result.triggersCreated.push(trigger.name)
          } catch (error: any) {
            result.errors.push({
              object: `trigger:${trigger.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Create events
      if (opts.createEvents && schema.events) {
        for (const event of schema.events) {
          try {
            await this.createEvent(event, opts)
            result.eventsCreated.push(event.name)
          } catch (error: any) {
            result.errors.push({
              object: `event:${event.name}`,
              error: error.message
            })
            if (!opts.skipErrors) {
              throw error
            }
          }
        }
      }

      // Re-enable foreign key checks
      if (!opts.dryRun) {
        await this.sql.query('SET FOREIGN_KEY_CHECKS = 1')
      }

    } catch (error: any) {
      result.success = false
      if (!result.errors.some(e => e.error === error.message)) {
        result.errors.push({
          object: 'schema',
          error: error.message
        })
      }
    }

    result.success = result.errors.length === 0

    return result
  }

  /**
   * Create a table from definition
   */
  private async createTable(table: TableDefinition, options: SchemaImportOptions): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create table: ${table.name}`)
      return
    }

    // Drop if exists
    if (options.dropExisting) {
      await this.sql.query(`DROP TABLE IF EXISTS \`${table.name}\``)
    }

    // Use the stored CREATE statement if available
    if (table.createStatement) {
      await this.sql.query(table.createStatement)
      return
    }

    // Otherwise, generate CREATE statement from table definition
    const createSQL = this.generateCreateTableSQL(table)
    await this.sql.query(createSQL)
  }

  /**
   * Generate CREATE TABLE SQL from table definition
   */
  private generateCreateTableSQL(table: TableDefinition): string {
    const lines: string[] = []
    lines.push(`CREATE TABLE IF NOT EXISTS \`${table.name}\` (`)

    // Columns
    const columnDefs = table.columns.map(col => {
      let def = `  \`${col.name}\` ${col.type}`
      
      if (!col.nullable) {
        def += ' NOT NULL'
      }
      
      if (col.defaultValue !== null) {
        def += ` DEFAULT ${col.defaultValue}`
      }
      
      if (col.extra) {
        def += ` ${col.extra}`
      }
      
      if (col.comment) {
        def += ` COMMENT '${col.comment.replace(/'/g, "''")}'`
      }
      
      return def
    })

    lines.push(columnDefs.join(',\n'))

    // Primary key
    const primaryKeys = table.columns.filter(c => c.key === 'PRI').map(c => c.name)
    if (primaryKeys.length > 0) {
      lines.push(`,  PRIMARY KEY (${primaryKeys.map(k => `\`${k}\``).join(', ')})`)
    }

    // Indexes (excluding primary key)
    const uniqueIndexes = new Map<string, string[]>()
    for (const idx of table.indexes) {
      if (idx.name === 'PRIMARY') continue
      if (!uniqueIndexes.has(idx.name)) {
        uniqueIndexes.set(idx.name, [])
      }
      uniqueIndexes.get(idx.name)!.push(idx.columnName)
    }

    for (const [indexName, columns] of uniqueIndexes) {
      const indexDef = table.indexes.find(i => i.name === indexName)
      const unique = indexDef && !indexDef.nonUnique ? 'UNIQUE ' : ''
      lines.push(`,  ${unique}KEY \`${indexName}\` (${columns.map(c => `\`${c}\``).join(', ')})`)
    }

    // Foreign keys
    for (const fk of table.foreignKeys) {
      lines.push(
        `,  CONSTRAINT \`${fk.constraintName}\` FOREIGN KEY (\`${fk.columnName}\`) ` +
        `REFERENCES \`${fk.referencedTableName}\`(\`${fk.referencedColumnName}\`) ` +
        `ON UPDATE ${fk.updateRule} ON DELETE ${fk.deleteRule}`
      )
    }

    lines.push(`) ENGINE=${table.engine} DEFAULT CHARSET=${table.collation.split('_')[0]}`)
    
    if (table.comment) {
      lines.push(` COMMENT='${table.comment.replace(/'/g, "''")}'`)
    }

    return lines.join('\n') + ';'
  }

  /**
   * Create a view from definition
   */
  private async createView(
    view: ViewDefinition, 
    options: SchemaImportOptions,
    sourceDatabase?: string,
    targetDatabase?: string
  ): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create view: ${view.name}`)
      return
    }

    if (options.dropExisting) {
      await this.sql.query(`DROP VIEW IF EXISTS \`${view.name}\``)
    }

    // Replace source database name references with target database if provided
    let definition = view.definition
    if (sourceDatabase && targetDatabase && sourceDatabase !== targetDatabase) {
      // Replace `sourceDatabase`.`table` with `targetDatabase`.`table`
      const sourceDbQuoted = `\`${sourceDatabase}\`\\.`
      const targetDbQuoted = `\`${targetDatabase}\`.`
      definition = definition.replace(new RegExp(sourceDbQuoted, 'g'), targetDbQuoted)
      
      // Also handle cases without backticks: sourceDatabase.table
      const sourceDbUnquoted = new RegExp(`\\b${sourceDatabase}\\.`, 'g')
      definition = definition.replace(sourceDbUnquoted, `${targetDatabase}.`)
    }

    const createSQL = `CREATE VIEW \`${view.name}\` AS ${definition}`
    await this.sql.query(createSQL)
  }

  /**
   * Create a function from definition
   */
  private async createFunction(func: FunctionDefinition, options: SchemaImportOptions): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create function: ${func.name}`)
      return
    }

    // Always drop function first since MySQL doesn't support IF NOT EXISTS for functions
    await this.sql.query(`DROP FUNCTION IF EXISTS \`${func.name}\``)

    // If definition starts with CREATE, use it directly
    if (func.definition.trim().toUpperCase().startsWith('CREATE')) {
      await this.sql.query(func.definition)
    } else {
      // Otherwise, build the CREATE statement
      const deterministic = func.isDeterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'
      const createSQL = `
        CREATE FUNCTION \`${func.name}\`() RETURNS ${func.returns}
        ${deterministic}
        BEGIN
          ${func.definition}
        END
      `
      await this.sql.query(createSQL)
    }
  }

  /**
   * Create a stored procedure from definition
   */
  private async createProcedure(proc: ProcedureDefinition, options: SchemaImportOptions): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create procedure: ${proc.name}`)
      return
    }

    // Always drop procedure first since MySQL doesn't support IF NOT EXISTS for procedures
    await this.sql.query(`DROP PROCEDURE IF EXISTS \`${proc.name}\``)

    // If definition starts with CREATE, use it directly
    if (proc.definition.trim().toUpperCase().startsWith('CREATE')) {
      await this.sql.query(proc.definition)
    } else {
      // Otherwise, build the CREATE statement
      const deterministic = proc.isDeterministic ? 'DETERMINISTIC' : 'NOT DETERMINISTIC'
      const createSQL = `
        CREATE PROCEDURE \`${proc.name}\`()
        ${deterministic}
        BEGIN
          ${proc.definition}
        END
      `
      await this.sql.query(createSQL)
    }
  }

  /**
   * Create a trigger from definition
   */
  private async createTrigger(trigger: TriggerDefinition, options: SchemaImportOptions): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create trigger: ${trigger.name}`)
      return
    }

    if (options.dropExisting) {
      await this.sql.query(`DROP TRIGGER IF EXISTS \`${trigger.name}\``)
    }

    const createSQL = `
      CREATE TRIGGER \`${trigger.name}\`
      ${trigger.timing} ${trigger.event} ON \`${trigger.tableName}\`
      FOR EACH ROW
      BEGIN
        ${trigger.statement}
      END
    `
    
    await this.sql.query(createSQL)
  }

  /**
   * Create an event from definition
   */
  private async createEvent(event: EventDefinition, options: SchemaImportOptions): Promise<void> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would create event: ${event.name}`)
      return
    }

    if (options.dropExisting) {
      await this.sql.query(`DROP EVENT IF EXISTS \`${event.name}\``)
    }

    let schedule = ''
    if (event.type === 'ONE TIME' && event.executeAt) {
      schedule = `AT '${event.executeAt.toISOString().slice(0, 19).replace('T', ' ')}'`
    } else if (event.type === 'RECURRING') {
      schedule = `EVERY ${event.intervalValue} ${event.intervalField}`
    }

    const createSQL = `
      CREATE EVENT \`${event.name}\`
      ON SCHEDULE ${schedule}
      ON COMPLETION ${event.onCompletion}
      ${event.status}
      DO
      BEGIN
        ${event.definition}
      END
    `
    
    await this.sql.query(createSQL)
  }

  /**
   * Apply only tables from schema
   */
  public async applyTables(
    schema: DatabaseSchema,
    options?: Omit<SchemaImportOptions, 'createViews' | 'createFunctions' | 'createProcedures' | 'createTriggers' | 'createEvents'>
  ): Promise<SchemaImportResult> {
    return this.applySchema(schema, {
      ...options,
      createTables: true,
      createViews: false,
      createFunctions: false,
      createProcedures: false,
      createTriggers: false,
      createEvents: false
    })
  }

  /**
   * Apply specific tables from schema
   */
  public async applySpecificTables(
    schema: DatabaseSchema,
    tableNames: string[],
    options?: SchemaImportOptions
  ): Promise<SchemaImportResult> {
    const filteredSchema: DatabaseSchema = {
      ...schema,
      tables: schema.tables.filter(t => tableNames.includes(t.name)),
      views: [],
      functions: [],
      procedures: [],
      triggers: [],
      events: []
    }

    return this.applyTables(filteredSchema, options)
  }

  /**
   * Validate schema without applying it
   */
  public async validateSchema(schema: DatabaseSchema): Promise<{
    valid: boolean
    errors: string[]
    warnings: string[]
  }> {
    const result = await this.applySchema(schema, {
      dryRun: true,
      skipErrors: true
    })

    return {
      valid: result.success,
      errors: result.errors.map(e => `${e.object}: ${e.error}`),
      warnings: result.warnings
    }
  }

  /**
   * Create database if it doesn't exist
   */
  private async createDatabaseIfNotExists(
    databaseName: string,
    characterSet?: string,
    collation?: string
  ): Promise<void> {
    const charset = characterSet || 'utf8mb4'
    const coll = collation || 'utf8mb4_unicode_ci'
    
    const createSQL = `
      CREATE DATABASE IF NOT EXISTS \`${databaseName}\`
      CHARACTER SET ${charset}
      COLLATE ${coll}
    `
    
    await this.sql.query(createSQL)
  }

  /**
   * Check if database exists
   */
  private async databaseExists(databaseName: string): Promise<boolean> {
    const result = await this.sql.query<any>(`
      SELECT SCHEMA_NAME
      FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME = ?
    `, [databaseName])
    
    return result.length > 0
  }

  /**
   * Clone schema from one database to another
   * Creates target database if it doesn't exist
   */
  public async cloneSchema(
    sourceSchema: DatabaseSchema,
    targetDatabase: string,
    options?: SchemaImportOptions & {
      createDatabase?: boolean  // Create target database if it doesn't exist (default: true)
      dropDatabase?: boolean    // Drop target database if it exists (default: false)
    }
  ): Promise<SchemaImportResult> {
    const opts = {
      createDatabase: true,
      dropDatabase: false,
      ...options
    }

    try {
      // Check if target database exists
      const exists = await this.databaseExists(targetDatabase)
      
      if (exists && opts.dropDatabase) {
        // Drop existing database
        await this.sql.query(`DROP DATABASE IF EXISTS \`${targetDatabase}\``)
      }
      
      if (!exists || opts.dropDatabase) {
        // Create database if it doesn't exist or was just dropped
        if (opts.createDatabase) {
          await this.createDatabaseIfNotExists(
            targetDatabase,
            sourceSchema.characterSet,
            sourceSchema.collation
          )
        } else {
          throw new Error(`Database ${targetDatabase} does not exist and createDatabase is false`)
        }
      }
      
      // Switch to target database
      await this.sql.query(`USE \`${targetDatabase}\``)
      
      // Apply schema with target database context
      const result = await this.applySchema(sourceSchema, {
        ...options,
        targetDatabase: targetDatabase
      })
      
      return result
    } catch (error: any) {
      throw new Error(`Failed to clone schema to ${targetDatabase}: ${error.message}`)
    }
  }

  /**
   * Create a new database with schema
   */
  public async createDatabase(
    databaseName: string,
    schema: DatabaseSchema,
    options?: SchemaImportOptions & {
      dropIfExists?: boolean  // Drop database if it exists (default: false)
    }
  ): Promise<SchemaImportResult> {
    const opts = {
      dropIfExists: false,
      ...options
    }

    if (opts.dropIfExists) {
      await this.sql.query(`DROP DATABASE IF EXISTS \`${databaseName}\``)
    }

    // Create the database
    await this.createDatabaseIfNotExists(
      databaseName,
      schema.characterSet,
      schema.collation
    )

    // Clone the schema to it
    return await this.cloneSchema(schema, databaseName, {
      ...options,
      createDatabase: false,  // Already created
      dropDatabase: false
    })
  }
}
