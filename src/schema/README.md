# MySQL Schema Extractor & Importer

A comprehensive TypeScript library for extracting, analyzing, exporting, and importing MySQL database schemas. Supports multiple export formats including SQL DDL, JSON, TypeScript interfaces, and Markdown documentation. Also supports importing and applying schemas from JSON back to database.

## Features

- 📊 **Complete Schema Extraction**: Tables, views, stored procedures, functions, triggers, and events
- 🔍 **Detailed Information**: Column types, indexes, foreign keys, constraints, and comments
- 📤 **Multiple Export Formats**: SQL, JSON, TypeScript, Markdown
- 📥 **Schema Import**: Apply schemas from JSON to database
- 🔄 **Schema Comparison**: Compare two schemas and identify changes
- 🎯 **Flexible Filtering**: Extract specific tables or patterns
- 💾 **File Export/Import**: Save and load schemas to/from files
- ✅ **Validation**: Validate schemas before applying
- 🔐 **Safe Operations**: Dry-run mode, error handling, transaction support
- 🛡️ **Type-Safe**: Full TypeScript support with comprehensive interfaces

## Installation

This module is part of the `zwebcrawler-lib` library. It's automatically available when you import from the library:

```typescript
import { MySQLSchemaExtractor } from 'zwebcrawler-lib'
```

## Quick Start

### Export Schema

```typescript
import { MySQLSchemaExtractor } from 'zwebcrawler-lib'

// Create extractor instance
const extractor = new MySQLSchemaExtractor('woningnet')

// Extract complete schema
const schema = await extractor.extractFullSchema()

// Export to different formats
const sqlDump = await extractor.exportToSQL()
const jsonSchema = await extractor.exportToJSON()
const tsInterfaces = await extractor.exportToTypeScript()
const markdown = await extractor.exportToMarkdown()
```

### Import Schema

```typescript
import { MySQLSchemaImporter } from 'zwebcrawler-lib'

// Create importer instance
const importer = new MySQLSchemaImporter()

// Load schema from JSON file
const schema = await importer.loadSchemaFromFile('./schema/database.json')

// Apply schema to database
const result = await importer.applySchema(schema, {
  dropExisting: false,
  createTables: true,
  createViews: true,
  skipErrors: false
})

console.log(`Created ${result.tablesCreated.length} tables`)
```

## Usage Examples

### Extract Full Schema

```typescript
const extractor = new MySQLSchemaExtractor('woningnet')
const schema = await extractor.extractFullSchema()

console.log(`Database: ${schema.databaseName}`)
console.log(`Tables: ${schema.tables.length}`)
console.log(`Views: ${schema.views.length}`)
```

### Extract Specific Objects

```typescript
const options = {
  includeTables: true,
  includeViews: true,
  includeProcedures: false,
  includeFunctions: false,
  includeTriggers: false,
  includeEvents: false,
  excludeSystemTables: true
}

const schema = await extractor.extractFullSchema(options)
```

### Extract Specific Tables

```typescript
// By exact names
const options = {
  tableFilter: ['user', 'user_preference', 'user_enlistment']
}

// By pattern
const options = {
  tableFilter: /^user_.*/ // All tables starting with 'user_'
}

const schema = await extractor.extractFullSchema(options)
```

### Export to SQL

```typescript
// Get SQL DDL statements as string
const sqlDump = await extractor.exportToSQL()

// Or save directly to file
await extractor.saveSchemaToFile('./schema/database.sql', 'sql')
```

### Export to JSON

```typescript
// Get JSON as string
const jsonSchema = await extractor.exportToJSON(schema, true) // true = pretty format

// Or save directly to file
await extractor.saveSchemaToFile('./schema/database.json', 'json')
```

### Export to TypeScript Interfaces

```typescript
// Get TypeScript interfaces as string
const tsInterfaces = await extractor.exportToTypeScript()

// Or save directly to file
await extractor.saveSchemaToFile('./schema/database.d.ts', 'typescript')
```

### Export to Markdown Documentation

```typescript
// Get Markdown documentation as string
const markdown = await extractor.exportToMarkdown()

// Or save directly to file
await extractor.saveSchemaToFile('./schema/DATABASE.md', 'markdown')
```

### Compare Two Schemas

```typescript
const extractor = new MySQLSchemaExtractor()

// Load two schema versions
const oldSchema = JSON.parse(await fs.readFile('./schema/old.json', 'utf8'))
const newSchema = await extractor.extractFullSchema()

// Compare them
const comparison = extractor.compareSchemas(oldSchema, newSchema)

console.log('Added tables:', comparison.addedTables)
console.log('Removed tables:', comparison.removedTables)
console.log('Modified tables:', comparison.modifiedTables)
console.log('Added views:', comparison.addedViews)
console.log('Removed views:', comparison.removedViews)
console.log('Modified views:', comparison.modifiedViews)
```

### Extract Individual Components

```typescript
// Extract only tables
const tables = await extractor.extractTables()

// Extract only views
const views = await extractor.extractViews()

// Extract only procedures
const procedures = await extractor.extractProcedures()

// Extract only functions
const functions = await extractor.extractFunctions()

// Extract only triggers
const triggers = await extractor.extractTriggers()

// Extract only events
const events = await extractor.extractEvents()
```

