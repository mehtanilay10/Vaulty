/**
 * Safe accessor for Web Crypto API across browser and SSR/Node.js runtimes.
 */
export function getWebCrypto(): Crypto {
  if (typeof window !== "undefined" && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== "undefined" && globalThis.crypto) {
    return globalThis.crypto as Crypto;
  }
  throw new Error("Web Crypto API is not available in the current environment.");
}
