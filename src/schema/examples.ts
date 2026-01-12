/**
 * Example usage of MySQLSchemaExtractor
 * 
 * This file demonstrates how to use the schema extractor to:
 * - Extract complete database schema
 * - Export to different formats (SQL, JSON, TypeScript, Markdown)
 * - Compare schemas
 * - Save schema to files
 */

import { MySQLSchemaExtractor } from './MySQLSchemaExtractor'
import type { DatabaseSchema, SchemaExtractionOptions } from './types'

/**
 * Basic usage - Extract full schema
 */
async function extractFullSchema() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'woningnet')
  
  // Extract complete schema with all objects
  const schema = await extractor.extractFullSchema()
  
  console.log(`Database: ${schema.databaseName}`)
  console.log(`Tables: ${schema.tables.length}`)
  console.log(`Views: ${schema.views.length}`)
  console.log(`Functions: ${schema.functions.length}`)
  console.log(`Procedures: ${schema.procedures.length}`)
  console.log(`Triggers: ${schema.triggers.length}`)
  console.log(`Events: ${schema.events.length}`)
  
  return schema
}

/**
 * Extract only specific database objects
 */
async function extractPartialSchema() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  
  const options: SchemaExtractionOptions = {
    includeTables: true,
    includeViews: true,
    includeProcedures: false,
    includeFunctions: false,
    includeTriggers: false,
    includeEvents: false,
    excludeSystemTables: true
  }
  
  const schema = await extractor.extractFullSchema(options)
  return schema
}

/**
 * Extract specific tables only
 */
async function extractSpecificTables() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  
  const options: SchemaExtractionOptions = {
    includeTables: true,
    includeViews: false,
    includeProcedures: false,
    includeFunctions: false,
    includeTriggers: false,
    includeEvents: false,
    tableFilter: ['user', 'user_preference', 'user_enlistment'] // Only these tables
  }
  
  const schema = await extractor.extractFullSchema(options)
  return schema
}

/**
 * Extract tables matching a pattern
 */
async function extractTablesByPattern() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  
  const options: SchemaExtractionOptions = {
    includeTables: true,
    tableFilter: /^user_.*/, // All tables starting with 'user_'
    includeViews: false,
    includeProcedures: false,
    includeFunctions: false,
    includeTriggers: false,
    includeEvents: false
  }
  
  const schema = await extractor.extractFullSchema(options)
  return schema
}

/**
 * Export schema to SQL DDL statements
 */
async function exportToSQL() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const schema = await extractor.extractFullSchema()
  
  // Get SQL DDL statements
  const sqlDump = await extractor.exportToSQL(schema)
  
  // Save to file
  await extractor.saveSchemaToFile('./schema/database-schema.sql', 'sql', schema)
  
  console.log('SQL schema exported to ./schema/database-schema.sql')
  
  return sqlDump
}

/**
 * Export schema to JSON
 */
async function exportToJSON() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const schema = await extractor.extractFullSchema()
  
  // Get JSON (pretty formatted)
  const jsonSchema = await extractor.exportToJSON(schema, true)
  
  // Save to file
  await extractor.saveSchemaToFile('./schema/database-schema.json', 'json', schema)
  
  console.log('JSON schema exported to ./schema/database-schema.json')
  
  return jsonSchema
}

/**
 * Export schema to TypeScript interfaces
 */
async function exportToTypeScript() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const schema = await extractor.extractFullSchema()
  
  // Get TypeScript interfaces
  const tsInterfaces = await extractor.exportToTypeScript(schema)
  
  // Save to file
  await extractor.saveSchemaToFile('./schema/database-schema.d.ts', 'typescript', schema)
  
  console.log('TypeScript interfaces exported to ./schema/database-schema.d.ts')
  
  return tsInterfaces
}

/**
 * Export schema to Markdown documentation
 */
async function exportToMarkdown() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const schema = await extractor.extractFullSchema()
  
  // Get Markdown documentation
  const markdown = await extractor.exportToMarkdown(schema)
  
  // Save to file
  await extractor.saveSchemaToFile('./schema/DATABASE.md', 'markdown', schema)
  
  console.log('Markdown documentation exported to ./schema/DATABASE.md')
  
  return markdown
}

/**
 * Compare two schemas
 */