### Import Schema from JSON

```typescript
const importer = new MySQLSchemaImporter()

// Load schema from file
const schema = await importer.loadSchemaFromFile('./schema/database.json')

// Apply to database
const result = await importer.applySchema(schema)

console.log(`Created ${result.tablesCreated.length} tables`)
console.log(`Created ${result.viewsCreated.length} views`)
```

### Import with Options

```typescript
const importer = new MySQLSchemaImporter()
const schema = await importer.loadSchemaFromFile('./schema/database.json')

// Apply with custom options
const result = await importer.applySchema(schema, {
  dropExisting: true,      // Drop existing objects before creating
  createTables: true,      // Create tables
  createViews: true,       // Create views
  createFunctions: false,  // Skip functions
  createProcedures: false, // Skip procedures
  createTriggers: false,   // Skip triggers
  createEvents: false,     // Skip events
  skipErrors: true,        // Continue on errors
  dryRun: false           // Set to true to validate without applying
})
```

### Validate Schema Before Applying

```typescript
const importer = new MySQLSchemaImporter()
const schema = await importer.loadSchemaFromFile('./schema/database.json')

// Validate without applying
const validation = await importer.validateSchema(schema)

if (validation.valid) {
  console.log('Schema is valid!')
  // Now apply it
  await importer.applySchema(schema)
} else {
  console.error('Schema validation failed:')
  console.error(validation.errors)
}
```

### Apply Specific Tables Only

```typescript
const importer = new MySQLSchemaImporter()
const schema = await importer.loadSchemaFromFile('./schema/database.json')

// Apply only specific tables
const result = await importer.applySpecificTables(
  schema,
  ['user', 'user_preference', 'user_enlistment'],
  { dropExisting: true }
)

console.log(`Created: ${result.tablesCreated.join(', ')}`)
```

### Clone Database

```typescript
const extractor = new MySQLSchemaExtractor('production_db')
const importer = new MySQLSchemaImporter()

// Extract from source
const schema = await extractor.extractFullSchema()

// Apply to target (creates database if doesn't exist)
const result = await importer.cloneSchema(schema, 'test_db', {
  createDatabase: true,  // Create database if doesn't exist (default: true)
  dropDatabase: false,   // Drop database if exists (default: false)
  dropExisting: true     // Drop existing tables/views
})

console.log(`Cloned ${result.tablesCreated.length} tables to test_db`)
```

### Create New Database with Schema

```typescript
const extractor = new MySQLSchemaExtractor('template_db')
const importer = new MySQLSchemaImporter()

// Extract schema from template
const schema = await extractor.extractFullSchema()

// Create completely new database with schema
const result = await importer.createDatabase('new_project_db', schema, {
  dropIfExists: true,  // Drop if exists
  createTables: true,
  createViews: true
})

console.log(`Created new database with ${result.tablesCreated.length} tables`)
```

### Clone with Complete Recreation

```typescript
const extractor = new MySQLSchemaExtractor('production')
const importer = new MySQLSchemaImporter()

const schema = await extractor.extractFullSchema()

// Drop and completely recreate target database
const result = await importer.cloneSchema(schema, 'staging', {
  dropDatabase: true,    // Drop entire database first
  createDatabase: true,  // Then create it fresh
  skipErrors: false
})
```

## API Reference

### `MySQLSchemaExtractor`

Main class for extracting database schemas.

#### Constructor

```typescript
new MySQLSchemaExtractor(databaseName?: string)
```

- `databaseName`: Optional database name (defaults to 'woningnet')

#### Methods

##### `extractFullSchema(options?: SchemaExtractionOptions): Promise<DatabaseSchema>`

Extract complete database schema with all objects.

##### `extractTables(options?: SchemaExtractionOptions): Promise<TableDefinition[]>`

Extract all tables with columns, indexes, and foreign keys.

##### `extractViews(): Promise<ViewDefinition[]>`

Extract all database views.

##### `extractProcedures(): Promise<ProcedureDefinition[]>`

Extract all stored procedures.

##### `extractFunctions(): Promise<FunctionDefinition[]>`

Extract all database functions.

##### `extractTriggers(): Promise<TriggerDefinition[]>`

Extract all triggers.

##### `extractEvents(): Promise<EventDefinition[]>`

Extract all scheduled events.

##### `exportToSQL(schema?: DatabaseSchema): Promise<string>`

Export schema as SQL DDL statements.

##### `exportToJSON(schema?: DatabaseSchema, pretty?: boolean): Promise<string>`

Export schema as JSON.

##### `exportToTypeScript(schema?: DatabaseSchema): Promise<string>`

Export schema as TypeScript interfaces.

##### `exportToMarkdown(schema?: DatabaseSchema): Promise<string>`

Export schema as Markdown documentation.

##### `compareSchemas(oldSchema: DatabaseSchema, newSchema: DatabaseSchema): SchemaComparison`

Compare two schemas and return differences.

