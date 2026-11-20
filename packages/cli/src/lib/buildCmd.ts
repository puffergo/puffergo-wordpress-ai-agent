/**
 * `puffergo build …` — run a full AI site build on the server, headlessly.
 *
 * Same server-side build API the web wizard uses (`/builds` on the site, through the plugin).
 * The plugin proxy injects the site profile / theme context from WordPress, so the CLI never
 * has to reconstruct them — exactly the same generation the Web "Fast" / "Custom" flows produce.
 */
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { client, siteErrorOutput, abilityError, type CmdCtx } from './siteCmd';
import { AgentHttpError } from './agentClient';

export const BUILD_USAGE =
  'puffergo build <fast|plan <file.json>|status <buildId>|retry <buildId>> [--dir <workdir>] [--site <url>] [--wait <seconds>] [--json <file>]';

type Out = Record<string, unknown> & { ok: boolean };

const TERMINAL = new Set(['READY', 'PARTIAL', 'FAILED']);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function waitForBuild(
  c: Awaited<ReturnType<typeof client>>,
  buildId: string,
  waitSeconds: number,
): Promise<Record<string, any>> {
  const deadline = Date.now() + waitSeconds * 1000;
  let last: Record<string, any> = {};
  while (true) {
    last = await c.getBuild(buildId);
    if (TERMINAL.has(String(last.status))) return last;
    if (Date.now() >= deadline) return { ...last, timedOut: true };
    await sleep(5000);
  }
}

export async function cmdBuild(ctx: CmdCtx): Promise<Out> {
  const sub = ctx.positional[0] || '';
  // help / 空参数不值得连站点：先给用法，避免没登录时报 no_site 掩盖了真正原因
  if (!sub || sub === 'help' || sub === '--help' || sub === '-h') {
    return { ok: false, code: 'usage', message: BUILD_USAGE };
  }
  try {
    const c = await client(ctx);

    if (sub === 'status') {
      const id = ctx.positional[1];
      if (!id) return { ok: false, code: 'usage', message: BUILD_USAGE };
      return { ok: true, ...(await c.getBuild(id)) };
    }
    if (sub === 'retry') {
      const id = ctx.positional[1];
      if (!id) return { ok: false, code: 'usage', message: BUILD_USAGE };
      const r = await c.retryBuild(id);
      const wait = Number(ctx.flags.get('wait') ?? 0);
      const snapshot = wait > 0 ? await waitForBuild(c, id, wait) : r;
      return { ok: true, ...snapshot };
    }

    let mode: 'fast' | 'stepwise';
    let plan: unknown;
    if (sub === 'fast') {
      mode = 'fast';
    } else if (sub === 'plan') {
      const file = ctx.positional[1];
      if (!file) return { ok: false, code: 'usage', message: BUILD_USAGE };
      const text = await readFile(resolve(ctx.dir, file), 'utf8');
      plan = JSON.parse(text);
      if (!Array.isArray((plan as any)?.pages) || (plan as any).pages.length === 0) {
        return { ok: false, code: 'bad_plan', message: 'plan 文件需要非空 pages[]' };
      }
      mode = 'stepwise';
    } else {
      return { ok: false, code: 'usage', message: BUILD_USAGE };
    }

    const body: Record<string, unknown> = { mode, context: {} };
    if (plan) body.plan = plan;
    const created = await c.createBuild(body);
    if (!created?.success || !created.buildId) {
      return { ok: false, code: 'create_failed', message: created?.message || 'build create failed' };
    }
    const wait = Number(ctx.flags.get('wait') ?? 0);
    if (wait <= 0) {
      return { ok: true, buildId: created.buildId, totalSections: created.totalSections, status: 'QUEUED' };
    }
    const snapshot = await waitForBuild(c, created.buildId, wait);
    const failed = Number(snapshot.failedSections ?? 0);
    return { ...snapshot, ok: failed === 0 && !snapshot.timedOut };
  } catch (e) {
    const site = siteErrorOutput(e);
    if (site) return site;
    if (e instanceof AgentHttpError) return { ...abilityError(e), ok: false };
    return { ok: false, code: 'build_error', message: e instanceof Error ? e.message : String(e) };
  }
}
