import fs from 'fs'
import path from 'path'
import { ZSQLService } from "../sql_service"
import type {
  ColumnDefinition,
  DatabaseSchema,
  EventDefinition,
  ExportFormat,
  ForeignKeyDefinition,
  FunctionDefinition,
  IndexDefinition,
  ProcedureDefinition,
  SchemaComparison,
  SchemaExtractionOptions,
  TableDefinition,
  TriggerDefinition,
  ViewDefinition
} from "./types"

/**
 * MySQL Database Schema Extractor
 * 
 * Extracts complete database schema including tables, views, procedures, 
 * functions, triggers, and events. Provides export capabilities in multiple formats.
 * 
 * @example
 * ```typescript
 * const extractor = new MySQLSchemaExtractor()
 * const schema = await extractor.extractFullSchema()
 * 
 * // Export as SQL
 * const sqlDump = await extractor.exportToSQL()
 * 
 * // Export as JSON
 * const jsonSchema = await extractor.exportToJSON()
 * 
 * // Compare with another schema
 * const comparison = await extractor.compareSchemas(oldSchema, newSchema)
 * ```
 */
export class MySQLSchemaExtractor {
  private databaseName: string

  constructor(private sql: ZSQLService, databaseName?: string) {
    // Get database name from connection or use provided
    this.databaseName = databaseName || 'woningnet'
  }

  /**
   * Extract all tables with their complete structure
   */
  public async extractTables(options?: SchemaExtractionOptions): Promise<TableDefinition[]> {
    const tables: TableDefinition[] = []
    
    // Get all table names
    const tableRows = await this.sql.query<{ TABLE_NAME: string, ENGINE: string, TABLE_COLLATION: string, TABLE_COMMENT: string }>(`
      SELECT TABLE_NAME, ENGINE, TABLE_COLLATION, TABLE_COMMENT
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_NAME
    `, [this.databaseName])

    for (const tableRow of tableRows) {
      const tableName = tableRow.TABLE_NAME

      // Apply table filter if specified
      if (options?.tableFilter) {
        if (Array.isArray(options.tableFilter)) {
          if (!options.tableFilter.includes(tableName)) continue
        } else if (options.tableFilter instanceof RegExp) {
          if (!options.tableFilter.test(tableName)) continue
        }
      }

      // Skip system tables if requested
      if (options?.excludeSystemTables && this.isSystemTable(tableName)) {
        continue
      }

      const columns = await this.extractTableColumns(tableName)
      const indexes = await this.extractTableIndexes(tableName)
      const foreignKeys = await this.extractTableForeignKeys(tableName)
      const createStatement = await this.getTableCreateStatement(tableName)

      tables.push({
        name: tableName,
        columns,
        indexes,
        foreignKeys,
        engine: tableRow.ENGINE,
        collation: tableRow.TABLE_COLLATION,
        comment: tableRow.TABLE_COMMENT,
        createStatement
      })
    }

    return tables
  }

  /**
   * Extract columns for a specific table
   */
  private async extractTableColumns(tableName: string): Promise<ColumnDefinition[]> {
    const columns = await this.sql.query<any>(`
      SELECT 
        COLUMN_NAME as name,
        COLUMN_TYPE as type,
        IS_NULLABLE as nullable,
        COLUMN_DEFAULT as defaultValue,
        EXTRA as extra,
        COLUMN_COMMENT as comment,
        CHARACTER_SET_NAME as characterSet,
        COLLATION_NAME as collation,
        COLUMN_KEY as \`key\`
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
    `, [this.databaseName, tableName])

    return columns.map(col => ({
      name: col.name,
      type: col.type,
      nullable: col.nullable === 'YES',
      defaultValue: col.defaultValue,
      extra: col.extra || '',
      comment: col.comment || '',
      characterSet: col.characterSet,
      collation: col.collation,
      key: col.key || ''
    } as ColumnDefinition))
  }