##### `saveSchemaToFile(filePath: string, format: ExportFormat, schema?: DatabaseSchema): Promise<void>`

Save schema to a file in the specified format.

### `MySQLSchemaImporter`

Main class for importing and applying database schemas.

#### Constructor

```typescript
new MySQLSchemaImporter()
```

#### Methods

##### `loadSchemaFromFile(filePath: string): Promise<DatabaseSchema>`

Load schema from a JSON file.

##### `loadSchemaFromJSON(jsonString: string): DatabaseSchema`

Load schema from a JSON string.

##### `applySchema(schema: DatabaseSchema, options?: SchemaImportOptions): Promise<SchemaImportResult>`

Apply complete schema to database. Returns result with created objects and any errors.

##### `applyTables(schema: DatabaseSchema, options?: SchemaImportOptions): Promise<SchemaImportResult>`

Apply only tables from schema (skip views, functions, etc).

##### `applySpecificTables(schema: DatabaseSchema, tableNames: string[], options?: SchemaImportOptions): Promise<SchemaImportResult>`

Apply only specific tables by name.

##### `validateSchema(schema: DatabaseSchema): Promise<{ valid: boolean, errors: string[], warnings: string[] }>`

Validate schema without applying it (dry-run validation).

##### `cloneSchema(sourceSchema: DatabaseSchema, targetDatabase: string, options?: SchemaImportOptions & { createDatabase?: boolean, dropDatabase?: boolean }): Promise<SchemaImportResult>`

Clone schema from one database to another. Automatically creates target database if it doesn't exist.

Options:
- `createDatabase` (default: true) - Create target database if it doesn't exist
- `dropDatabase` (default: false) - Drop target database if it exists before cloning

##### `createDatabase(databaseName: string, schema: DatabaseSchema, options?: SchemaImportOptions & { dropIfExists?: boolean }): Promise<SchemaImportResult>`

Create a new database and apply schema to it.

Options:
- `dropIfExists` (default: false) - Drop database if it exists before creating

## Types

### `SchemaExtractionOptions`

```typescript
interface SchemaExtractionOptions {
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
```

### `SchemaImportOptions`

```typescript
interface SchemaImportOptions {
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
```

### `SchemaImportResult`

```typescript
interface SchemaImportResult {
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
```

### `DatabaseSchema`

```typescript
interface DatabaseSchema {
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
```

### `TableDefinition`

```typescript
interface TableDefinition {
  name: string
  columns: ColumnDefinition[]
  indexes: IndexDefinition[]
  foreignKeys: ForeignKeyDefinition[]
  engine: string
  collation: string
  comment: string
  createStatement?: string
}
```

### `ColumnDefinition`

```typescript
interface ColumnDefinition {
  name: string
  type: string
  nullable: boolean
  defaultValue: string | null
  extra: string
  comment: string
  characterSet?: string
  collation?: string
  key?: 'PRI' | 'UNI' | 'MUL' | ''
}
```

See `types.ts` for complete type definitions.

## Use Cases

### 1. Database Documentation

Generate comprehensive database documentation:

```typescript
const extractor = new MySQLSchemaExtractor()
await extractor.saveSchemaToFile('./docs/DATABASE.md', 'markdown')
```

### 2. Schema Versioning

Save schema snapshots for version control:

```typescript
const schema = await extractor.extractFullSchema()
await extractor.saveSchemaToFile(
  `./schemas/schema-${new Date().toISOString()}.json`,
  'json',
  schema
)
```

### 3. Migration Generation

Compare schemas to generate migrations:

```typescript
const oldSchema = JSON.parse(await fs.readFile('./schema-v1.json', 'utf8'))
const newSchema = await extractor.extractFullSchema()
const diff = extractor.compareSchemas(oldSchema, newSchema)

// Use diff to generate migration SQL
```

### 4. Type Generation

Generate TypeScript types for database tables:

```typescript
await extractor.saveSchemaToFile('./types/database.d.ts', 'typescript')
```

### 5. Database Replication

Export schema for setting up replicas:

```typescript
const sqlDump = await extractor.exportToSQL()
// Apply sqlDump to replica database
```

## Complete Workflow Example

```typescript
import { MySQLSchemaExtractor } from 'zwebcrawler-lib'

async function documentDatabase() {
  const extractor = new MySQLSchemaExtractor('woningnet')
  
  // Extract schema
  console.log('Extracting database schema...')
  const schema = await extractor.extractFullSchema()
  
  // Export to all formats
  await Promise.all([
    extractor.saveSchemaToFile('./schema/database.sql', 'sql', schema),
    extractor.saveSchemaToFile('./schema/database.json', 'json', schema),
    extractor.saveSchemaToFile('./schema/database.d.ts', 'typescript', schema),
    extractor.saveSchemaToFile('./schema/DATABASE.md', 'markdown', schema)
  ])
  
  console.log('✓ Database schema documented in all formats!')
}

documentDatabase().catch(console.error)
```

## Dependencies

- `lib/core/factory/sql` - SQL connection service
- Node.js `fs` and `path` modules for file operations

## License

Part of the zwebcrawler-lib project.
