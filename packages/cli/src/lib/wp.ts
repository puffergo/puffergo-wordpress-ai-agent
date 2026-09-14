/**
 * Build a connected WpClient from the out-of-vault PufferGo credential store: resolves the WP
 * Application Password for the vault's site (see adapters/credentials.ts), then runs content-type
 * discovery so pushes route to the right REST base + taxonomy for ANY post type (post/page/product/…).
 * The password is read here and handed only to WpClient — it is never returned or logged.
 */

import { WpClient, type WpConnection } from '@puffergo/silo-core';
import { nodeNetwork } from '../adapters/nodeNetwork';
import { readWorkspace } from '../adapters/fileStore';
import { resolveCredential, GLOBAL_CREDENTIALS } from '../adapters/credentials';

export interface Connected {
  client: WpClient;
  conn: WpConnection;
  siteUrl: string;
  /** Set when credentials were still found in the deprecated in-vault silo.config.json. */
  legacyWarning?: string;
}

export interface ConnectOptions {
  /** Explicit credentials file path (from --config / PUFFERGO_CONFIG). */
  configPath?: string;
}

export async function connect(dir: string, opts: ConnectOptions = {}): Promise<Connected> {
  // The vault's site URL (used to look up its credentials in a multi-site store).
  const ws = await readWorkspace(dir);
  const siteUrl = ws?.profile?.url;

  const resolved = await resolveCredential(dir, siteUrl, opts.configPath);
  if (!resolved) {
    throw new Error(
      `未找到凭据。请在 ${GLOBAL_CREDENTIALS} 配置站点账号（或用 --config 指定文件）。` +
        (siteUrl ? ` 站点：${siteUrl}` : ''),
    );
  }
  const { config } = resolved;
  const baseConn: WpConnection = {
    siteUrl: config.siteUrl,
    username: config.username,
    appPassword: config.appPassword,
  };
  // Discover the site's real content types so routing + taxonomy mirroring are data-driven.
  const probe = new WpClient(nodeNetwork, baseConn);
  const contentTypes = await probe.discoverContentTypes();
  const conn: WpConnection = { ...baseConn, contentTypes };

  const legacyWarning =
    resolved.source === 'legacy-vault'
      ? '凭据仍在 vault 内的 silo.config.json（会随笔记同步/发布外泄）。运行 `silo migrate-config` 迁到 ~/.puffergo/。'
      : undefined;

  return { client: new WpClient(nodeNetwork, conn), conn, siteUrl: config.siteUrl, legacyWarning };
}
