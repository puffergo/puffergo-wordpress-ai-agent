/**
 * What every `puffergo` command that talks to a site shares, whatever it writes (products, pages…):
 * the command context, connecting to the site, turning site problems into command output, and the
 * "published content is left alone unless edit-live is on" rule.
 */

import { AgentClient, AgentHttpError } from './agentClient';
import {
  resolveSite,
  NoSiteError,
  NotLoggedInError,
  editLiveAllowed,
  readWorkdirConfig,
  writeWorkdirConfig,
} from './site';
import { loadSiteSchema, PluginOutdatedError, SchemaVersionError } from './siteSchema';

export interface CmdCtx {
  dir: string;
  flags: Map<string, string>;
  positional: string[];
}

/** The site this command works on, checked to speak the plugin version this CLI understands. */
export async function client(ctx: CmdCtx): Promise<AgentClient> {
  const cred = await resolveSite(ctx.dir, ctx.flags.get('site'));
  const c = new AgentClient(cred.config);
  await loadSiteSchema(c); // refuses a plugin newer (update_skill) or older (update_plugin) than this CLI
  return c;
}

export function siteErrorOutput(
  e: unknown,
): { ok: false; code: string; sites?: string[]; fix?: string; message?: string } | null {
  if (e instanceof NoSiteError) return { ok: false, code: 'no_site', sites: e.sites };
  if (e instanceof NotLoggedInError) return { ok: false, code: 'not_logged_in' };
  if (e instanceof SchemaVersionError) return { ok: false, code: 'update_skill', fix: 'user', message: e.message };
  if (e instanceof PluginOutdatedError) return { ok: false, code: 'update_plugin', fix: 'user', message: e.message };
  return null;
}

/** A WP_Error from an ability, as it arrives (`{code, message, data: {status, errors?, fix?}}`), as command output. */
export function abilityError(e: AgentHttpError): Record<string, unknown> & { ok: false } {
  const body = (e.body ?? {}) as { code?: string; message?: string; data?: { errors?: unknown; fix?: string } };
  return {
    ok: false,
    code: body.code ?? `http_${e.status}`,
    message: body.message ?? `HTTP ${e.status}`,
    ...(body.data?.errors ? { errors: body.data.errors } : {}),
    fix: body.data?.fix ?? (e.status === 400 ? 'ai' : undefined),
  };
}

// ---------------------------------------------------------------------------
// One error path for every command that talks to a site
// ---------------------------------------------------------------------------

/** What a command prints: `ok` plus whatever that command has to say. */
export type Out = Record<string, unknown> & { ok: boolean };

/** The command was called wrong (the message is the usage line). */
export class UsageError extends Error {}

/** Anything a command refuses with a code the AI reads: a file that isn't there, a target it can't resolve… */
export class CodedError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly fix?: 'ai' | 'user',
  ) {
    super(message);
  }
}

/**
 * Runs a command body against the site and turns anything it throws into output, so every command
 * answers with the same shape instead of each writing its own catch. `connect` is the caller's own
 * import of `client`, so a test that stubs connecting still sees its stub used.
 */
export async function runWith(
  connect: (ctx: CmdCtx) => Promise<AgentClient>,
  ctx: CmdCtx,
  body: (c: AgentClient) => Promise<Out>,
): Promise<Out> {
  try {
    return await body(await connect(ctx));
  } catch (e) {
    return errorOutput(e);
  }
}

/** The same mapping for a body that doesn't need the site (or holds the client itself). */
export function errorOutput(e: unknown): Out {
  const siteErr = siteErrorOutput(e);
  if (siteErr) return siteErr;
  if (e instanceof UsageError) return { ok: false, code: 'usage', message: e.message };
  if (e instanceof CodedError) return { ok: false, code: e.code, fix: e.fix ?? 'ai', message: e.message };
  if (e instanceof AgentHttpError) return abilityError(e);
  return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
}

/** Published or scheduled: visitors see it (or will), so it is changed only with the customer's go-ahead. */
export function isLive(status: unknown): boolean {
  return status === 'publish' || status === 'future';
}

