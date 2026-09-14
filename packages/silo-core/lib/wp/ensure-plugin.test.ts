import { describe, it, expect } from 'vitest';
import { WpClient } from './client';
import type { HttpRequest, NetworkPort } from '../ports/network';

function fakeNet(plugins: Array<{ plugin: string; textdomain?: string; status: string }>) {
  const calls: HttpRequest[] = [];
  const net: NetworkPort = {
    async request(req) {
      calls.push(req);
      if (req.method === 'GET') return { status: 200, json: plugins };
      return { status: 200, json: {} };
    },
  };
  return { net, calls };
}
const conn = { siteUrl: 'https://example.com', username: 'u', appPassword: 'p' };

describe('WpClient.ensurePluginActive', () => {
  it('does nothing when already active', async () => {
    const { net, calls } = fakeNet([{ plugin: 'puffergo/puffergo', textdomain: 'puffergo', status: 'active' }]);
    expect(await new WpClient(net, conn).ensurePluginActive('puffergo')).toEqual({ action: 'already_active' });
    expect(calls).toHaveLength(1);
  });
  it('activates an installed plugin via its folder/file route', async () => {
    const { net, calls } = fakeNet([{ plugin: 'puffergo/puffergo', status: 'inactive' }]);
    expect(await new WpClient(net, conn).ensurePluginActive('puffergo')).toEqual({ action: 'activated' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://example.com/wp-json/wp/v2/plugins/puffergo/puffergo',
      body: { status: 'active' },
    });
  });
  it('installs from WordPress.org when missing', async () => {
    const { net, calls } = fakeNet([{ plugin: 'akismet/akismet', status: 'active' }]);
    expect(await new WpClient(net, conn).ensurePluginActive('puffergo')).toEqual({ action: 'installed' });
    expect(calls[1]).toMatchObject({
      method: 'POST',
      url: 'https://example.com/wp-json/wp/v2/plugins',
      body: { slug: 'puffergo', status: 'active' },
    });
  });
});
