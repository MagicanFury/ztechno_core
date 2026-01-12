/**
 * Schema Integration Utilities
 * 
 * Helper functions to integrate the schema extractor with existing ORM classes
 * and database operations.
 */

import { MySQLSchemaExtractor } from './MySQLSchemaExtractor'
import type { DatabaseSchema, TableDefinition } from './types'

/**
 * Validate that ORM table definitions match actual database schema
 * Useful for detecting schema drift
 */
export async function validateOrmSchema(
  tableName: string,
  expectedColumns: string[]
): Promise<{ valid: boolean; missing: string[]; extra: string[] }> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables({
    tableFilter: [tableName]
  })

  if (tables.length === 0) {
    throw new Error(`Table ${tableName} not found in database`)
  }

  const table = tables[0]
  const actualColumns = new Set(table.columns.map(c => c.name))
  const expectedSet = new Set(expectedColumns)

  const missing = expectedColumns.filter(col => !actualColumns.has(col))
  const extra = table.columns
    .map(c => c.name)
    .filter(col => !expectedSet.has(col))

  return {
    valid: missing.length === 0 && extra.length === 0,
    missing,
    extra
  }
}

/**
 * Get table definition for a specific table
 * Useful for dynamic ORM generation
 */
export async function getTableDefinition(tableName: string): Promise<TableDefinition | null> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables({
    tableFilter: [tableName]
  })

  return tables.length > 0 ? tables[0] : null
}

/**
 * Check if a table exists in the database
 */
export async function tableExists(tableName: string): Promise<boolean> {
  const table = await getTableDefinition(tableName)
  return table !== null
}

/**
 * Get all column names for a table
 */
export async function getTableColumns(tableName: string): Promise<string[]> {
  const table = await getTableDefinition(tableName)
  return table ? table.columns.map(c => c.name) : []
}

/**
 * Get primary key column(s) for a table
 */
export async function getPrimaryKeyColumns(tableName: string): Promise<string[]> {
  const table = await getTableDefinition(tableName)
  if (!table) return []

  return table.columns
    .filter(c => c.key === 'PRI')
    .map(c => c.name)
}

/**
 * Get foreign key relationships for a table
 */
export async function getForeignKeyRelationships(tableName: string): Promise<{
  column: string
  referencedTable: string
  referencedColumn: string
}[]> {
  const table = await getTableDefinition(tableName)
  if (!table) return []

  return table.foreignKeys.map(fk => ({
    column: fk.columnName,
    referencedTable: fk.referencedTableName,
    referencedColumn: fk.referencedColumnName
  }))
}

/**
 * Generate CREATE TABLE statement for a table
 */
export async function generateCreateTableStatement(tableName: string): Promise<string> {
  const table = await getTableDefinition(tableName)
  if (!table || !table.createStatement) {
    throw new Error(`Cannot generate CREATE TABLE statement for ${tableName}`)
  }

  return table.createStatement
}

/**
 * Compare ORM table structure with database
 * Returns a detailed comparison report
 */
export async function compareOrmWithDatabase(
  ormTableName: string,
  ormColumns: { name: string; type: string; nullable?: boolean }[]
): Promise<{
  matches: boolean
  columnDifferences: {
    column: string
    ormType: string
    dbType: string
    ormNullable?: boolean
    dbNullable: boolean
  }[]
  missingInDb: string[]
  missingInOrm: string[]
}> {
  const table = await getTableDefinition(ormTableName)
  if (!table) {
    throw new Error(`Table ${ormTableName} not found in database`)
  }

  const dbColumns = new Map(table.columns.map(c => [c.name, c]))
  const ormColumnMap = new Map(ormColumns.map(c => [c.name, c]))

  const columnDifferences: {
    column: string
    ormType: string
    dbType: string
    ormNullable?: boolean
    dbNullable: boolean
  }[] = []

  const missingInDb: string[] = []
  const missingInOrm: string[] = []

  // Check ORM columns against DB
  for (const [name, ormCol] of ormColumnMap) {
    const dbCol = dbColumns.get(name)
    if (!dbCol) {
      missingInDb.push(name)
    } else if (ormCol.type !== dbCol.type || ormCol.nullable !== dbCol.nullable) {
      columnDifferences.push({
        column: name,
        ormType: ormCol.type,
        dbType: dbCol.type,
        ormNullable: ormCol.nullable,
        dbNullable: dbCol.nullable
      })
    }
  }

  // Check DB columns against ORM
  for (const [name] of dbColumns) {
    if (!ormColumnMap.has(name)) {
      missingInOrm.push(name)
    }
  }

  return {
    matches: columnDifferences.length === 0 && missingInDb.length === 0 && missingInOrm.length === 0,
    columnDifferences,
    missingInDb,
    missingInOrm
  }
}

