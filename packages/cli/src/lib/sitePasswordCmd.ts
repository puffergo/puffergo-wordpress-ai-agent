/**
 * `puffergo site password` — mint the WordPress admin password and put it on the customer's desktop in
 * the same step, *before* the site exists.
 *
 * Why this command exists (field feedback, 2026-11-18): the deploy flow used to tell the model "the
 * hosting provider generates the password and emails it to the customer", and then told the customer to
 * walk through hPanel → Websites → Dashboard → WP Admin to get in without a password. Both halves were
 * wrong. `hosting_websites_create` requires `wordpress.admin.password` as a caller-supplied field — there
 * is no "provider generates it" path and no API to read it back afterwards. So the password only ever
 * exists in the model's hands, and if it is not written down at that moment it is gone: the customer is
 * then stuck outside their own site, which is exactly how the fifteen-round hPanel detour happened.
 *
 * The fix is to make minting and persisting one atomic action instead of a paragraph of instructions the
 * model might skip. The command prints the credentials (the model has to submit them to the hosting API)
 * and writes a plain-text card the customer can open himself.
 *
 * Failure policy: a file we cannot write must never block the build. If the desktop is not writable the
 * credentials are still printed, `file` comes back null and `warning` says where it tried — the model then
 * tells the customer the password in-chat rather than pretending a file exists.
 */

import { randomInt } from 'node:crypto';
import { chmod, mkdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { CmdCtx, Out } from './siteCmd';

/** Character classes with the look-alikes removed — the customer may end up typing this by hand. */
const LOWER = 'abcdefghijkmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const DIGIT = '23456789';
const SYMBOL = '@#%*-_=+';
const ALL = LOWER + UPPER + DIGIT + SYMBOL;

/** Hostinger accepts 8–50 characters; 20 mixed-class characters clears "not a known-compromised one". */
const LENGTH = 20;

export const SITE_PASSWORD_USAGE = `puffergo site password --domain <domain> [--email <address>] [--user <name>] [--out <dir>]

Mints the WordPress admin password and writes a login card to this computer, so the customer has the
credentials in hand before the site exists. Prints JSON; pass \`credentials\` straight to the hosting
create call (wordpress.admin.user / .password / .email).

  --domain   site address; protocol optional (used for the login URL and the file name)
  --email    admin email — also recorded on the card, so "forgot password" lands somewhere real
  --user     admin username (default: derived from the domain, letters/digits/underscore only)
  --out      where to write the card (default: ~/Desktop, falling back to the home directory)
`;

function pick(set: string): string {
  return set[randomInt(set.length)] as string;
}

/** At least one of each class, then shuffled so the guaranteed ones are not always in front. */
export function generatePassword(length: number = LENGTH): string {
  const chars: string[] = [pick(LOWER), pick(UPPER), pick(DIGIT), pick(SYMBOL)];
  while (chars.length < length) chars.push(pick(ALL));
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    const a = chars[i] as string;
    chars[i] = chars[j] as string;
    chars[j] = a;
  }
  return chars.join('');
}

/** `https://www.example.co.uk/x` → `example.co.uk` — the bare host, no protocol, no www. */
function bareHost(input: string): string {
  return input
    .trim()
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#].*$/, '')
    .toLowerCase();
}

/** Hostinger wants letters, digits and underscores for the admin user. */
function deriveUser(host: string): string {
  const base = host.replace(/[^a-z0-9]/gi, '_').replace(/^_+|_+$/g, '') || 'site_owner';
  return base.slice(0, 20).replace(/^([0-9])/, 'u$1');
}

function stamp(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function card(opts: { host: string; url: string; user: string; email: string; password: string; now: Date }): string {
  const { host, url, user, email, password, now } = opts;
  return [
    `${host} 的网站后台登录信息`,
    `生成时间：${stamp(now)}`,
    '',
    `网站地址：${url}`,
    `后台地址：${url}/wp-admin`,
    `用户名：${user}`,
    `密码：${password}`,
    '',
    '怎么用：',
    `1. 浏览器打开上面的「后台地址」，输入用户名和密码登录。`,
    '   登录时**勾上 Remember Me（记住我）**，以后打开授权页就不用再登录了。',
    '2. 如果 AI 发来的授权链接打开后是 WordPress 登录页——**这是正常流程，不是出错**。用这里的账号密码登录，登录后点 Approve / 批准即可。',
    '3. 第一次登录后，建议改成你自己好记的密码；改完把这里也更新一下。',
    `4. 忘了密码就点登录页的「忘记密码」，重置邮件会发到 ${email}。`,
    '',
    '重要：',
    '- 这个文件在你自己电脑上，不要发给别人，也不要发回给 AI。',
    '- 想收回 AI 的改动权限，在后台「用户 → 个人资料 → 应用程序密码」里删掉那一条。',
    '',
  ].join('\n');
}

async function isDir(p: string): Promise<boolean> {
  try {
    return (await stat(p)).isDirectory();
  } catch {
    return false;
  }
}

/** Desktop first (that is where the customer will actually look), home directory as the fallback. */
async function resolveOutDir(flag: string | undefined): Promise<{ dir: string; note?: string }> {
  if (flag) {
    await mkdir(flag, { recursive: true });
    return { dir: flag };
  }
  const desktop = join(homedir(), 'Desktop');
  if (await isDir(desktop)) return { dir: desktop };
  return { dir: homedir(), note: 'no Desktop here, wrote it to the home directory instead' };
}

export async function cmdSitePassword(ctx: CmdCtx): Promise<Out> {
  const domainFlag = ctx.flags.get('domain') ?? ctx.positional[0];
  if (!domainFlag) {
    return { ok: false, code: 'missing_domain', message: SITE_PASSWORD_USAGE };
  }

  const host = bareHost(domainFlag);
  if (!host) {
    return { ok: false, code: 'missing_domain', message: SITE_PASSWORD_USAGE };
  }

  const url = `https://${host}`;
  const user = ctx.flags.get('user')?.trim() || deriveUser(host);
  const email = ctx.flags.get('email')?.trim() || '';
  const password = generatePassword();
  const now = new Date();

  const credentials = { site: url, adminUrl: `${url}/wp-admin`, user, email, password };

  let file: string | null = null;
  let warning: string | undefined;
  try {
    const { dir, note } = await resolveOutDir(ctx.flags.get('out'));
    // Never overwrite an earlier card: a second run for the same domain would otherwise destroy the
    // credentials the customer already wrote down.
    const base = `${host}-登录信息`;
    let target = join(dir, `${base}.txt`);
    if (
      await stat(target).then(
        () => true,
        () => false,
      )
    ) {
      target = join(dir, `${base}-${stamp(now).replace(/[^0-9]/g, '')}.txt`);
    }
    await writeFile(target, card({ host, url, user, email, password, now }), { encoding: 'utf8', mode: 0o600 });
    await chmod(target, 0o600);
    file = target;
    if (note) warning = note;
  } catch (e) {
    warning = `could not write the login card (${(e as Error).message}); tell the customer the password in chat`;
  }

  return {
    ok: true,
    credentials,
    file,
    ...(warning ? { warning } : {}),
    next:
      'Submit credentials.user / .password / .email to the hosting create call as-is. The card is already on ' +
      "the customer's computer — tell them the file name and where it is; never paste this JSON into chat.",
  };
}
