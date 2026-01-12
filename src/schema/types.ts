/**
 * Database schema type definitions
 * Defines interfaces for all database objects that can be extracted
 */

/**
 * Column definition in a table
 */
export interface ColumnDefinition {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  extra: string // e.g., 'auto_increment', 'on update current_timestamp()'
  comment: string
  characterSet?: string
  collation?: string
  key?: 'PRI' | 'UNI' | 'MUL' | ''
}

/**
 * Index definition
 */
export interface IndexDefinition {
  name: string
  tableName: string
  columnName: string
  nonUnique: boolean
  indexType: string // e.g., 'BTREE', 'HASH'
  seqInIndex: number
  collation?: string
  cardinality?: number
  comment: string
}

/**
 * Foreign key constraint definition
 */
export interface ForeignKeyDefinition {
  constraintName: string
  tableName: string
  columnName: string
  referencedTableName: string
  referencedColumnName: string
  updateRule: string // e.g., 'CASCADE', 'RESTRICT', 'SET NULL'
  deleteRule: string
}

/**
 * Complete table definition
 */
export interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  indexes: IndexDefinition[]
  foreignKeys: ForeignKeyDefinition[]
  engine: string
  collation: string
  comment: string
  createStatement?: string
}

/**
 * View definition
 */
export interface ViewDefinition {
  name: string
  definition: string
  checkOption: string
  isUpdatable: boolean
  definer: string
  securityType: string
  characterSetClient: string
  collationConnection: string
}

/**
 * Stored procedure definition
 */
export interface ProcedureDefinition {
  name: string
  type: 'PROCEDURE' | 'FUNCTION'
  definition: string
  definer: string
  created: Date
  modified: Date
  sqlDataAccess: string
  isDeterministic: boolean
  securityType: string
  parameterList?: string
  returns?: string
  comment: string
}

/**
 * Function definition (same as procedure but specifically for functions)
 */
export interface FunctionDefinition extends ProcedureDefinition {
  type: 'FUNCTION'
  returns: string
}

/**
 * Trigger definition
 */
export interface TriggerDefinition {
  name: string
  tableName: string
  event: 'INSERT' | 'UPDATE' | 'DELETE'
  timing: 'BEFORE' | 'AFTER'
  statement: string
  definer: string
  created: Date
  sqlMode: string
  characterSetClient: string
  collationConnection: string
  databaseCollation: string
}

/**
 * Event definition (scheduled tasks)
 */
export interface EventDefinition {
  name: string
  definer: string
  timeZone: string
  type: 'ONE TIME' | 'RECURRING'
  executeAt?: Date
  intervalValue?: string
  intervalField?: string
  status: 'ENABLED' | 'DISABLED' | 'SLAVESIDE_DISABLED'
  onCompletion: 'PRESERVE' | 'NOT PRESERVE'
  definition: string
  comment: string
}

/**
 * Complete database schema
 */
export interface DatabaseSchema {
  databaseName: string
  tables: TableDefinition[]
  views: ViewDefinition[]
  procedures: ProcedureDefinition[]
  functions: FunctionDefinition[]
  triggers: TriggerDefinition[]
  events: EventDefinition[]
  characterSet: string
  collation: string
  extractedAt: Date
  version?: string
}

/**
 * Schema comparison result
 */
export interface SchemaComparison {
  addedTables: string[]
  removedTables: string[]
  modifiedTables: Array<{
    tableName: string
    addedColumns: string[]
    removedColumns: string[]
    modifiedColumns: string[]
  }>
  addedViews: string[]
  removedViews: string[]
  modifiedViews: string[]
}

/**
 * Export format options
 */
export type ExportFormat = 'sql' | 'json' | 'typescript' | 'markdown'

/**
 * Schema extraction options
 */
export interface SchemaExtractionOptions {
  includeTables?: boolean
  includeViews?: boolean
  includeProcedures?: boolean
  includeFunctions?: boolean
  includeTriggers?: boolean
  includeEvents?: boolean
  includeData?: boolean
  tableFilter?: RegExp | string[]
  excludeSystemTables?: boolean
}

/**
 * Schema import options
 */
export interface SchemaImportOptions {
  dropExisting?: boolean      // Drop existing objects before creating
  createTables?: boolean      // Create tables (default: true)
  createViews?: boolean       // Create views (default: true)
  createFunctions?: boolean   // Create functions (default: true)
  createProcedures?: boolean  // Create procedures (default: true)
  createTriggers?: boolean    // Create triggers (default: true)
  createEvents?: boolean      // Create events (default: true)
  skipErrors?: boolean        // Continue on errors (default: false)
  dryRun?: boolean           // Only validate, don't execute (default: false)
}

/**
 * Schema import result
 */
export interface SchemaImportResult {
  success: boolean
  tablesCreated: string[]
  viewsCreated: string[]
  functionsCreated: string[]
  proceduresCreated: string[]
  triggersCreated: string[]
  eventsCreated: string[]
  errors: Array<{ object: string; error: string }>
  warnings: string[]
}
