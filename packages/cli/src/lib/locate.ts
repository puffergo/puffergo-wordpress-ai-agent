/**
 * Where things are on *this* machine, without assuming which AI host is running us.
 *
 * Two questions the Skills and the CLI both need answered, and both used to be answered with a hard-coded
 * host name:
 *
 * 1. **Where does this script live?** The Skills live in whatever directory the host keeps Skills in —
 *    `~/.workbuddy/skills`, `~/.codex/skills`, `~/.dsh/skills`, a plugin cache, a git checkout. SKILL.md
 *    cannot know that path, so it tells the model to ask the script: `puffergo whereami`.
 *
 * 2. **Where will the customer actually look?** The login card has to land somewhere he will find it.
 *    "Desktop" is right on macOS and most Windows installs, missing on servers, and in Chinese Windows it
 *    is named `桌面` or redirected into OneDrive. Resolve it instead of assuming `~/Desktop`.
 *
 * Nothing here knows about a specific host, and nothing writes a host name into a file.
 */
import { statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Absolute path of the running CLI script (resolves symlinks, follows the bundle's own location). */
export function scriptPath(): string {
  return resolve(fileURLToPath(import.meta.url));
}

/** Directory holding this script — for the bundle, the `scripts/` folder inside a Skill. */
export function scriptDir(): string {
  return dirname(scriptPath());
}

/**
 * Candidate folders a customer would look in for a file we just wrote, most familiar first.
 *
 * `Desktop` is the default on every OS we support; the localized and OneDrive-redirected spellings are
 * what a Chinese Windows box actually shows. Only existing directories are returned, so callers can take
 * the first and stop.
 */
export function customerVisibleDirs(): string[] {
  const home = homedir();
  const candidates = [
    join(home, 'Desktop'),
    join(home, '桌面'),
    join(home, 'OneDrive', 'Desktop'),
    join(home, 'OneDrive', '桌面'),
    join(home, 'Downloads'),
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const key = c.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      if (statSync(c).isDirectory()) out.push(c);
    } catch {
      // missing or unreadable: not a place the customer is looking in
    }
  }
  return out;
}

/** Best place to leave a file the customer must open by hand; falls back to the home directory. */
export function customerVisibleDir(): { dir: string; note?: string } {
  const first = customerVisibleDirs()[0];
  if (first) return { dir: first };
  return { dir: homedir(), note: 'no desktop or downloads folder here, wrote it to the home directory instead' };
}