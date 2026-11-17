/**
 * `puffergo logout [网站地址]` — 断开这台电脑和一个网站的连接。
 *
 * 本地凭据就是唯一的那把钥匙：删掉 `~/.puffergo/credentials.json` 里这一条，`resolveSite()` 再也
 * 取不到这个站，所有命令当场进不去——这就是"断开"。WordPress 后台那条应用密码我们不动，也不假装
 * 动了：输出里给 `profile.php#application-passwords-section` 的 `revokeUrl`，客户自己点删除才是
 * 彻底收回。所以这里没有一句"已撤销"，只有"已经断开"和"那一条还在"。
 *
 * 只清跟这个站有关的东西，客户的内容一件都不删：
 *   ~/.puffergo/credentials.json                  本站那一条（其余站点原样不动）
 *   ~/.puffergo/login-state.json                  本站的授权回执，免得 `login status` 读到死记录
 *   <workdir>/.puffergo/state.json                只在它指向本站时清——留着就是死指针
 *   <workdir>/.puffergo/sites/<域名>/config.json  edit-live 开关（属于刚结束的那次授权）
 *   workspace.json / pages/                       保留：这是客户的台账和内容，跟授权无关
 *
 * 不带站点时只列清单，**绝不**因为"凭据里只剩一个站"就把它断掉：`resolveCredential()` 有这个
 * 单站便利逻辑，`logout` 一旦复用它，客户打一句 `puffergo logout` 就没了唯一那个站。
 */

import { siteKey } from '@puffergo/silo-core';
import { listCredentialSites, removeCredential, resolveCredential } from '../adapters/credentials';
import { clearActiveDomain, readActiveDomain } from '../adapters/fileStore';
import { clearSiteConfig } from './site';
import { forgetLoginState, normalizeSiteUrl } from './loginCmd';

export const LOGOUT_USAGE = 'puffergo logout [网站地址]';

type Out = Record<string, unknown> & { ok: boolean };

/** Which connected site this folder is currently pointed at, resolved back to its store URL. */
async function activeSite(dir: string, sites: string[]): Promise<string | null> {
  const key = await readActiveDomain(dir);
  return key ? (sites.find(u => siteKey(u) === key) ?? null) : null;
}

export async function cmdLogout(dir: string, siteArg: string | undefined, configPath?: string): Promise<Out> {
  const sites = await listCredentialSites(configPath);

  // No site named: show the list and stop. The customer picks; guessing here costs them a connection.
  if (!siteArg) {
    if (!sites.length) {
      return {
        ok: false,
        code: 'not_logged_in',
        message: '这台电脑还没有连接过任何网站，没有可断开的。',
      };
    }
    const active = await activeSite(dir, sites);
    return {
      ok: false,
      code: 'need_site',
      sites,
      ...(active ? { active } : {}),
      message:
        '这台电脑连接过上面这些网站。要断开哪一个，跟客户确认地址后再运行 `puffergo logout <网站地址>`——不要自己挑。',
    };
  }

  let siteUrl: string;
  try {
    siteUrl = normalizeSiteUrl(siteArg);
  } catch {
    return { ok: false, code: 'error', message: `不是有效的网站地址：${siteArg}` };
  }

  const cred = await resolveCredential(siteUrl, configPath);
  if (!cred) {
    return {
      ok: false,
      code: 'not_connected',
      siteUrl,
      sites,
      message: `这台电脑没有连接 ${siteUrl}，不用断开。上面是它连接过的网站。`,
    };
  }

  const real = cred.siteUrl;
  // 先清指针、再删凭据：半路失败时宁可这个文件夹"不指向任何站"（用 --site 就能重新指定），
  // 也不要留下一个指向已删凭据的死指针——那会让之后的每条命令都报 not_logged_in，连别的站也用不了。
  const pointerCleared = await clearActiveDomain(dir, real);
  const loginStateCleared = await forgetLoginState(real);
  const editLiveCleared = await clearSiteConfig(dir, real);
  await removeCredential(real, configPath);

  const remaining = await listCredentialSites(configPath);
  const revokeUrl = `${real.replace(/\/+$/, '')}/wp-admin/profile.php#application-passwords-section`;

  return {
    ok: true,
    siteUrl: real,
    remaining,
    cleared: { activeSite: pointerCleared, loginState: loginStateCleared, editLive: editLiveCleared },
    revokeUrl,
    next: `已经断开：这台电脑不再连接 ${real}，之后所有命令都进不去，要连回来得重新走一次 login。客户的台账和内容没有动。另外，网站后台那条应用密码还在（我们没有权限替客户删），把 revokeUrl 原样发给客户，请他在那个页面上把名字带 PufferGo 的那一条删掉，那才是彻底收回。`,
  };
}