  /**
   * Extract indexes for a specific table
   */
  private async extractTableIndexes(tableName: string): Promise<IndexDefinition[]> {
    const indexes = await this.sql.query<any>(`
      SELECT
        INDEX_NAME as name,
        TABLE_NAME as tableName,
        COLUMN_NAME as columnName,
        NON_UNIQUE as nonUnique,
        INDEX_TYPE as indexType,
        SEQ_IN_INDEX as seqInIndex,
        COLLATION as collation,
        CARDINALITY as cardinality,
        INDEX_COMMENT as comment
      FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ?
        AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX
    `, [this.databaseName, tableName])

    return indexes.map(idx => ({
      name: idx.name,
      tableName: idx.tableName,
      columnName: idx.columnName,
      nonUnique: idx.nonUnique === 1,
      indexType: idx.indexType,
      seqInIndex: idx.seqInIndex,
      collation: idx.collation,
      cardinality: idx.cardinality,
      comment: idx.comment || ''
    }))
  }

  /**
   * Extract foreign keys for a specific table
   */
  private async extractTableForeignKeys(tableName: string): Promise<ForeignKeyDefinition[]> {
    const foreignKeys = await this.sql.query<any>(`
      SELECT
        kcu.CONSTRAINT_NAME as constraintName,
        kcu.TABLE_NAME as tableName,
        kcu.COLUMN_NAME as columnName,
        kcu.REFERENCED_TABLE_NAME as referencedTableName,
        kcu.REFERENCED_COLUMN_NAME as referencedColumnName,
        COALESCE(rc.UPDATE_RULE, 'RESTRICT') as updateRule,
        COALESCE(rc.DELETE_RULE, 'RESTRICT') as deleteRule
      FROM information_schema.KEY_COLUMN_USAGE kcu
      LEFT JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
        ON kcu.CONSTRAINT_NAME = rc.CONSTRAINT_NAME
        AND kcu.TABLE_SCHEMA = rc.CONSTRAINT_SCHEMA
      WHERE kcu.TABLE_SCHEMA = ?
        AND kcu.TABLE_NAME = ?
        AND kcu.REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY kcu.CONSTRAINT_NAME, kcu.ORDINAL_POSITION
    `, [this.databaseName, tableName])

    return foreignKeys.map(fk => ({
      constraintName: fk.constraintName,
      tableName: fk.tableName,
      columnName: fk.columnName,
      referencedTableName: fk.referencedTableName,
      referencedColumnName: fk.referencedColumnName,
      updateRule: fk.updateRule,
      deleteRule: fk.deleteRule
    }))
  }

  /**
   * Get CREATE TABLE statement
   */
  private async getTableCreateStatement(tableName: string): Promise<string> {
    const result = await this.sql.query<any>(`SHOW CREATE TABLE \`${tableName}\``)
    let createStatement = result[0]?.['Create Table'] || ''
    
    // Add IF NOT EXISTS clause for safety if not already present
    if (createStatement && !createStatement.includes('IF NOT EXISTS')) {
      createStatement = createStatement.replace(
        /CREATE TABLE/i,
        'CREATE TABLE IF NOT EXISTS'
      )
    }
    
    return createStatement
  }

  /**
   * Extract all views
   */
  public async extractViews(): Promise<ViewDefinition[]> {
    const views = await this.sql.query<any>(`
      SELECT
        TABLE_NAME as name,
        VIEW_DEFINITION as definition,
        CHECK_OPTION as checkOption,
        IS_UPDATABLE as isUpdatable,
        DEFINER as definer,
        SECURITY_TYPE as securityType,
        CHARACTER_SET_CLIENT as characterSetClient,
        COLLATION_CONNECTION as collationConnection
      FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME
    `, [this.databaseName])

    return views.map(view => ({
      name: view.name,
      definition: view.definition,
      checkOption: view.checkOption,
      isUpdatable: view.isUpdatable === 'YES',
      definer: view.definer,
      securityType: view.securityType,
      characterSetClient: view.characterSetClient,
      collationConnection: view.collationConnection
    }))
  }