/** Words that ask to make something public. "push" / "推" / "上传" / "更新" are not among them: those mean a draft. */
export const PUBLISH_INTENT = /发布|上线|公开|publish|go live|make (it|them|.+) live|put (it|them|.+) live/i;

/** The customer's own words passed with --customer-said: their go-ahead to change live content in this one run. */
export function customerSaid(ctx: CmdCtx): string | undefined {
  return ctx.flags.get('customer-said')?.trim() || undefined;
}

/**
 * Publishing makes something public, so it needs the customer's own words asking for it — "push" / "推" /
 * "上传" / "更新" only ever mean a draft. Checked in code because models misread "直接推" as publish.
 * Returns the refusal to print, or null when the customer did ask.
 */
export function publishRefusal(ctx: CmdCtx, kind: 'product' | 'page'): Out | null {
  if (PUBLISH_INTENT.test(customerSaid(ctx) ?? '')) return null;
  return {
    ok: false,
    code: 'needs_publish_request',
    fix: 'user',
    message: `Publishing makes this ${kind} public. Only publish when the customer explicitly asked to publish (发布/上线/publish) — "改"/"推"/"上传"/"更新" do not. Ask the customer; if they say to publish, pass their exact words with --customer-said.`,
  };
}

/** The site refused the write because the post changed since it was read; `reread` is the command to run again. */
export function conflictOutput(e: unknown, reread: string): Out | null {
  const conflict = e instanceof AgentHttpError && (e.body as { code?: string } | undefined)?.code === 'conflict';
  if (!conflict) return null;
  return {
    ok: false,
    code: 'conflict',
    fix: 'ai',
    message: `It changed on the site since you read it (maybe edited in wp-admin). Run \`${reread}\` again and redo the change on the fresh version.`,
  };
}

/** Why a live item was left unchanged, and how to change it once the customer agrees. */
export function liveLockedMessage(kind: 'product' | 'page', group: 'products' | 'pages'): string {
  const show =
    kind === 'page'
      ? 'Show the customer the preview (for SEO, the current and new values)'
      : 'Show the customer the change';
  return `This ${kind} is published, so it was left unchanged. ${show}; once they agree, run the same command again with --customer-said "<their exact words>". To change many live ${group} in a row, use \`${group} edit-live on --customer-said "…"\` and \`edit-live off\` when done.`;
}

// ---------------------------------------------------------------------------
// edit-live [on --customer-said "…" | off] — may push/replace change live products, pages and existing categories?
// ---------------------------------------------------------------------------

export async function cmdEditLive(ctx: CmdCtx): Promise<unknown> {
  const sub = ctx.positional[0];
  try {
    const cred = await resolveSite(ctx.dir, ctx.flags.get('site'));
    const siteUrl = cred.config.siteUrl;
    const cfg = (await readWorkdirConfig(ctx.dir)) ?? { siteUrl };
    if (cfg.siteUrl !== siteUrl)
      return { ok: false, code: 'other_site', message: `This work folder is for ${cfg.siteUrl}.` };
    if (sub === 'on') {
      const said = (ctx.flags.get('customer-said') ?? '').trim();
      if (!said)
        return {
          ok: false,
          code: 'needs_customer_request',
          fix: 'user',
          message:
            'Turn this on only when the customer asks to change published products, pages or posts, or existing categories. Pass their exact words with --customer-said.',
        };
      await writeWorkdirConfig(ctx.dir, {
        siteUrl,
        editLive: { on: true, customerSaid: said, at: new Date().toISOString() },
      });
      return {
        ok: true,
        editLive: true,
        note: 'products push and pages replace now change live pages directly. Turn it off with `edit-live off` when done.',
      };
    }
    if (sub === 'off') {
      await writeWorkdirConfig(ctx.dir, { siteUrl, editLive: undefined });
      return { ok: true, editLive: false };
    }
    if (sub === undefined) return { ok: true, editLive: await editLiveAllowed(ctx.dir, siteUrl) };
    return {
      ok: false,
      code: 'usage',
      message: 'usage: puffergo <products|pages> edit-live [on --customer-said "…" | off]',
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
