# MySQL Schema Extractor & Importer - Quick Reference

## Installation
```typescript
import { MySQLSchemaExtractor, MySQLSchemaImporter } from 'zwebcrawler-lib'
```

## Common Tasks

### 1. Export Schema to JSON
```typescript
const extractor = new MySQLSchemaExtractor(sql, 'database_name')
const schema = await extractor.extractFullSchema()
await extractor.saveSchemaToFile('./schema.json', 'json')
```

### 2. Import Schema from JSON
```typescript
const importer = new MySQLSchemaImporter(sql)
const schema = await importer.loadSchemaFromFile('./schema.json')
const result = await importer.applySchema(schema)
```

### 3. Clone Database
```typescript
const extractor = new MySQLSchemaExtractor(sql, 'source_db')
const importer = new MySQLSchemaImporter(sql)
const schema = await extractor.extractFullSchema()
// Creates target database if it doesn't exist
await importer.cloneSchema(schema, 'target_db', { 
  createDatabase: true,  // default: true
  dropDatabase: false    // default: false
})
```

### 3b. Create New Database
```typescript
const extractor = new MySQLSchemaExtractor(sql, 'template_db')
const importer = new MySQLSchemaImporter(sql)
const schema = await extractor.extractFullSchema()
// Create brand new database with schema
await importer.createDatabase('new_db', schema, {
  dropIfExists: true
})
```

### 4. Backup & Restore
```typescript
// Backup
const extractor = new MySQLSchemaExtractor(sql, 'prod_db')
const schema = await extractor.extractFullSchema()
await extractor.saveSchemaToFile('./backup.json', 'json')

// Restore
const importer = new MySQLSchemaImporter(sql)
const backup = await importer.loadSchemaFromFile('./backup.json')
await importer.applySchema(backup)
```

### 5. Generate TypeScript Interfaces
```typescript
const extractor = new MySQLSchemaExtractor(sql, )
await extractor.saveSchemaToFile('./database.d.ts', 'typescript')
```

### 6. Generate Documentation
```typescript
const extractor = new MySQLSchemaExtractor(sql, )
await extractor.saveSchemaToFile('./DATABASE.md', 'markdown')
```

### 7. Compare Schemas
```typescript
const extractor = new MySQLSchemaExtractor(sql, )
const oldSchema = JSON.parse(fs.readFileSync('./old-schema.json', 'utf8'))
const newSchema = await extractor.extractFullSchema()
const diff = extractor.compareSchemas(oldSchema, newSchema)
```

### 8. Validate Before Applying
```typescript
const importer = new MySQLSchemaImporter(sql)
const schema = await importer.loadSchemaFromFile('./schema.json')
const validation = await importer.validateSchema(schema)
if (validation.valid) {
  await importer.applySchema(schema)
}
```

### 9. Apply Only Specific Tables
```typescript
const importer = new MySQLSchemaImporter(sql)
const schema = await importer.loadSchemaFromFile('./schema.json')
await importer.applySpecificTables(schema, ['users', 'posts'])
```

### 10. Dry Run (Test Without Executing)
```typescript
const importer = new MySQLSchemaImporter(sql)
const schema = await importer.loadSchemaFromFile('./schema.json')
const result = await importer.applySchema(schema, { dryRun: true })
```

## Export Formats

| Format | Extension | Use Case |
|--------|-----------|----------|
| SQL | `.sql` | Database migration, replication |
| JSON | `.json` | Schema versioning, programmatic access |
| TypeScript | `.d.ts` | Type generation for TypeScript projects |
| Markdown | `.md` | Human-readable documentation |

## Import Options

```typescript
{
  dropExisting: false,     // Drop existing objects before creating
  createTables: true,      // Create tables
  createViews: true,       // Create views
  createFunctions: true,   // Create functions
  createProcedures: true,  // Create procedures
  createTriggers: true,    // Create triggers
  createEvents: true,      // Create events
  skipErrors: false,       // Continue on errors
  dryRun: false           // Only validate, don't execute
}
```

## Extract Options

```typescript
{
  includeTables: true,
  includeViews: true,
  includeProcedures: true,
  includeFunctions: true,
  includeTriggers: true,
  includeEvents: true,
  excludeSystemTables: true,
  tableFilter: ['user', 'posts'] // or /^user_.*/
}
```

## Error Handling

```typescript
try {
  const result = await importer.applySchema(schema, { skipErrors: true })
  
  if (result.errors.length > 0) {
    console.error('Errors occurred:')
    result.errors.forEach(e => console.error(`${e.object}: ${e.error}`))
  }
  
  console.log(`Success: ${result.success}`)
  console.log(`Tables created: ${result.tablesCreated.length}`)
} catch (error) {
  console.error('Fatal error:', error)
}
```

## Best Practices

1. **Always validate before applying**
   ```typescript
   const validation = await importer.validateSchema(schema)
   if (!validation.valid) {
     console.error(validation.errors)
     return
   }
   ```

2. **Use dry-run for testing**
   ```typescript
   await importer.applySchema(schema, { dryRun: true })
   ```

3. **Backup before major changes**
   ```typescript
   await extractor.saveSchemaToFile(`./backup-${Date.now()}.json`, 'json')
   ```

4. **Use skipErrors for non-critical operations**
   ```typescript
   await importer.applySchema(schema, { skipErrors: true })
   ```

5. **Filter tables for partial imports**
   ```typescript
   const schema = await extractor.extractFullSchema({
     tableFilter: /^user_.*/
   })
   ```

## Common Patterns

### Schema Versioning
```typescript
const timestamp = new Date().toISOString().split('T')[0]
await extractor.saveSchemaToFile(`./schemas/v${timestamp}.json`, 'json')
```

### Migration Script
```typescript
async function migrate() {
  const extractor = new MySQLSchemaExtractor(sql, )
  const importer = new MySQLSchemaImporter(sql)
  
  // Extract current
  const current = await extractor.extractFullSchema()
  
  // Load target
  const target = await importer.loadSchemaFromFile('./migrations/v2.json')
  
  // Compare
  const diff = extractor.compareSchemas(current, target)
  console.log('Changes:', diff)
  
  // Apply
  if (confirm('Apply migration?')) {
    await importer.applySchema(target, { dropExisting: true })
  }
}
```

### Environment Sync
```typescript
async function syncEnvironments() {
  const extractor = new MySQLSchemaExtractor(sql, 'production')
  const importer = new MySQLSchemaImporter(sql)
  
  // Extract from production
  const prodSchema = await extractor.extractFullSchema()
  
  // Apply to staging
  await importer.cloneSchema(prodSchema, 'staging', {
    dropExisting: true,
    skipErrors: true
  })
  
  // Apply to development
  await importer.cloneSchema(prodSchema, 'development', {
    dropExisting: true,
    skipErrors: true
  })
}
```

## Troubleshooting

### Error: Column not found
**Problem**: Schema references non-existent columns
**Solution**: Validate schema before applying
```typescript
const validation = await importer.validateSchema(schema)
console.log(validation.errors)
```

### Error: Table already exists
**Problem**: Table exists and dropExisting is false
**Solution**: Either drop existing or skip errors
```typescript
await importer.applySchema(schema, { 
  dropExisting: true  // or skipErrors: true 
})
```

### Error: Foreign key constraint fails
**Problem**: Referenced table doesn't exist
**Solution**: Import tables in correct order or disable FK checks
```typescript
await sql.query('SET FOREIGN_KEY_CHECKS = 0')
await importer.applySchema(schema)
await sql.query('SET FOREIGN_KEY_CHECKS = 1')
```
