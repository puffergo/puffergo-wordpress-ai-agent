/**
 * Local filesystem persistence for the CLI host.
 *
 *  - `.silo/workspace.json` (in the vault) holds the SiloWorkspace (the planned keyword tree + content
 *    projections). Credentials do NOT live here — they are read from the out-of-vault PufferGo store
 *    (see adapters/credentials.ts) so the App Password never syncs/publishes with the notes.
 *
 * The workspace lives under a "vault dir" (defaults to cwd), so an AI agent working in a folder just
 * runs `silo <cmd>` there.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { SiloWorkspace } from '@puffergo/silo-core';

const WORKSPACE_FILE = join('.silo', 'workspace.json');

export const workspacePath = (dir: string): string => join(dir, WORKSPACE_FILE);

export async function readWorkspace(dir: string): Promise<SiloWorkspace | null> {
  const p = workspacePath(dir);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(await readFile(p, 'utf8')) as SiloWorkspace;
  } catch {
    return null;
  }
}

export async function writeWorkspace(dir: string, ws: SiloWorkspace): Promise<void> {
  const p = workspacePath(dir);
  await mkdir(dirname(p), { recursive: true });
  await writeFile(p, JSON.stringify(ws, null, 2), 'utf8');
}
