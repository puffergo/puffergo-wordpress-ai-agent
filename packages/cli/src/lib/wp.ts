/**
 * Build a connected WpClient from the out-of-vault PufferGo credential store: resolves the WP
 * Application Password for the vault's site (see adapters/credentials.ts), then runs content-type
 * discovery so pushes route to the right REST base + taxonomy for ANY post type (post/page/product/…).
 * The password is read here and handed only to WpClient — it is never returned or logged.
 */

import { WpClient, type WpConnection } from '@puffergo/silo-core';
import { nodeNetwork } from '../adapters/nodeNetwork';
import { readWorkspace } from '../adapters/fileStore';
import { resolveCredential } from '../adapters/credentials';
import { NotLoggedInError } from './site';

export interface Connected {
  client: WpClient;
  conn: WpConnection;
  siteUrl: string;
}

export interface ConnectOptions {
  /** Explicit credentials file path (from --config / PUFFERGO_CONFIG). */
  configPath?: string;
  /** Act on this site even when the vault points elsewhere (--site). */
  site?: string;
}

export async function connect(dir: string, opts: ConnectOptions = {}): Promise<Connected> {
  // The vault's site URL (used to look up its credentials in a multi-site store).
  const ws = await readWorkspace(dir, opts.site);
  const siteUrl = ws?.profile?.url;

  const resolved = await resolveCredential(siteUrl, opts.configPath);
  // The same error the products and pages groups raise, so `not_logged_in` means one thing everywhere and the
  // Skill's answer is always the same: run `puffergo login <site>`.
  if (!resolved) throw new NotLoggedInError(siteUrl ?? '');
  const baseConn: WpConnection = {
    siteUrl: resolved.siteUrl,
    username: resolved.username,
    appPassword: resolved.appPassword,
  };
  // Discover the site's real content types so routing + taxonomy mirroring are data-driven.
  const probe = new WpClient(nodeNetwork, baseConn);
  const contentTypes = await probe.discoverContentTypes();
  const conn: WpConnection = { ...baseConn, contentTypes };

  return { client: new WpClient(nodeNetwork, conn), conn, siteUrl: resolved.siteUrl };
}
