// Re-export from shared location — crypto utilities are used by auth, export, and storage
export {
  getAppEncryptKey,
  derivePasswordKey,
  exportKeyToJWK,
  importKeyFromJWK,
  encryptWithKey,
  decryptWithKey,
  encryptText,
  decryptText,
  formatEncryptedBackup,
  parseEncryptedBackup,
} from '@shared/crypto';
