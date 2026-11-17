/**
 * `puffergo api <METHOD> <path>` — the escape hatch for anything the named commands don't cover yet.
 *
 * The whole point is the trust boundary: the AI names a REST path and sees the response, but NEVER sees
 * the Application Password. This module reads the credential through the same store as every other
 * command, builds the Basic header in-process, and only ever returns the response. There is no flag —
 * and deliberately no code path — that prints or exports the credential. Compare adapters/credentials.ts:
 * "the password is only ever read here and handed to WpClient/AgentClient; it is never printed."
 *
 * Three guardrails keep this from becoming the hole that undoes that boundary:
 *   1. path must be a /wp-json/ relative path (no absolute URL, protocol-relative, dot segments,
 *      backslash, whitespace or control chars) — so a prompt-injected AI can't exfiltrate the Basic
 *      header to an attacker's host by naming a foreign URL.
 *   2. writes (POST/PUT/PATCH/DELETE) need --yes true — a read-only escape hatch by default.
 *   3. the response is scrubbed of credential-shaped fields before it reaches the AI, in case an
 *      endpoint echoes a password back.
 */

import type { CmdCtx } from './siteCmd';
import { resolveCredential, listCredentialSites } from '../adapters/credentials';
import { nodeNetwork } from '../adapters/nodeNetwork';

export const API_USAGE =
  "puffergo api <GET|POST|PUT|PATCH|DELETE> </wp-json/...> [--body '<json>'] [--yes true] [--site <url>]";

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
/** Keys whose VALUES are secret. A test endpoint that echoes these back must not leak them to the AI. */
const SECRET_KEYS = new Set([
  'apppassword',
  'application_password',
  'password',
  'passwd',
  'authorization',
  'authheader',
  'access_token',
  'refresh_token',
  'client_secret',
  'secret',
]);
const REDACTED = '[redacted]';

export interface ApiResult {
  ok: boolean;
  code?: string;
  message?: string;
  siteUrl?: string;
  status?: number;
  body?: unknown;
  /** Set when the response was scrubbed, so the AI knows a field was hidden rather than missing. */
  redacted?: boolean;
}

/** Guardrail 1: only a clean /wp-json/ relative path is allowed. Returns an error string, or null. */
export function validatePath(input: string | undefined): string | null {
  if (!input) return '缺少路径。用法：' + API_USAGE;
  if (!/^\/wp-json\//.test(input)) return '路径必须以 /wp-json/ 开头（不能是完整网址或其他路径）';
  if (/[\\\s\u0000-\u001f\u007f]/.test(input)) return '路径含空白、控制字符或反斜杠，已拒绝';
  if (/(^|\/)\.\.(\/|$)/.test(input)) return '路径含 .. 跳转段，已拒绝';
  if (input.includes('//')) return '路径含 // 双斜杠，已拒绝';
  if (input.includes('?') && !/^\/wp-json\/[^?]*\?[^?#]*$/.test(input)) return '查询串格式不合法';
  if (input.includes('#')) return '路径含 # 片段，已拒绝';
  return null;
}

/** Guardrail 1 (method): uppercase whitelist only. */
export function validateMethod(input: string | undefined): string | null {
  if (!input || !METHODS.has(input.toUpperCase())) return '方法必须是 GET / POST / PUT / PATCH / DELETE';
  return null;
}

/** Guardrail 3: recursively scrub secret-shaped keys from a response body. */
export function scrubBody(value: unknown, seen = new WeakSet<object>()): { value: unknown; redacted: boolean } {
  let hit = false;
  const walk = (v: unknown): unknown => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v as object)) return v; // cycle guard — JSON from fetch can't cycle, but be safe
    seen.add(v as object);
    if (Array.isArray(v)) return v.map(walk);
    const out: Record<string, unknown> = {};
    for (const [k, child] of Object.entries(v as Record<string, unknown>)) {
      if (SECRET_KEYS.has(k.toLowerCase()) && child !== undefined) {
        out[k] = REDACTED;
        hit = true;
      } else {
        out[k] = walk(child);
      }
    }
    return out;
  };
  return { value: walk(value), redacted: hit };
}

/** Build the request body: --body is a JSON string, optional on reads, allowed on writes. */
function parseBody(raw: string | undefined): { body?: unknown; error?: string } {
  if (raw === undefined) return {};
  try {
    return { body: JSON.parse(raw) };
  } catch (e) {
    return { error: `--body 不是合法 JSON：${e instanceof Error ? e.message : String(e)}` };
  }
}

