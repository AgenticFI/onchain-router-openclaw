import { lstatSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export interface AdapterConfig {
  readonly proxyOrigin: string;
  readonly tokenFile: string;
}

export function parseConfig(value: Record<string, unknown> | undefined): AdapterConfig {
  const configuredOrigin = value?.['proxyOrigin'] ?? 'http://127.0.0.1:8402';
  if (typeof configuredOrigin !== 'string') throw new Error('proxyOrigin must be a string');
  let url: URL;
  try {
    url = new URL(configuredOrigin);
  } catch {
    throw new Error('proxyOrigin is invalid');
  }
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    configuredOrigin.endsWith('/')
  )
    throw new Error('proxyOrigin must be a credential-free 127.0.0.1 HTTP origin');
  const configuredToken = value?.['tokenFile'];
  if (configuredToken !== undefined && typeof configuredToken !== 'string')
    throw new Error('tokenFile must be a string');
  const tokenFile = configuredToken ?? join(homedir(), '.onchain-router', 'proxy-token');
  const absolute = isAbsolute(tokenFile) ? resolve(tokenFile) : resolve(tokenFile);
  return { proxyOrigin: url.origin, tokenFile: absolute };
}

export function readProxyToken(path: string): string {
  const metadata = lstatSync(path);
  if (!metadata.isFile() || metadata.isSymbolicLink())
    throw new Error('proxy token must be a regular non-symlink file');
  if (typeof process.getuid === 'function' && metadata.uid !== process.getuid())
    throw new Error('proxy token must be owned by the current user');
  if ((metadata.mode & 0o077) !== 0) throw new Error('proxy token permissions must be 0600');
  if (metadata.size < 43 || metadata.size > 128) throw new Error('proxy token file size is invalid');
  const token = readFileSync(path, 'utf8').trim();
  if (!TOKEN.test(token)) throw new Error('proxy token is malformed');
  return token;
}