  /**
   * Extract all stored procedures
   */
  public async extractProcedures(): Promise<ProcedureDefinition[]> {
    const procedures = await this.sql.query<any>(`
      SELECT
        ROUTINE_NAME as name,
        ROUTINE_TYPE as type,
        ROUTINE_DEFINITION as definition,
        DEFINER as definer,
        CREATED as created,
        LAST_ALTERED as modified,
        SQL_DATA_ACCESS as sqlDataAccess,
        IS_DETERMINISTIC as isDeterministic,
        SECURITY_TYPE as securityType,
        ROUTINE_COMMENT as comment
      FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
        AND ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_NAME
    `, [this.databaseName])

    // Get full CREATE statement for each procedure
    const result: ProcedureDefinition[] = []
    for (const proc of procedures) {
      try {
        const createStmt = await this.sql.query<any>(`SHOW CREATE PROCEDURE \`${proc.name}\``)
        const fullDefinition = createStmt[0]?.['Create Procedure'] || proc.definition
        
        result.push({
          name: proc.name,
          type: 'PROCEDURE' as const,
          definition: fullDefinition,
          definer: proc.definer,
          created: new Date(proc.created),
          modified: new Date(proc.modified),
          sqlDataAccess: proc.sqlDataAccess,
          isDeterministic: proc.isDeterministic === 'YES',
          securityType: proc.securityType,
          comment: proc.comment || ''
        })
      } catch (error) {
        // If SHOW CREATE fails, use basic definition
        result.push({
          name: proc.name,
          type: 'PROCEDURE' as const,
          definition: proc.definition || '',
          definer: proc.definer,
          created: new Date(proc.created),
          modified: new Date(proc.modified),
          sqlDataAccess: proc.sqlDataAccess,
          isDeterministic: proc.isDeterministic === 'YES',
          securityType: proc.securityType,
          comment: proc.comment || ''
        })
      }
    }

    return result
  }

  /**
   * Extract all functions
   */
  public async extractFunctions(): Promise<FunctionDefinition[]> {
    const functions = await this.sql.query<any>(`
      SELECT
        ROUTINE_NAME as name,
        ROUTINE_TYPE as type,
        ROUTINE_DEFINITION as definition,
        DEFINER as definer,
        CREATED as created,
        LAST_ALTERED as modified,
        SQL_DATA_ACCESS as sqlDataAccess,
        IS_DETERMINISTIC as isDeterministic,
        SECURITY_TYPE as securityType,
        DTD_IDENTIFIER as returns,
        ROUTINE_COMMENT as comment
      FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = ?
        AND ROUTINE_TYPE = 'FUNCTION'
      ORDER BY ROUTINE_NAME
    `, [this.databaseName])

    // Get full CREATE statement for each function
    const result: FunctionDefinition[] = []
    for (const func of functions) {
      try {
        const createStmt = await this.sql.query<any>(`SHOW CREATE FUNCTION \`${func.name}\``)
        let fullDefinition = createStmt[0]?.['Create Function'] || func.definition
        
        // Note: MySQL doesn't support IF NOT EXISTS for functions, but we can document this
        // The importer will handle DROP IF EXISTS before CREATE
        
        result.push({
          name: func.name,
          type: 'FUNCTION' as const,
          definition: fullDefinition,
          definer: func.definer,
          created: new Date(func.created),
          modified: new Date(func.modified),
          sqlDataAccess: func.sqlDataAccess,
          isDeterministic: func.isDeterministic === 'YES',
          securityType: func.securityType,
          returns: func.returns || '',
          comment: func.comment || ''
        })
      } catch (error) {
        // If SHOW CREATE fails, use basic definition
        result.push({
          name: func.name,
          type: 'FUNCTION' as const,
          definition: func.definition || '',
          definer: func.definer,
          created: new Date(func.created),
          modified: new Date(func.modified),
          sqlDataAccess: func.sqlDataAccess,
          isDeterministic: func.isDeterministic === 'YES',
          securityType: func.securityType,
          returns: func.returns || '',
          comment: func.comment || ''
        })
      }
    }

    return result
  }

