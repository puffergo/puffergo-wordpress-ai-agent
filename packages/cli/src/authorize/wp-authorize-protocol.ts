/**
 * PufferGo — the platform-agnostic half of WordPress's one-click Application Password flow: building
 * the `wp-admin/authorize-application.php` URL, and parsing what it appends to `success_url` on return.
 * Zero chrome/DOM/Node dependencies on purpose, so every host can share it instead of reimplementing
 * the same query-string contract — see `wp-app-password.ts` for the chrome-extension host (tabs +
 * runtime messaging to catch the redirect) and its own doc comment for why this split exists.
 *
 * What's NOT here, because it's genuinely per-host: how you open the authorize URL (a new tab vs.
 * `window.open` vs. shelling out to the system browser) and how you catch the redirect back (a
 * `success_url` your own page recognizes vs. a local HTTP server listening on 127.0.0.1, since a
 * desktop app like Obsidian has no extension-page URL WordPress could redirect to).
 */

/** Marker query param on the return URL — a landing page checks for this to know "this load is the
 *  authorize round-trip", not a normal visit. */
export const APP_PASSWORD_RETURN_MARKER = 'pgAppPwReturn';

export interface AuthorizedAppPasswordCredentials {
  username: string;
  appPassword: string;
}

/** Builds the URL that starts the flow: WordPress shows its own "approve this app?" screen, then
 *  redirects to `successUrl` with the result appended. */
export function buildAuthorizeUrl(siteUrl: string, successUrl: string, appName = 'PufferGo'): string {
  const base = siteUrl.trim().replace(/\/+$/, '');
  return (
    `${base}/wp-admin/authorize-application.php` +
    `?app_name=${encodeURIComponent(appName)}` +
    `&success_url=${encodeURIComponent(successUrl)}`
  );
}

/** True when `params` (the return URL's query string) carries {@link APP_PASSWORD_RETURN_MARKER} — the
 *  landing page must gate on this before rendering anything else, since the password sits in the URL. */
export function isAuthorizeReturn(params: URLSearchParams): boolean {
  return params.has(APP_PASSWORD_RETURN_MARKER);
}

/**
 * Reads the credentials WordPress appended to `success_url`. `null` covers every "no password" case:
 * the user clicked 「不，我不批准」 (WordPress appends `success=false`), or the response is otherwise
 * incomplete — callers treat both the same way, by falling back to manual entry.
 */
export function parseAuthorizeReturn(params: URLSearchParams): AuthorizedAppPasswordCredentials | null {
  if (params.get('success') === 'false') return null;
  const appPassword = params.get('password') ?? '';
  if (!appPassword) return null;
  return { username: params.get('user_login') ?? '', appPassword };
}
