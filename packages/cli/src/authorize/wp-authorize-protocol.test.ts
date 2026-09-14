import { describe, expect, it } from 'vitest';
import {
  APP_PASSWORD_RETURN_MARKER,
  buildAuthorizeUrl,
  isAuthorizeReturn,
  parseAuthorizeReturn,
} from './wp-authorize-protocol';

describe('buildAuthorizeUrl', () => {
  it('builds the authorize-application.php url with app_name and success_url', () => {
    const url = buildAuthorizeUrl('https://example.com', 'https://cb.example/return', 'MyApp');
    expect(url).toBe(
      'https://example.com/wp-admin/authorize-application.php?app_name=MyApp&success_url=https%3A%2F%2Fcb.example%2Freturn',
    );
  });

  it('drops a trailing slash on the site url', () => {
    expect(buildAuthorizeUrl('https://example.com/', 'https://cb.example/')).toContain('https://example.com/wp-admin');
  });

  it('defaults the app name to PufferGo', () => {
    expect(buildAuthorizeUrl('https://example.com', 'https://cb.example/')).toContain('app_name=PufferGo');
  });
});

describe('isAuthorizeReturn', () => {
  it('is true only when the marker param is present', () => {
    expect(isAuthorizeReturn(new URLSearchParams(`${APP_PASSWORD_RETURN_MARKER}=1`))).toBe(true);
    expect(isAuthorizeReturn(new URLSearchParams('foo=1'))).toBe(false);
  });
});

describe('parseAuthorizeReturn', () => {
  it('extracts username + password on approval', () => {
    const params = new URLSearchParams('user_login=admin&password=abcd%20efgh%20ijkl');
    expect(parseAuthorizeReturn(params)).toEqual({ username: 'admin', appPassword: 'abcd efgh ijkl' });
  });

  it('is null when the user rejected (success=false)', () => {
    const params = new URLSearchParams('success=false&user_login=admin&password=abcd');
    expect(parseAuthorizeReturn(params)).toBeNull();
  });

  it('is null when no password came back at all', () => {
    expect(parseAuthorizeReturn(new URLSearchParams('user_login=admin'))).toBeNull();
  });
});