/**
 * Generate TypeScript interface for a specific table
 */
export async function generateTableInterface(tableName: string): Promise<string> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables({
    tableFilter: [tableName]
  })

  if (tables.length === 0) {
    throw new Error(`Table ${tableName} not found`)
  }

  const schema: DatabaseSchema = {
    databaseName: 'woningnet',
    tables,
    views: [],
    procedures: [],
    functions: [],
    triggers: [],
    events: [],
    characterSet: 'utf8mb4',
    collation: 'utf8mb4_unicode_ci',
    extractedAt: new Date()
  }

  return await extractor.exportToTypeScript(schema)
}

/**
 * Get schema statistics
 */
export async function getSchemaStatistics(): Promise<{
  totalTables: number
  totalColumns: number
  totalIndexes: number
  totalForeignKeys: number
  tablesByEngine: Record<string, number>
  averageColumnsPerTable: number
}> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables()

  const totalTables = tables.length
  const totalColumns = tables.reduce((sum, t) => sum + t.columns.length, 0)
  const totalIndexes = tables.reduce((sum, t) => sum + t.indexes.length, 0)
  const totalForeignKeys = tables.reduce((sum, t) => sum + t.foreignKeys.length, 0)

  const tablesByEngine: Record<string, number> = {}
  for (const table of tables) {
    tablesByEngine[table.engine] = (tablesByEngine[table.engine] || 0) + 1
  }

  return {
    totalTables,
    totalColumns,
    totalIndexes,
    totalForeignKeys,
    tablesByEngine,
    averageColumnsPerTable: totalTables > 0 ? totalColumns / totalTables : 0
  }
}

/**
 * Find tables with specific column name
 * Useful for finding all tables with common columns like 'created_at', 'userid', etc.
 */
export async function findTablesWithColumn(columnName: string): Promise<string[]> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables()

  return tables
    .filter(table => table.columns.some(col => col.name === columnName))
    .map(table => table.name)
}

/**
 * Get table relationships (foreign key graph)
 */
export async function getTableRelationships(): Promise<{
  fromTable: string
  toTable: string
  onColumn: string
  referencedColumn: string
}[]> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const tables = await extractor.extractTables()

  const relationships: {
    fromTable: string
    toTable: string
    onColumn: string
    referencedColumn: string
  }[] = []

  for (const table of tables) {
    for (const fk of table.foreignKeys) {
      relationships.push({
        fromTable: table.name,
        toTable: fk.referencedTableName,
        onColumn: fk.columnName,
        referencedColumn: fk.referencedColumnName
      })
    }
  }

  return relationships
}

/**
 * Create schema backup with timestamp
 */
export async function createSchemaBackup(backupDir: string = './schema-backups'): Promise<string> {
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  const schema = await extractor.extractFullSchema()
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
  const filename = `schema-backup-${timestamp}.json`
  const filepath = `${backupDir}/${filename}`
  
  await extractor.saveSchemaToFile(filepath, 'json', schema)
  
  return filepath
}

/**
 * Detect schema changes since last backup
 */
export async function detectSchemaChanges(lastBackupPath: string): Promise<{
  hasChanges: boolean
  summary: string
  details: any
}> {
  const fs = require('fs')
  const extractor = new MySQLSchemaExtractor(globalThis.sql)
  
  // Load last backup
  const oldSchemaJson = fs.readFileSync(lastBackupPath, 'utf8')
  const oldSchema = JSON.parse(oldSchemaJson)
  
  // Get current schema
  const newSchema = await extractor.extractFullSchema()
  
  // Compare
  const comparison = extractor.compareSchemas(oldSchema, newSchema)
  
  const hasChanges = 
    comparison.addedTables.length > 0 ||
    comparison.removedTables.length > 0 ||
    comparison.modifiedTables.length > 0 ||
    comparison.addedViews.length > 0 ||
    comparison.removedViews.length > 0 ||
    comparison.modifiedViews.length > 0
  
  let summary = 'No changes detected'
  if (hasChanges) {
    const changes: string[] = []
    if (comparison.addedTables.length > 0) changes.push(`${comparison.addedTables.length} tables added`)
    if (comparison.removedTables.length > 0) changes.push(`${comparison.removedTables.length} tables removed`)
    if (comparison.modifiedTables.length > 0) changes.push(`${comparison.modifiedTables.length} tables modified`)
    if (comparison.addedViews.length > 0) changes.push(`${comparison.addedViews.length} views added`)
    if (comparison.removedViews.length > 0) changes.push(`${comparison.removedViews.length} views removed`)
    if (comparison.modifiedViews.length > 0) changes.push(`${comparison.modifiedViews.length} views modified`)
    
    summary = changes.join(', ')
  }
  
  return {
    hasChanges,
    summary,
    details: comparison
  }
}