async function compareSchemas(oldSchemaJson: string, newSchemaJson: string) {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  
  const oldSchema: DatabaseSchema = JSON.parse(oldSchemaJson)
  const newSchema: DatabaseSchema = JSON.parse(newSchemaJson)
  
  const comparison = extractor.compareSchemas(oldSchema, newSchema)
  
  console.log('Schema Comparison:')
  console.log(`Added tables: ${comparison.addedTables.join(', ') || 'none'}`)
  console.log(`Removed tables: ${comparison.removedTables.join(', ') || 'none'}`)
  console.log(`Modified tables: ${comparison.modifiedTables.length}`)
  
  for (const table of comparison.modifiedTables) {
    console.log(`\n  Table: ${table.tableName}`)
    if (table.addedColumns.length > 0) {
      console.log(`    Added columns: ${table.addedColumns.join(', ')}`)
    }
    if (table.removedColumns.length > 0) {
      console.log(`    Removed columns: ${table.removedColumns.join(', ')}`)
    }
    if (table.modifiedColumns.length > 0) {
      console.log(`    Modified columns: ${table.modifiedColumns.join(', ')}`)
    }
  }
  
  console.log(`\nAdded views: ${comparison.addedViews.join(', ') || 'none'}`)
  console.log(`Removed views: ${comparison.removedViews.join(', ') || 'none'}`)
  console.log(`Modified views: ${comparison.modifiedViews.join(', ') || 'none'}`)
  
  return comparison
}

/**
 * Extract only tables information
 */
async function extractTablesOnly() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  
  const tables = await extractor.extractTables({
    excludeSystemTables: true
  })
  
  for (const table of tables) {
    console.log(`\nTable: ${table.name}`)
    console.log(`  Columns: ${table.columns.length}`)
    console.log(`  Indexes: ${table.indexes.length}`)
    console.log(`  Foreign Keys: ${table.foreignKeys.length}`)
    console.log(`  Engine: ${table.engine}`)
    console.log(`  Collation: ${table.collation}`)
  }
  
  return tables
}

/**
 * Extract only views
 */
async function extractViewsOnly() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const views = await extractor.extractViews()
  
  for (const view of views) {
    console.log(`\nView: ${view.name}`)
    console.log(`  Updatable: ${view.isUpdatable}`)
    console.log(`  Definition: ${view.definition.substring(0, 100)}...`)
  }
  
  return views
}

/**
 * Extract only stored procedures
 */
async function extractProceduresOnly() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const procedures = await extractor.extractProcedures()
  
  for (const proc of procedures) {
    console.log(`\nProcedure: ${proc.name}`)
    console.log(`  Deterministic: ${proc.isDeterministic}`)
    console.log(`  Created: ${proc.created}`)
    console.log(`  Comment: ${proc.comment}`)
  }
  
  return procedures
}

/**
 * Extract only functions
 */
async function extractFunctionsOnly() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const functions = await extractor.extractFunctions()
  
  for (const func of functions) {
    console.log(`\nFunction: ${func.name}`)
    console.log(`  Returns: ${func.returns}`)
    console.log(`  Deterministic: ${func.isDeterministic}`)
    console.log(`  Comment: ${func.comment}`)
  }
  
  return functions
}

/**
 * Extract only triggers
 */
async function extractTriggersOnly() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, globalThis.sql)
  const triggers = await extractor.extractTriggers()
  
  for (const trigger of triggers) {
    console.log(`\nTrigger: ${trigger.name}`)
    console.log(`  Table: ${trigger.tableName}`)
    console.log(`  Event: ${trigger.timing} ${trigger.event}`)
  }
  
  return triggers
}

/**
 * Complete workflow: Extract and export to all formats
 */
async function completeWorkflow() {
  console.log('Starting complete schema extraction workflow...\n')
  
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'woningnet')
  
  // Extract schema
  console.log('Extracting database schema...')
  const schema = await extractor.extractFullSchema()
  console.log(`✓ Extracted ${schema.tables.length} tables, ${schema.views.length} views`)
  
  // Export to SQL
  console.log('\nExporting to SQL...')
  await extractor.saveSchemaToFile('./schema/database.sql', 'sql', schema)
  console.log('✓ SQL export complete')
  
  // Export to JSON
  console.log('\nExporting to JSON...')
  await extractor.saveSchemaToFile('./schema/database.json', 'json', schema)
  console.log('✓ JSON export complete')
  
  // Export to TypeScript
  console.log('\nExporting to TypeScript...')
  await extractor.saveSchemaToFile('./schema/database.d.ts', 'typescript', schema)
  console.log('✓ TypeScript export complete')
  
  // Export to Markdown
  console.log('\nExporting to Markdown...')
  await extractor.saveSchemaToFile('./schema/DATABASE.md', 'markdown', schema)
  console.log('✓ Markdown export complete')
  
  console.log('\n✓ Complete workflow finished!')
  console.log('All schema files have been saved to ./schema/ directory')
}

// Export all example functions
export {
  extractFullSchema,
  extractPartialSchema,
  extractSpecificTables,
  extractTablesByPattern,
  exportToSQL,
  exportToJSON,
  exportToTypeScript,
  exportToMarkdown,
  compareSchemas,
  extractTablesOnly,
  extractViewsOnly,
  extractProceduresOnly,
  extractFunctionsOnly,
  extractTriggersOnly,
  completeWorkflow
}

// Uncomment to run the complete workflow
// completeWorkflow().catch(console.error)
