import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeSiteConfig, editLiveAllowed } from '../lib/site';

describe('edit-live switch', () => {
  it('is off by default, on only for the site it was turned on for, and survives a re-login', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-editlive-'));
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(false);

    await writeSiteConfig(dir, 'https://a.com', {
      editLive: { on: true, customerSaid: '改一下线上价格', at: 'x' },
    });
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(true);
    // Per-site storage: another site was never switched on, and pointing the folder there can't drop it.
    expect(await editLiveAllowed(dir, 'https://b.com')).toBe(false);
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(true);

    await writeSiteConfig(dir, 'https://a.com', {}); // `edit-live off`
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(false);
  });
});