/**
 * The command. Credentials stay in-process; only the response is returned.
 * `configPath` is the caller's already-resolved `--config` / `PUFFERGO_CONFIG` value (index.ts owns that
 * rule so every command agrees). Passing it straight to resolveCredential is what makes an EXISTING
 * credential store keep working after a Skill update — the store format, its location and the
 * resolution order are untouched by this command; only the read path is shared.
 */
export async function cmdApi(ctx: CmdCtx, configPath?: string): Promise<ApiResult> {
  const method = ctx.positional[0]?.toUpperCase();
  const path = ctx.positional[1];

  const methodErr = validateMethod(method);
  if (methodErr) return { ok: false, code: 'usage', message: methodErr };
  if (!path) return { ok: false, code: 'usage', message: '缺少路径。用法：' + API_USAGE };

  const pathErr = validatePath(path);
  if (pathErr) return { ok: false, code: 'bad_path', message: pathErr };

  // Guardrail 2: writes need an explicit --yes true. No site allowlist needed — resolveCredential below
  // only ever returns a site THIS machine is logged into, so every call is already on-logged-sites only.
  if (WRITE_METHODS.has(method!) && ctx.flags.get('yes') !== 'true')
    return {
      ok: false,
      code: 'confirm_required',
      message: `${method} 是写操作，会改动站点。确认要执行就加 --yes true；只是查询请用 GET。`,
    };

  const parsed = parseBody(ctx.flags.get('body'));
  if (parsed.error) return { ok: false, code: 'bad_body', message: parsed.error };

  // Same rule as every other command: --config wins, then PUFFERGO_CONFIG, then the global store.
  const cred = await resolveCredential(ctx.flags.get('site'), configPath);
  if (!cred) {
    const sites = await listCredentialSites(configPath);
    // Two very different situations, and telling them apart matters for existing customers: an empty
    // store means "never logged in", while a non-empty one means "already logged in, just say which".
    // Reporting the latter as not-logged-in would send someone off to re-authenticate credentials they
    // already have — and is exactly the kind of false alarm that makes people think an update lost their login.
    if (!sites.length)
      return {
        ok: false,
        code: 'not_logged_in',
        message: '还没有登录任何站点（先 puffergo login）',
      };
    const wanted = ctx.flags.get('site');
    return {
      ok: false,
      code: 'no_site',
      message: wanted
        ? `这台机器没有登录「${wanted}」。已登录：${sites.join('、')}。把 --site 换成其中之一再试。`
        : `已登录 ${sites.length} 个站点，需要指定用哪个：${sites.join('、')}。加 --site <站点> 再试。`,
    };
  }

  const base = cred.siteUrl.replace(/\/+$/, '');
  const url = base + path;
  const headers: Record<string, string> = {
    // Built here, in-process, from the credential — never returned, never logged.
    Authorization: `Basic ${Buffer.from(`${cred.username}:${cred.appPassword}`).toString('base64')}`,
  };
  if (parsed.body !== undefined) headers['Content-Type'] = 'application/json';

  // Same transport as every other command (nodeNetwork → global fetch). Reusing it instead of calling
  // fetch directly keeps failure handling identical: a dead host or an ancient Node without fetch comes
  // back as status 0 rather than an unhandled rejection the caller has to interpret.
  const res = await nodeNetwork.request({
    method: method as 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    url,
    headers,
    body: parsed.body,
  });

  if (res.status === 0) {
    const detail = (res.json as { message?: string } | undefined)?.message ?? res.text ?? '';
    return {
      ok: false,
      code: 'network_error',
      message: /fetch is not defined/i.test(detail)
        ? '这台机器的 Node 版本太旧（需要 18 或更高），请升级 Node 后再试'
        : detail || '请求没发出去',
      siteUrl: cred.siteUrl,
    };
  }

  const scrubbed = scrubBody(res.json);
  const ok = res.status >= 200 && res.status < 300;
  return {
    ok,
    ...(ok ? {} : { code: `http_${res.status}` }),
    siteUrl: cred.siteUrl,
    status: res.status,
    body: scrubbed.value,
    ...(scrubbed.redacted ? { redacted: true } : {}),
  };
}
