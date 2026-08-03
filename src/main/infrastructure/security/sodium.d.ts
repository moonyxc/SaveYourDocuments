declare module 'libsodium-wrappers' {
  const _sodium: {
    ready: Promise<void>;
    crypto_pwhash_str(password: string, opsLimit: number, memLimit: number): string;
    crypto_pwhash_str_verify(hash: string, password: string): boolean;
    crypto_pwhash_OPSLIMIT_INTERACTIVE: number;
    crypto_pwhash_MEMLIMIT_INTERACTIVE: number;
    randombytes_buf(length: number): Uint8Array;
    sodium_memzero(buffer: Uint8Array): void;
  };
  export default _sodium;
}