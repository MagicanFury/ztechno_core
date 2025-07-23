/**
 * Example implementation showing how to extend ZUserService with custom user fields
 * This file demonstrates the extensibility patterns for other projects
 */

import { ZUserService, ZUserExtended, ZRequiredUserColumnsExtended, ZUserTableConfig } from 'ztechno_core'

// Define your custom user type extending the base
interface MyCustomUser extends ZUserExtended {
  username: string
  first_name: string
  last_name: string
  avatar_url?: string
  bio?: string
  is_active: 0 | 1
  email_verified: 0 | 1
  last_login?: Date
}

// Define what's required when creating users
type MyUserCreateData = ZRequiredUserColumnsExtended<{
  username: string
  first_name: string
  last_name: string
  is_active?: 0 | 1
  email_verified?: 0 | 1
}>

// Configure your custom table schema
const customTableConfig: ZUserTableConfig = {
  tableName: 'my_users', // Optional: use custom table name
  customColumns: {
    // Define your custom columns with SQL definitions
    username: 'varchar(50) NOT NULL',
    first_name: 'varchar(100) NOT NULL',
    last_name: 'varchar(100) NOT NULL', 
    avatar_url: 'varchar(500) DEFAULT NULL',
    bio: 'text DEFAULT NULL',
    is_active: 'tinyint(1) NOT NULL DEFAULT 1',
    email_verified: 'tinyint(1) NOT NULL DEFAULT 0',
    last_login: 'datetime DEFAULT NULL'
  },
  customIndexes: [
    // Add indexes for your custom fields
    'UNIQUE KEY `username_UNIQUE` (`username`)',
    'KEY `is_active` (`is_active`)',
    'KEY `email_verified` (`email_verified`)',
    'KEY `last_login` (`last_login`)',
    'KEY `full_name` (`first_name`, `last_name`)'
  ]
}

// Create your extended user service
export class MyUserService extends ZUserService<MyCustomUser, MyUserCreateData> {
  
  constructor(sqlService: any) {
    super({ 
      sqlService, 
      tableConfig: customTableConfig 
    })
  }

  // Add custom methods specific to your application
  async findByUsername(username: string): Promise<MyCustomUser | undefined> {
    const selectColumns = this.getSelectColumns()
    const rows = await this.sqlService.query<MyCustomUser>(`
      SELECT ${selectColumns} FROM \`${this.tableName}\`
      WHERE username = ?
    `, [username])
    return rows[0]
  }

  async updateProfile(userId: number, updates: Partial<Pick<MyCustomUser, 'first_name' | 'last_name' | 'bio' | 'avatar_url'>>) {
    const updateFields = Object.keys(updates).map(key => `\`${key}\` = ?`).join(', ')
    const values = [...Object.values(updates), userId]
    
    return await this.sqlService.query(`
      UPDATE \`${this.tableName}\` 
      SET ${updateFields}, updated_at = NOW()
      WHERE user_id = ?
    `, values)
  }

  async updateLastLogin(userId: number) {
    return await this.sqlService.query(`
      UPDATE \`${this.tableName}\` 
      SET last_login = NOW(), updated_at = NOW()
      WHERE user_id = ?
    `, [userId])
  }

  async getActiveUsers(limit: number = 50): Promise<MyCustomUser[]> {
    const selectColumns = this.getSelectColumns()
    return await this.sqlService.query<MyCustomUser[]>(`
      SELECT ${selectColumns} FROM \`${this.tableName}\`
      WHERE is_active = 1
      ORDER BY last_login DESC
      LIMIT ?
    `, [limit])
  }
}

// Usage example
export async function exampleUsage() {
  const sqlService = {} // your SQL service instance
  const userService = new MyUserService(sqlService)

  // Ensure table exists with custom schema
  await userService.ensureTableExists()

  // Register a user with custom fields
  const { session } = await userService.register({
    email: 'john@example.com',
    pass: 'securepassword',
    role: 'user',
    admin: 0,
    username: 'johndoe',
    first_name: 'John',
    last_name: 'Doe',
    is_active: 1,
    email_verified: 0
  })

  // Find user with all custom fields populated
  const user = await userService.find({ email: 'john@example.com' })
  console.log(user?.username, user?.first_name, user?.last_name)

  // Use custom methods
  const userByUsername = await userService.findByUsername('johndoe')
  await userService.updateProfile(user!.user_id, {
    bio: 'Software developer',
    avatar_url: 'https://example.com/avatar.jpg'
  })
  await userService.updateLastLogin(user!.user_id)

  // Get active users
  const activeUsers = await userService.getActiveUsers()
}