  /**
   * Extract all triggers
   */
  public async extractTriggers(): Promise<TriggerDefinition[]> {
    const triggers = await this.sql.query<any>(`
      SELECT
        TRIGGER_NAME as name,
        EVENT_MANIPULATION as event,
        EVENT_OBJECT_TABLE as tableName,
        ACTION_TIMING as timing,
        ACTION_STATEMENT as statement,
        DEFINER as definer,
        CREATED as created,
        SQL_MODE as sqlMode,
        CHARACTER_SET_CLIENT as characterSetClient,
        COLLATION_CONNECTION as collationConnection,
        DATABASE_COLLATION as databaseCollation
      FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = ?
      ORDER BY EVENT_OBJECT_TABLE, ACTION_TIMING, EVENT_MANIPULATION
    `, [this.databaseName])

    return triggers.map(trigger => ({
      name: trigger.name,
      tableName: trigger.tableName,
      event: trigger.event as 'INSERT' | 'UPDATE' | 'DELETE',
      timing: trigger.timing as 'BEFORE' | 'AFTER',
      statement: trigger.statement,
      definer: trigger.definer,
      created: trigger.created ? new Date(trigger.created) : new Date(),
      sqlMode: trigger.sqlMode,
      characterSetClient: trigger.characterSetClient,
      collationConnection: trigger.collationConnection,
      databaseCollation: trigger.databaseCollation
    }))
  }

  /**
   * Extract all events (scheduled tasks)
   */
  public async extractEvents(): Promise<EventDefinition[]> {
    const events = await this.sql.query<any>(`
      SELECT
        EVENT_NAME as name,
        DEFINER as definer,
        TIME_ZONE as timeZone,
        EVENT_TYPE as type,
        EXECUTE_AT as executeAt,
        INTERVAL_VALUE as intervalValue,
        INTERVAL_FIELD as intervalField,
        STATUS as status,
        ON_COMPLETION as onCompletion,
        EVENT_DEFINITION as definition,
        EVENT_COMMENT as comment
      FROM information_schema.EVENTS
      WHERE EVENT_SCHEMA = ?
      ORDER BY EVENT_NAME
    `, [this.databaseName])

    return events.map(event => ({
      name: event.name,
      definer: event.definer,
      timeZone: event.timeZone,
      type: event.type as 'ONE TIME' | 'RECURRING',
      executeAt: event.executeAt ? new Date(event.executeAt) : undefined,
      intervalValue: event.intervalValue,
      intervalField: event.intervalField,
      status: event.status as 'ENABLED' | 'DISABLED' | 'SLAVESIDE_DISABLED',
      onCompletion: event.onCompletion as 'PRESERVE' | 'NOT PRESERVE',
      definition: event.definition,
      comment: event.comment || ''
    }))
  }

  /**
   * Extract complete database schema
   */
  public async extractFullSchema(options?: SchemaExtractionOptions): Promise<DatabaseSchema> {
    const defaultOptions: SchemaExtractionOptions = {
      includeTables: true,
      includeViews: true,
      includeProcedures: true,
      includeFunctions: true,
      includeTriggers: true,
      includeEvents: true,
      excludeSystemTables: true
    }

    const finalOptions = { ...defaultOptions, ...options }

    const [tables, views, procedures, functions, triggers, events, dbInfo] = await Promise.all([
      finalOptions.includeTables ? this.extractTables(finalOptions) : Promise.resolve([]),
      finalOptions.includeViews ? this.extractViews() : Promise.resolve([]),
      finalOptions.includeProcedures ? this.extractProcedures() : Promise.resolve([]),
      finalOptions.includeFunctions ? this.extractFunctions() : Promise.resolve([]),
      finalOptions.includeTriggers ? this.extractTriggers() : Promise.resolve([]),
      finalOptions.includeEvents ? this.extractEvents() : Promise.resolve([]),
      this.getDatabaseInfo()
    ])

    return {
      databaseName: this.databaseName,
      tables,
      views,
      procedures,
      functions,
      triggers,
      events,
      characterSet: dbInfo.characterSet,
      collation: dbInfo.collation,
      extractedAt: new Date(),
      version: await this.getMySQLVersion()
    }
  }

