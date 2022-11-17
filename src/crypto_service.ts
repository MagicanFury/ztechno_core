import * as crypto from 'crypto'

const algorithm = 'aes-256-cbc'
const key = Buffer.from([
  253, 144, 73, 128, 71, 94, 34, 3, 28, 128, 194, 166, 132, 154, 14, 87, 221, 202, 92, 56, 139, 10, 38, 122, 120, 7,
  149, 40, 211, 218, 217, 3,
])
const iv = Buffer.from([0, 209, 223, 20, 147, 45, 14, 107, 93, 6, 76, 206, 176, 55, 245, 134])

type HashStruct = {
  iv: string;
  encryptedData: string;
}

export class ZCryptoService {
  public static encrypt(text: string): HashStruct {
    const cipher = crypto.createCipheriv(algorithm, Buffer.from(key), iv)
    let encrypted = cipher.update(text)
    encrypted = Buffer.concat([encrypted, cipher.final()])
    return { iv: iv.toString('hex'), encryptedData: encrypted.toString('hex') }
  }

  public static decrypt(data: HashStruct) {
    const niv = Buffer.from(data.iv, 'hex')
    const encryptedText = Buffer.from(data.encryptedData, 'hex')
    const decipher = crypto.createDecipheriv(algorithm, Buffer.from(key), niv)
    let decrypted = decipher.update(encryptedText)
    decrypted = Buffer.concat([decrypted, decipher.final()])
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
}
