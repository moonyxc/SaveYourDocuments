import _sodium from 'libsodium-wrappers';

let sodiumReady = false;

async function ensureInit(): Promise<void> {
  if (!sodiumReady) {
    await _sodium.ready;
    sodiumReady = true;
  }
}

export async function hashPassword(password: string): Promise<string> {
  await ensureInit();
  return _sodium.crypto_pwhash_str(
    password,
    _sodium.crypto_pwhash_OPSLIMIT_INTERACTIVE,
    _sodium.crypto_pwhash_MEMLIMIT_INTERACTIVE
  );
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  await ensureInit();
  return _sodium.crypto_pwhash_str_verify(hash, password);
}

export function generateRandomBytes(length: number): Buffer {
  return Buffer.from(_sodium.randombytes_buf(length));
}

export function secureWipe(buffer: Buffer): void {
  _sodium.sodium_memzero(buffer);
}