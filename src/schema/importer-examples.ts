/**
 * Example usage of MySQLSchemaImporter
 * 
 * This file demonstrates how to import and apply database schemas from JSON
 */

import { MySQLSchemaImporter } from './MySQLSchemaImporter'
import { MySQLSchemaExtractor } from './MySQLSchemaExtractor'
import type { DatabaseSchema, SchemaImportOptions } from './types'

/**
 * Import schema from JSON file
 */
async function importSchemaFromFile() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Load schema from JSON file
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  console.log(`Loaded schema: ${schema.databaseName}`)
  console.log(`Tables: ${schema.tables.length}`)
  
  return schema
}

/**
 * Import schema from JSON string
 */
async function importSchemaFromJSON() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  const jsonString = `{
    "databaseName": "test_db",
    "tables": [...],
    "views": [],
    ...
  }`
  
  const schema = importer.loadSchemaFromJSON(jsonString)
  return schema
}

/**
 * Apply complete schema to database
 */
async function applyCompleteSchema() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Load schema
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  // Apply with default options
  const result = await importer.applySchema(schema)
  
  console.log('Schema Import Results:')
  console.log(`Success: ${result.success}`)
  console.log(`Tables created: ${result.tablesCreated.length}`)
  console.log(`Views created: ${result.viewsCreated.length}`)
  console.log(`Functions created: ${result.functionsCreated.length}`)
  console.log(`Procedures created: ${result.proceduresCreated.length}`)
  console.log(`Triggers created: ${result.triggersCreated.length}`)
  console.log(`Events created: ${result.eventsCreated.length}`)
  
  if (result.errors.length > 0) {
    console.log('\nErrors:')
    result.errors.forEach(e => console.log(`  ${e.object}: ${e.error}`))
  }
  
  return result
}

/**
 * Apply schema with custom options
 */
async function applySchemaWithOptions() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  const options: SchemaImportOptions = {
    dropExisting: true,      // Drop existing objects before creating
    createTables: true,      // Create tables
    createViews: true,       // Create views
    createFunctions: false,  // Skip functions
    createProcedures: false, // Skip procedures
    createTriggers: false,   // Skip triggers
    createEvents: false,     // Skip events
    skipErrors: true,        // Continue on errors
    dryRun: false           // Actually execute (set to true to test)
  }
  
  const result = await importer.applySchema(schema, options)
  
  console.log(`Created ${result.tablesCreated.length} tables`)
  console.log(`Created ${result.viewsCreated.length} views`)
  
  return result
}

/**
 * Dry run - validate schema without applying
 */
async function dryRunSchema() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  const result = await importer.applySchema(schema, {
    dryRun: true,
    skipErrors: true
  })
  
  console.log('[DRY RUN] Schema validation:')
  console.log(`Would create ${result.tablesCreated.length} tables`)
  console.log(`Would create ${result.viewsCreated.length} views`)
  
  if (result.errors.length > 0) {
    console.log('\nPotential errors:')
    result.errors.forEach(e => console.log(`  ${e.object}: ${e.error}`))
  }
  
  return result
}

/**
 * Apply only tables from schema
 */
async function applyTablesOnly() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  // Apply only tables, skip everything else
  const result = await importer.applyTables(schema, {
    dropExisting: false,
    skipErrors: true
  })
  
  console.log(`Created ${result.tablesCreated.length} tables`)
  
  return result
}

/**
 * Apply specific tables only
 */
async function applySpecificTables() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  // Apply only specific tables
  const tablesToCreate = ['user', 'user_preference', 'user_enlistment']
  
  const result = await importer.applySpecificTables(schema, tablesToCreate, {
    dropExisting: true,
    skipErrors: false
  })
  
  console.log(`Created tables: ${result.tablesCreated.join(', ')}`)
  
  return result
}

/**
 * Validate schema before applying
 */
async function validateSchema() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  const schema = await importer.loadSchemaFromFile('./schema/database.json')
  
  const validation = await importer.validateSchema(schema)
  
  console.log('Schema Validation:')
  console.log(`Valid: ${validation.valid}`)
  
  if (validation.errors.length > 0) {
    console.log('\nErrors:')
    validation.errors.forEach(e => console.log(`  ${e}`))
  }
  
  if (validation.warnings.length > 0) {
    console.log('\nWarnings:')
    validation.warnings.forEach(w => console.log(`  ${w}`))
  }
  
  return validation
}

/**
 * Clone schema from one database to another
 * Now automatically creates target database if it doesn't exist
 */
async function cloneDatabase() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'source_db')
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Extract schema from source database
  console.log('Extracting schema from source_db...')
  const schema = await extractor.extractFullSchema()
  
  // Apply to target database (creates if doesn't exist)
  console.log('Applying schema to target_db...')
  const result = await importer.cloneSchema(schema, 'target_db', {
    createDatabase: true,  // Create database if doesn't exist (default: true)
    dropDatabase: false,   // Don't drop if exists (default: false)
    dropExisting: true,    // Drop existing tables/views
    skipErrors: false
  })
  
  console.log(`Cloned ${result.tablesCreated.length} tables to target_db`)
  
  return result
}

/**
 * Create a completely new database with schema
 */