  /**
   * Get database information
   */
  private async getDatabaseInfo(): Promise<{ characterSet: string, collation: string }> {
    const result = await this.sql.query<any>(`
      SELECT 
        DEFAULT_CHARACTER_SET_NAME as characterSet,
        DEFAULT_COLLATION_NAME as collation
      FROM information_schema.SCHEMATA
      WHERE SCHEMA_NAME = ?
    `, [this.databaseName])

    return {
      characterSet: result[0]?.characterSet || 'utf8mb4',
      collation: result[0]?.collation || 'utf8mb4_unicode_ci'
    }
  }

  /**
   * Get MySQL version
   */
  private async getMySQLVersion(): Promise<string> {
    const result = await this.sql.query<any>('SELECT VERSION() as version')
    return result[0]?.version || 'unknown'
  }

  /**
   * Check if table is a system table
   */
  private isSystemTable(tableName: string): boolean {
    const systemPrefixes = ['sys_', 'mysql_', 'performance_schema_']
    return systemPrefixes.some(prefix => tableName.startsWith(prefix))
  }

  /**
   * Export schema to SQL DDL statements
   */
  public async exportToSQL(schema?: DatabaseSchema): Promise<string> {
    const schemaData = schema || await this.extractFullSchema()
    const lines: string[] = []

    // Database header
    lines.push(`-- MySQL Database Schema Export`)
    lines.push(`-- Database: ${schemaData.databaseName}`)
    lines.push(`-- Extracted: ${schemaData.extractedAt.toISOString()}`)
    lines.push(`-- MySQL Version: ${schemaData.version}`)
    lines.push(``)
    lines.push(`SET NAMES ${schemaData.characterSet};`)
    lines.push(`SET FOREIGN_KEY_CHECKS = 0;`)
    lines.push(``)

    // Tables
    if (schemaData.tables.length > 0) {
      lines.push(`-- --------------------------------------------------------`)
      lines.push(`-- Tables`)
      lines.push(`-- --------------------------------------------------------`)
      lines.push(``)

      for (const table of schemaData.tables) {
        lines.push(`-- Table: ${table.name}`)
        if (table.createStatement) {
          lines.push(`DROP TABLE IF EXISTS \`${table.name}\`;`)
          lines.push(table.createStatement + ';')
        }
        lines.push(``)
      }
    }

    // Views
    if (schemaData.views.length > 0) {
      lines.push(`-- --------------------------------------------------------`)
      lines.push(`-- Views`)
      lines.push(`-- --------------------------------------------------------`)
      lines.push(``)

      for (const view of schemaData.views) {
        lines.push(`-- View: ${view.name}`)
        lines.push(`DROP VIEW IF EXISTS \`${view.name}\`;`)
        lines.push(`CREATE VIEW \`${view.name}\` AS ${view.definition};`)
        lines.push(``)
      }
    }

    // Functions
    if (schemaData.functions.length > 0) {
      lines.push(`-- --------------------------------------------------------`)
      lines.push(`-- Functions`)
      lines.push(`-- --------------------------------------------------------`)
      lines.push(``)

      for (const func of schemaData.functions) {
        lines.push(`-- Function: ${func.name}`)
        lines.push(`DROP FUNCTION IF EXISTS \`${func.name}\`;`)
        lines.push(`DELIMITER $$`)
        lines.push(`CREATE FUNCTION \`${func.name}\`() RETURNS ${func.returns}`)
        lines.push(`BEGIN`)
        lines.push(func.definition)
        lines.push(`END$$`)
        lines.push(`DELIMITER ;`)
        lines.push(``)
      }
    }

    // Procedures
    if (schemaData.procedures.length > 0) {
      lines.push(`-- --------------------------------------------------------`)
      lines.push(`-- Stored Procedures`)
      lines.push(`-- --------------------------------------------------------`)
      lines.push(``)

      for (const proc of schemaData.procedures) {
        lines.push(`-- Procedure: ${proc.name}`)
        lines.push(`DROP PROCEDURE IF EXISTS \`${proc.name}\`;`)
        lines.push(`DELIMITER $$`)
        lines.push(`CREATE PROCEDURE \`${proc.name}\`()`)
        lines.push(`BEGIN`)
        lines.push(proc.definition)
        lines.push(`END$$`)
        lines.push(`DELIMITER ;`)
        lines.push(``)
      }
    }

    // Triggers
    if (schemaData.triggers.length > 0) {
      lines.push(`-- --------------------------------------------------------`)
      lines.push(`-- Triggers`)
      lines.push(`-- --------------------------------------------------------`)
      lines.push(``)

      for (const trigger of schemaData.triggers) {
        lines.push(`-- Trigger: ${trigger.name} on ${trigger.tableName}`)
        lines.push(`DROP TRIGGER IF EXISTS \`${trigger.name}\`;`)
        lines.push(`DELIMITER $$`)
        lines.push(`CREATE TRIGGER \`${trigger.name}\``)
        lines.push(`${trigger.timing} ${trigger.event} ON \`${trigger.tableName}\``)
        lines.push(`FOR EACH ROW`)
        lines.push(`BEGIN`)
        lines.push(trigger.statement)
        lines.push(`END$$`)
        lines.push(`DELIMITER ;`)
        lines.push(``)
      }
    }

    lines.push(`SET FOREIGN_KEY_CHECKS = 1;`)

    return lines.join('\n')
  }

