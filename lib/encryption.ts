
// lib/encryption.ts

export async function generateKeyPair(): Promise<CryptoKeyPair> {
  return window.crypto.subtle.generateKey(
    {
      name: "ECDH",
      namedCurve: "P-384",
    },
    true,
    ["deriveKey", "deriveBits"]
  );
}

export async function generateSymKey(): Promise<CryptoKey> {
  return window.crypto.subtle.generateKey(
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function exportKey(key: CryptoKey): Promise<JsonWebKey> {
  return window.crypto.subtle.exportKey("jwk", key);
}

export async function importKey(jwk: JsonWebKey, type: "ECDH" | "AES-GCM" = "ECDH"): Promise<CryptoKey> {
  return window.crypto.subtle.importKey(
    "jwk",
    jwk,
    type === "ECDH"
      ? {
          name: "ECDH",
          namedCurve: "P-384",
        }
      : {
          name: "AES-GCM",
          length: 256,
        },
    true,
    type === "ECDH" ? [] : ["encrypt", "decrypt"]
  );
}

export async function deriveSharedKey(
  privateKey: CryptoKey,
  publicKey: CryptoKey
): Promise<CryptoKey> {
  return window.crypto.subtle.deriveKey(
    {
      name: "ECDH",
      public: publicKey,
    },
    privateKey,
    {
      name: "AES-GCM",
      length: 256,
    },
    true,
    ["encrypt", "decrypt"]
  );
}

export async function encryptMessage(
  text: string,
  key: CryptoKey
): Promise<{ iv: number[]; data: number[] }> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(text);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  
  const encrypted = await window.crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    encoded
  );

  return {
    iv: Array.from(iv),
    data: Array.from(new Uint8Array(encrypted)),
  };
}

export async function decryptMessage(
  encryptedData: { iv: number[]; data: number[] },
  key: CryptoKey
): Promise<string> {
  const iv = new Uint8Array(encryptedData.iv);
  const data = new Uint8Array(encryptedData.data);

  const decrypted = await window.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: iv,
    },
    key,
    data
  );

  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

export async function encryptKey(
  keyToEncrypt: CryptoKey,
  wrappingKey: CryptoKey
): Promise<{ iv: number[]; data: number[] }> {
  const exported = await exportKey(keyToEncrypt);
  const json = JSON.stringify(exported);
  return encryptMessage(json, wrappingKey);
}

export async function decryptKey(
  encryptedKeyData: { iv: number[]; data: number[] },
  wrappingKey: CryptoKey
): Promise<CryptoKey> {
  const json = await decryptMessage(encryptedKeyData, wrappingKey);
  const jwk = JSON.parse(json);
  return importKey(jwk, "AES-GCM");
}