async function createNewDatabase() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'template_db')
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Extract schema from template
  const schema = await extractor.extractFullSchema()
  
  // Create new database with schema
  const result = await importer.createDatabase('new_project_db', schema, {
    dropIfExists: true,  // Drop if exists
    createTables: true,
    createViews: true,
    skipErrors: false
  })
  
  console.log(`Created new database 'new_project_db' with ${result.tablesCreated.length} tables`)
  
  return result
}

/**
 * Clone with database recreation
 */
async function cloneWithRecreation() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'production')
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  const schema = await extractor.extractFullSchema()
  
  // Drop and recreate target database
  const result = await importer.cloneSchema(schema, 'staging', {
    dropDatabase: true,    // Drop entire database first
    createDatabase: true,  // Then create it fresh
    dropExisting: false,   // Not needed since database was dropped
    skipErrors: false
  })
  
  console.log(`Recreated staging database with ${result.tablesCreated.length} tables`)
  
  return result
}

/**
 * Backup and restore workflow
 */
async function backupAndRestoreWorkflow() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'production_db')
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // 1. Backup: Extract and save schema
  console.log('Step 1: Creating backup...')
  const schema = await extractor.extractFullSchema()
  await extractor.saveSchemaToFile('./backups/schema-backup.json', 'json', schema)
  console.log('✓ Backup saved')
  
  // 2. Restore: Load and apply schema
  console.log('\nStep 2: Restoring from backup...')
  const backupSchema = await importer.loadSchemaFromFile('./backups/schema-backup.json')
  
  // Validate first
  const validation = await importer.validateSchema(backupSchema)
  if (!validation.valid) {
    console.error('❌ Schema validation failed!')
    console.error(validation.errors)
    return
  }
  
  // Apply schema
  const result = await importer.applySchema(backupSchema, {
    dropExisting: false,
    skipErrors: true
  })
  
  console.log('✓ Schema restored')
  console.log(`  Tables: ${result.tablesCreated.length}`)
  console.log(`  Views: ${result.viewsCreated.length}`)
  
  if (result.errors.length > 0) {
    console.log('\n⚠ Some errors occurred:')
    result.errors.forEach(e => console.log(`  ${e.object}: ${e.error}`))
  }
}

/**
 * Migration workflow: Apply schema changes
 */
async function migrationWorkflow() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Load new schema version
  const newSchema = await importer.loadSchemaFromFile('./migrations/v2-schema.json')
  
  // Apply with caution - drop existing and recreate
  const result = await importer.applySchema(newSchema, {
    dropExisting: true,  // ⚠️ This will drop existing tables!
    skipErrors: false,   // Fail on any error
    dryRun: false       // Set to true to test first
  })
  
  if (result.success) {
    console.log('✓ Migration successful!')
  } else {
    console.error('❌ Migration failed!')
    console.error(result.errors)
  }
  
  return result
}

/**
 * Incremental update: Add new tables only
 */
async function incrementalUpdate() {
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // Load schema with new tables
  const schema = await importer.loadSchemaFromFile('./updates/new-tables.json')
  
  // Apply without dropping existing objects
  const result = await importer.applySchema(schema, {
    dropExisting: false,  // Keep existing objects
    skipErrors: true,     // Skip if table already exists
    createTables: true,
    createViews: false,
    createFunctions: false,
    createProcedures: false,
    createTriggers: false,
    createEvents: false
  })
  
  console.log(`Added ${result.tablesCreated.length} new tables`)
  
  if (result.errors.length > 0) {
    console.log('\nSkipped (already exist):')
    result.errors.forEach(e => console.log(`  ${e.object}`))
  }
  
  return result
}

/**
 * Complete workflow: Extract, modify, and re-import
 */
async function modifyAndReimport() {
  const extractor = new MySQLSchemaExtractor(globalThis.sql, 'my_database')
  const importer = new MySQLSchemaImporter(globalThis.sql)
  
  // 1. Extract current schema
  console.log('Extracting current schema...')
  const schema = await extractor.extractFullSchema()
  
  // 2. Modify schema (example: remove a table)
  console.log('Modifying schema...')
  schema.tables = schema.tables.filter(t => t.name !== 'old_table')
  
  // 3. Add a new table
  // schema.tables.push({ ... }) // Add new table definition
  
  // 4. Validate changes
  console.log('Validating changes...')
  const validation = await importer.validateSchema(schema)
  
  if (!validation.valid) {
    console.error('Schema validation failed!')
    return
  }
  
  // 5. Apply modified schema to test database
  console.log('Applying to test database...')
  const result = await importer.cloneSchema(schema, 'test_database', {
    dropExisting: true,
    skipErrors: false
  })
  
  console.log('✓ Modified schema applied to test database')
  console.log(`  Tables: ${result.tablesCreated.length}`)
}

// Export all example functions
export {
  importSchemaFromFile,
  importSchemaFromJSON,
  applyCompleteSchema,
  applySchemaWithOptions,
  dryRunSchema,
  applyTablesOnly,
  applySpecificTables,
  validateSchema,
  cloneDatabase,
  createNewDatabase,
  cloneWithRecreation,
  backupAndRestoreWorkflow,
  migrationWorkflow,
  incrementalUpdate,
  modifyAndReimport
}

// Uncomment to run an example
// backupAndRestoreWorkflow().catch(console.error)