  /**
   * Export schema to JSON
   */
  public async exportToJSON(schema?: DatabaseSchema, pretty: boolean = true): Promise<string> {
    const schemaData = schema || await this.extractFullSchema()
    return JSON.stringify(schemaData, null, pretty ? 2 : 0)
  }

  /**
   * Export schema to TypeScript interfaces
   */
  public async exportToTypeScript(schema?: DatabaseSchema): Promise<string> {
    const schemaData = schema || await this.extractFullSchema()
    const lines: string[] = []

    lines.push(`/**`)
    lines.push(` * Auto-generated TypeScript interfaces from MySQL database schema`)
    lines.push(` * Database: ${schemaData.databaseName}`)
    lines.push(` * Generated: ${schemaData.extractedAt.toISOString()}`)
    lines.push(` */`)
    lines.push(``)

    for (const table of schemaData.tables) {
      lines.push(`/**`)
      lines.push(` * Table: ${table.name}`)
      if (table.comment) {
        lines.push(` * ${table.comment}`)
      }
      lines.push(` */`)
      lines.push(`export interface ${this.toPascalCase(table.name)} {`)

      for (const column of table.columns) {
        const tsType = this.mysqlTypeToTypeScript(column.type)
        const optional = column.nullable ? '?' : ''
        const comment = column.comment ? ` // ${column.comment}` : ''
        lines.push(`  ${column.name}${optional}: ${tsType}${comment}`)
      }

      lines.push(`}`)
      lines.push(``)
    }

    return lines.join('\n')
  }

