import * as crypto from 'crypto'
import { HashStruct } from './typings'

const algorithm = 'aes-256-cbc'
const key = Buffer.from([
  253, 144, 73, 128, 71, 94, 34, 3, 28, 128, 194, 166, 132, 154, 14, 87, 221, 202, 92, 56, 139, 10, 38, 122, 120, 7,
  149, 40, 211, 218, 217, 3,
])
const iv = Buffer.from([0, 209, 223, 20, 147, 45, 14, 107, 93, 6, 76, 206, 176, 55, 245, 134])

export class ZCryptoService {

  public static encrypt(text: string): HashStruct {
    const cipher = crypto.createCipheriv(algorithm, key as crypto.CipherKey, iv as crypto.BinaryLike)
    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()] as Uint8Array[])
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') }
  }
 
  public static decrypt(data: HashStruct): string
  public static decrypt(encrypted: string): string
  public static decrypt(data: HashStruct | string): string {
    if (typeof data === 'string') {
      const encryptedText = Buffer.from(data, 'hex')
      const decipher = crypto.createDecipheriv(algorithm, key as crypto.CipherKey, iv as crypto.BinaryLike)
      let decrypted: Buffer = decipher.update(encryptedText as any)
      decrypted = Buffer.concat([decrypted, decipher.final()] as Uint8Array[])
      return decrypted.toString()
    }
    const niv = Buffer.from(data.iv, 'hex')
    const encryptedText = Buffer.from(data.encryptedData, 'hex')
    const decipher = crypto.createDecipheriv(algorithm, key as crypto.CipherKey, niv as crypto.BinaryLike)
    let decrypted: Buffer = decipher.update(encryptedText as any)
    decrypted = Buffer.concat([decrypted, decipher.final()] as Uint8Array[])
    return decrypted.toString()
  }

  public static decryptJSON(data: HashStruct) {
    try {
      const decrypted = ZCryptoService.decrypt(data)
      return JSON.parse(decrypted)
    } catch (err) {
      throw new Error(`Couldn't decrypt JSON ${JSON.stringify(data)}`)
    }
  }

  public static hash(hashAlgorithm: 'sha256'|'sha512'|'md5', data: string, opt?: { itt?: number } & ({saltMode: 'none'}|{saltMode: 'simple', salt: string})) {
    const itt = opt?.itt || 1
    let salt: string|undefined
    if (opt && opt.saltMode === 'simple') {
      salt = opt.salt
      data = data.split('').map((c, i) => c + salt.charAt(i % salt.length)).join('')
    }
    let hash = data
    for (let i = 0; i < itt; i++) {
      hash = crypto.createHash(hashAlgorithm).update(hash).digest('hex')
    }
    const cut = itt.toString().length + 1
    hash = `${itt}$${hash.substring(cut)}`
    return hash
  }
}
