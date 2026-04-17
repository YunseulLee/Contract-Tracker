// Edge runtime과 Node runtime 모두 호환되도록 Web Crypto API(globalThis.crypto.subtle)만 사용.
// Node 18+는 globalThis.crypto를 기본 제공하며, Edge runtime은 node:crypto를 지원하지 않음.

const enc = new TextEncoder();

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error('AUTH_SECRET 환경변수가 설정되지 않았습니다');
  return secret;
}

async function getKey(usage) {
  return globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(getSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usage
  );
}

// base64url (Edge/Node 모두 호환) — Uint8Array 수동 변환
function b64urlEncode(bytes) {
  let s = '';
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
  // btoa는 Edge/Node 18+ 전역에 존재
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// 상수 시간 비교 (Uint8Array)
function timingSafeEqualBytes(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export async function createAuthToken(ttlSeconds = 60 * 60 * 24 * 30) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  const payload = String(expiresAt);
  const key = await getKey(['sign']);
  const sig = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return `${expiresAt}.${b64urlEncode(sig)}`;
}

export async function verifyAuthToken(token) {
  if (!token || typeof token !== 'string') return false;
  const idx = token.indexOf('.');
  if (idx < 0) return false;
  const expiresAt = token.slice(0, idx);
  const sigB64 = token.slice(idx + 1);
  const exp = Number(expiresAt);
  if (!Number.isFinite(exp) || exp < Date.now()) return false;

  let sigBytes;
  try {
    sigBytes = b64urlDecode(sigB64);
  } catch {
    return false;
  }

  const key = await getKey(['sign', 'verify']);
  // subtle.verify를 사용해 상수 시간 비교
  try {
    const ok = await globalThis.crypto.subtle.verify(
      'HMAC', key, sigBytes, enc.encode(expiresAt)
    );
    if (ok) return true;
  } catch {
    // fallthrough to manual compare
  }

  // subtle.verify가 어떤 이유로든 실패할 경우 수동 비교로 폴백
  const expected = await globalThis.crypto.subtle.sign('HMAC', key, enc.encode(expiresAt));
  return timingSafeEqualBytes(new Uint8Array(expected), sigBytes);
}

// 하위 호환: 기존에 verifyAuthTokenEdge를 import하던 코드를 위해 별칭 유지
export const verifyAuthTokenEdge = verifyAuthToken;