  /**
   * Export schema to Markdown documentation
   */
  public async exportToMarkdown(schema?: DatabaseSchema): Promise<string> {
    const schemaData = schema || await this.extractFullSchema()
    const lines: string[] = []

    lines.push(`# Database Schema: ${schemaData.databaseName}`)
    lines.push(``)
    lines.push(`**Extracted:** ${schemaData.extractedAt.toISOString()}`)
    lines.push(`**MySQL Version:** ${schemaData.version}`)
    lines.push(`**Character Set:** ${schemaData.characterSet}`)
    lines.push(`**Collation:** ${schemaData.collation}`)
    lines.push(``)

    // Tables
    if (schemaData.tables.length > 0) {
      lines.push(`## Tables (${schemaData.tables.length})`)
      lines.push(``)

      for (const table of schemaData.tables) {
        lines.push(`### ${table.name}`)
        if (table.comment) {
          lines.push(``)
          lines.push(`> ${table.comment}`)
        }
        lines.push(``)
        lines.push(`**Engine:** ${table.engine} | **Collation:** ${table.collation}`)
        lines.push(``)
        lines.push(`#### Columns`)
        lines.push(``)
        lines.push(`| Name | Type | Nullable | Default | Key | Extra | Comment |`)
        lines.push(`|------|------|----------|---------|-----|-------|---------|`)

        for (const col of table.columns) {
          const nullable = col.nullable ? 'YES' : 'NO'
          const defaultVal = col.defaultValue || '-'
          const key = col.key || '-'
          const extra = col.extra || '-'
          const comment = col.comment || '-'
          lines.push(`| ${col.name} | ${col.type} | ${nullable} | ${defaultVal} | ${key} | ${extra} | ${comment} |`)
        }

        lines.push(``)

        // Indexes
        if (table.indexes.length > 0) {
          lines.push(`#### Indexes`)
          lines.push(``)
          const uniqueIndexes = [...new Map(table.indexes.map(idx => [idx.name, idx])).values()]
          for (const idx of uniqueIndexes) {
            const indexCols = table.indexes.filter(i => i.name === idx.name).map(i => i.columnName).join(', ')
            const unique = idx.nonUnique ? '' : ' (UNIQUE)'
            lines.push(`- **${idx.name}**${unique}: ${indexCols}`)
          }
          lines.push(``)
        }

        // Foreign Keys
        if (table.foreignKeys.length > 0) {
          lines.push(`#### Foreign Keys`)
          lines.push(``)
          for (const fk of table.foreignKeys) {
            lines.push(`- **${fk.constraintName}**: ${fk.columnName} → ${fk.referencedTableName}.${fk.referencedColumnName} (UPDATE: ${fk.updateRule}, DELETE: ${fk.deleteRule})`)
          }
          lines.push(``)
        }
      }
    }

    // Views
    if (schemaData.views.length > 0) {
      lines.push(`## Views (${schemaData.views.length})`)
      lines.push(``)
      for (const view of schemaData.views) {
        lines.push(`### ${view.name}`)
        lines.push(``)
        lines.push(`**Updatable:** ${view.isUpdatable ? 'Yes' : 'No'}`)
        lines.push(``)
      }
    }

    // Functions
    if (schemaData.functions.length > 0) {
      lines.push(`## Functions (${schemaData.functions.length})`)
      lines.push(``)
      for (const func of schemaData.functions) {
        lines.push(`### ${func.name}`)
        lines.push(``)
        lines.push(`**Returns:** ${func.returns}`)
        if (func.comment) {
          lines.push(``)
          lines.push(`> ${func.comment}`)
        }
        lines.push(``)
      }
    }

    // Procedures
    if (schemaData.procedures.length > 0) {
      lines.push(`## Stored Procedures (${schemaData.procedures.length})`)
      lines.push(``)
      for (const proc of schemaData.procedures) {
        lines.push(`### ${proc.name}`)
        if (proc.comment) {
          lines.push(``)
          lines.push(`> ${proc.comment}`)
        }
        lines.push(``)
      }
    }

    // Triggers
    if (schemaData.triggers.length > 0) {
      lines.push(`## Triggers (${schemaData.triggers.length})`)
      lines.push(``)
      for (const trigger of schemaData.triggers) {
        lines.push(`### ${trigger.name}`)
        lines.push(``)
        lines.push(`**Table:** ${trigger.tableName} | **Timing:** ${trigger.timing} | **Event:** ${trigger.event}`)
        lines.push(``)
      }
    }

    return lines.join('\n')
  }

