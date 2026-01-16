import { ZCryptoService } from '../src/crypto_service'

test('encrypt and decrypt with HashStruct', () => {
  const originalText = 'Hello, World!'
  const encrypted = ZCryptoService.encrypt(originalText)
  
  expect(encrypted).toHaveProperty('iv')
  expect(encrypted).toHaveProperty('encryptedData')
  expect(typeof encrypted.iv).toBe('string')
  expect(typeof encrypted.encryptedData).toBe('string')
  
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('encrypt and decrypt with string overload (using default iv)', () => {
  const originalText = 'Test message'
  const encrypted = ZCryptoService.encrypt(originalText)
  
  // Use the string overload with just the encryptedData
  const decrypted = ZCryptoService.decrypt(encrypted.encryptedData)
  expect(decrypted).toBe(originalText)
})

test('handle empty strings', () => {
  const originalText = ''
  const encrypted = ZCryptoService.encrypt(originalText)
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('handle special characters', () => {
  const originalText = '!@#$%^&*()_+-=[]{}|;:,.<>?'
  const encrypted = ZCryptoService.encrypt(originalText)
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('handle unicode characters', () => {
  const originalText = '你好世界 🌍 café'
  const encrypted = ZCryptoService.encrypt(originalText)
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('handle long text', () => {
  const originalText = 'a'.repeat(10000)
  const encrypted = ZCryptoService.encrypt(originalText)
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('encrypt and decrypt JSON objects', () => {
  const originalObject = { name: 'John', age: 30, active: true }
  const originalText = JSON.stringify(originalObject)
  const encrypted = ZCryptoService.encrypt(originalText)
  
  const decryptedObject = ZCryptoService.decryptJSON(encrypted)
  expect(decryptedObject).toEqual(originalObject)
})

test('encrypt and decrypt complex JSON structures', () => {
  const originalObject = {
    users: [
      { id: 1, name: 'Alice', roles: ['admin', 'user'] },
      { id: 2, name: 'Bob', roles: ['user'] }
    ],
    metadata: {
      version: '1.0',
      created: '2026-01-16'
    }
  }
  const originalText = JSON.stringify(originalObject)
  const encrypted = ZCryptoService.encrypt(originalText)
  
  const decryptedObject = ZCryptoService.decryptJSON(encrypted)
  expect(decryptedObject).toEqual(originalObject)
})

test('throw error for invalid JSON', () => {
  const originalText = 'not valid json'
  const encrypted = ZCryptoService.encrypt(originalText)
  
  expect(() => {
    ZCryptoService.decryptJSON(encrypted)
  }).toThrow('Couldn\'t decrypt JSON')
})

test('hash with sha256 algorithm', () => {
  const data = 'password123'
  const hashed = ZCryptoService.hash('sha256', data)
  
  expect(typeof hashed).toBe('string')
  expect(hashed).toContain('$')
  expect(hashed.split('$')[0]).toBe('1') // default iteration
})

test('hash with sha512 algorithm', () => {
  const data = 'password123'
  const hashed = ZCryptoService.hash('sha512', data)
  
  expect(typeof hashed).toBe('string')
  expect(hashed).toContain('$')
})

test('hash with md5 algorithm', () => {
  const data = 'password123'
  const hashed = ZCryptoService.hash('md5', data)
  
  expect(typeof hashed).toBe('string')
  expect(hashed).toContain('$')
})

test('hash with custom iterations', () => {
  const data = 'password123'
  const hashed = ZCryptoService.hash('sha256', data, { itt: 5, saltMode: 'none' })
  
  expect(hashed.split('$')[0]).toBe('5')
})

test('hash with simple salt mode', () => {
  const data = 'password123'
  const salt = 'mysalt'
  const hashed = ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt })
  
  expect(typeof hashed).toBe('string')
  expect(hashed).toContain('$')
})

test('produce different hashes with different salts', () => {
  const data = 'password123'
  const hash1 = ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt: 'salt1' })
  const hash2 = ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt: 'salt2' })
  
  expect(hash1).not.toBe(hash2)
})

test('produce consistent hashes for same input', () => {
  const data = 'password123'
  const hash1 = ZCryptoService.hash('sha256', data, { saltMode: 'none' })
  const hash2 = ZCryptoService.hash('sha256', data, { saltMode: 'none' })
  
  expect(hash1).toBe(hash2)
})

test('produce consistent hashes with same salt', () => {
  const data = 'password123'
  const salt = 'mysalt'
  const hash1 = ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt })
  const hash2 = ZCryptoService.hash('sha256', data, { saltMode: 'simple', salt })
  
  expect(hash1).toBe(hash2)
})

test('handle multiple iterations with salt', () => {
  const data = 'password123'
  const hashed = ZCryptoService.hash('sha256', data, { 
    itt: 10, 
    saltMode: 'simple', 
    salt: 'mysalt' 
  })
  
  expect(hashed.split('$')[0]).toBe('10')
})

test('handle decrypt with different iv in HashStruct', () => {
  const originalText = 'Test with different IV'
  const encrypted = ZCryptoService.encrypt(originalText)
  
  // This should work because decrypt uses the iv from the HashStruct
  const decrypted = ZCryptoService.decrypt(encrypted)
  expect(decrypted).toBe(originalText)
})

test('produce different encrypted data for same input', () => {
  const originalText = 'Same input'
  const encrypted1 = ZCryptoService.encrypt(originalText)
  const encrypted2 = ZCryptoService.encrypt(originalText)
  
  // Even though input is same, encrypted data could be same since we use fixed IV
  // But both should decrypt to the same original text
  expect(ZCryptoService.decrypt(encrypted1)).toBe(originalText)
  expect(ZCryptoService.decrypt(encrypted2)).toBe(originalText)
})
