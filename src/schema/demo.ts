/**
 * Demo script for MySQLSchemaExtractor
 * 
 * This script demonstrates the basic functionality of the schema extractor
 * Run with: tsx src/lib/db/schema/demo.ts
 */

import { MySQLSchemaExtractor } from './MySQLSchemaExtractor'

async function runDemo() {
  console.log('='.repeat(80))
  console.log('MySQL Schema Extractor Demo')
  console.log('='.repeat(80))
  console.log()

  try {
    // Initialize the extractor
    console.log('📊 Initializing schema extractor...')
    const extractor = new MySQLSchemaExtractor(globalThis.sql, 'woningnet')
    console.log('✓ Extractor initialized\n')

    // Extract full schema
    console.log('🔍 Extracting database schema...')
    const schema = await extractor.extractFullSchema({
      excludeSystemTables: true
    })
    console.log('✓ Schema extracted successfully\n')

    // Display summary
    console.log('📈 Database Schema Summary')
    console.log('-'.repeat(80))
    console.log(`Database Name:      ${schema.databaseName}`)
    console.log(`MySQL Version:      ${schema.version}`)
    console.log(`Character Set:      ${schema.characterSet}`)
    console.log(`Collation:          ${schema.collation}`)
    console.log(`Extracted At:       ${schema.extractedAt.toISOString()}`)
    console.log()
    console.log(`Tables:             ${schema.tables.length}`)
    console.log(`Views:              ${schema.views.length}`)
    console.log(`Functions:          ${schema.functions.length}`)
    console.log(`Procedures:         ${schema.procedures.length}`)
    console.log(`Triggers:           ${schema.triggers.length}`)
    console.log(`Events:             ${schema.events.length}`)
    console.log()

    // Display table details
    if (schema.tables.length > 0) {
      console.log('📋 Table Details')
      console.log('-'.repeat(80))
      
      for (const table of schema.tables.slice(0, 5)) { // Show first 5 tables
        console.log(`\n  Table: ${table.name}`)
        console.log(`    Engine:       ${table.engine}`)
        console.log(`    Columns:      ${table.columns.length}`)
        console.log(`    Indexes:      ${table.indexes.length}`)
        console.log(`    Foreign Keys: ${table.foreignKeys.length}`)
        
        if (table.comment) {
          console.log(`    Comment:      ${table.comment}`)
        }
        
        // Show first few columns
        const columnNames = table.columns.slice(0, 5).map(c => c.name).join(', ')
        console.log(`    Columns:      ${columnNames}${table.columns.length > 5 ? '...' : ''}`)
      }
      
      if (schema.tables.length > 5) {
        console.log(`\n  ... and ${schema.tables.length - 5} more tables`)
      }
      console.log()
    }

    // Display view details
    if (schema.views.length > 0) {
      console.log('👁️  View Details')
      console.log('-'.repeat(80))
      
      for (const view of schema.views) {
        console.log(`\n  View: ${view.name}`)
        console.log(`    Updatable:    ${view.isUpdatable ? 'Yes' : 'No'}`)
        console.log(`    Check Option: ${view.checkOption}`)
      }
      console.log()
    }

    // Display function details
    if (schema.functions.length > 0) {
      console.log('⚙️  Function Details')
      console.log('-'.repeat(80))
      
      for (const func of schema.functions) {
        console.log(`\n  Function: ${func.name}`)
        console.log(`    Returns:      ${func.returns}`)
        console.log(`    Deterministic: ${func.isDeterministic ? 'Yes' : 'No'}`)
        if (func.comment) {
          console.log(`    Comment:      ${func.comment}`)
        }
      }
      console.log()
    }

    // Display procedure details
    if (schema.procedures.length > 0) {
      console.log('🔧 Procedure Details')
      console.log('-'.repeat(80))
      
      for (const proc of schema.procedures) {
        console.log(`\n  Procedure: ${proc.name}`)
        console.log(`    Deterministic: ${proc.isDeterministic ? 'Yes' : 'No'}`)
        console.log(`    Created:       ${proc.created.toISOString()}`)
        if (proc.comment) {
          console.log(`    Comment:       ${proc.comment}`)
        }
      }
      console.log()
    }

    // Display trigger details
    if (schema.triggers.length > 0) {
      console.log('⚡ Trigger Details')
      console.log('-'.repeat(80))
      
      for (const trigger of schema.triggers) {
        console.log(`\n  Trigger: ${trigger.name}`)
        console.log(`    Table:        ${trigger.tableName}`)
        console.log(`    Event:        ${trigger.timing} ${trigger.event}`)
      }
      console.log()
    }

    // Demonstrate exports
    console.log('📤 Export Demonstrations')
    console.log('-'.repeat(80))
    
    // SQL Export preview
    console.log('\n1. SQL Export (first 500 chars):')
    const sqlExport = await extractor.exportToSQL(schema)
    console.log(sqlExport.substring(0, 500) + '...\n')
    
    // JSON Export preview
    console.log('2. JSON Export (first 300 chars):')
    const jsonExport = await extractor.exportToJSON(schema, true)
    console.log(jsonExport.substring(0, 300) + '...\n')
    
    // TypeScript Export preview
    console.log('3. TypeScript Export (first 500 chars):')
    const tsExport = await extractor.exportToTypeScript(schema)
    console.log(tsExport.substring(0, 500) + '...\n')
    
    // Markdown Export preview
    console.log('4. Markdown Export (first 400 chars):')
    const mdExport = await extractor.exportToMarkdown(schema)
    console.log(mdExport.substring(0, 400) + '...\n')

    // Success message
    console.log('='.repeat(80))
    console.log('✓ Demo completed successfully!')
    console.log('='.repeat(80))
    console.log()
    console.log('💡 To save the schema to files, use:')
    console.log('   await extractor.saveSchemaToFile("./schema/database.sql", "sql")')
    console.log('   await extractor.saveSchemaToFile("./schema/database.json", "json")')
    console.log('   await extractor.saveSchemaToFile("./schema/database.d.ts", "typescript")')
    console.log('   await extractor.saveSchemaToFile("./schema/DATABASE.md", "markdown")')
    console.log()

  } catch (error) {
    console.error('❌ Error during demo:')
    console.error(error)
    process.exit(1)
  }
}

// Run the demo
if (require.main === module) {
  runDemo()
    .then(() => {
      console.log('Demo finished. Exiting...')
      process.exit(0)
    })
    .catch((error) => {
      console.error('Fatal error:', error)
      process.exit(1)
    })
}

export { runDemo }