  /**
   * Compare two schemas
   */
  public compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): SchemaComparison {
    const comparison: SchemaComparison = {
      addedTables: [],
      removedTables: [],
      modifiedTables: [],
      addedViews: [],
      removedViews: [],
      modifiedViews: []
    }

    // Compare tables
    const oldTableNames = new Set(oldSchema.tables.map(t => t.name))
    const newTableNames = new Set(newSchema.tables.map(t => t.name))

    // Added tables
    for (const tableName of newTableNames) {
      if (!oldTableNames.has(tableName)) {
        comparison.addedTables.push(tableName)
      }
    }

    // Removed tables
    for (const tableName of oldTableNames) {
      if (!newTableNames.has(tableName)) {
        comparison.removedTables.push(tableName)
      }
    }

    // Modified tables
    for (const tableName of newTableNames) {
      if (oldTableNames.has(tableName)) {
        const oldTable = oldSchema.tables.find(t => t.name === tableName)!
        const newTable = newSchema.tables.find(t => t.name === tableName)!

        const oldColNames = new Set(oldTable.columns.map(c => c.name))
        const newColNames = new Set(newTable.columns.map(c => c.name))

        const addedColumns: string[] = []
        const removedColumns: string[] = []
        const modifiedColumns: string[] = []

        for (const colName of newColNames) {
          if (!oldColNames.has(colName)) {
            addedColumns.push(colName)
          } else {
            const oldCol = oldTable.columns.find(c => c.name === colName)!
            const newCol = newTable.columns.find(c => c.name === colName)!
            if (JSON.stringify(oldCol) !== JSON.stringify(newCol)) {
              modifiedColumns.push(colName)
            }
          }
        }

        for (const colName of oldColNames) {
          if (!newColNames.has(colName)) {
            removedColumns.push(colName)
          }
        }

        if (addedColumns.length > 0 || removedColumns.length > 0 || modifiedColumns.length > 0) {
          comparison.modifiedTables.push({
            tableName,
            addedColumns,
            removedColumns,
            modifiedColumns
          })
        }
      }
    }

    // Compare views
    const oldViewNames = new Set(oldSchema.views.map(v => v.name))
    const newViewNames = new Set(newSchema.views.map(v => v.name))

    for (const viewName of newViewNames) {
      if (!oldViewNames.has(viewName)) {
        comparison.addedViews.push(viewName)
      }
    }

    for (const viewName of oldViewNames) {
      if (!newViewNames.has(viewName)) {
        comparison.removedViews.push(viewName)
      } else {
        const oldView = oldSchema.views.find(v => v.name === viewName)!
        const newView = newSchema.views.find(v => v.name === viewName)!
        if (oldView.definition !== newView.definition) {
          comparison.modifiedViews.push(viewName)
        }
      }
    }

    return comparison
  }

  /**
   * Convert MySQL type to TypeScript type
   */
  private mysqlTypeToTypeScript(mysqlType: string): string {
    const type = mysqlType.toLowerCase()

    // Numbers
    if (type.includes('int') || type.includes('decimal') || type.includes('float') || type.includes('double')) {
      return 'number'
    }

    // Booleans
    if (type.includes('tinyint(1)') || type.includes('boolean') || type.includes('bool')) {
      return 'boolean'
    }

    // Dates
    if (type.includes('date') || type.includes('time') || type.includes('timestamp')) {
      return 'Date | string'
    }

    // JSON
    if (type.includes('json')) {
      return 'any'
    }

    // Binary
    if (type.includes('blob') || type.includes('binary')) {
      return 'Buffer'
    }

    // Enums
    if (type.includes('enum')) {
      const match = mysqlType.match(/enum\((.*?)\)/i)
      if (match) {
        const values = match[1].split(',').map(v => v.trim().replace(/'/g, ''))
        return values.map(v => `'${v}'`).join(' | ')
      }
    }

    // Default to string
    return 'string'
  }

  /**
   * Convert snake_case to PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join('')
  }

  /**
   * Save schema to file
   */
  public async saveSchemaToFile(
    filePath: string,
    format: ExportFormat = 'json',
    schema?: DatabaseSchema
  ): Promise<void> {
    let content: string

    switch (format) {
      case 'sql':
        content = await this.exportToSQL(schema)
        break
      case 'json':
        content = await this.exportToJSON(schema)
        break
      case 'typescript':
        content = await this.exportToTypeScript(schema)
        break
      case 'markdown':
        content = await this.exportToMarkdown(schema)
        break
      default:
        throw new Error(`Unsupported format: ${format}`)
    }
    
    // Ensure directory exists
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }

    fs.writeFileSync(filePath, content, 'utf8')
  }
}
