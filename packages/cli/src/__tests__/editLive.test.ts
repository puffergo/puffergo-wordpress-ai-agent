import { describe, it, expect } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeWorkdirConfig, editLiveAllowed } from '../lib/site';

describe('edit-live switch', () => {
  it('is off by default, on only for the site it was turned on for', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-editlive-'));
    await writeWorkdirConfig(dir, { siteUrl: 'https://a.com' });
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(false);

    await writeWorkdirConfig(dir, {
      siteUrl: 'https://a.com',
      editLive: { on: true, customerSaid: '改一下线上价格', at: 'x' },
    });
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(true);
    expect(await editLiveAllowed(dir, 'https://b.com')).toBe(false);

    await writeWorkdirConfig(dir, { siteUrl: 'https://a.com' }); // re-login, same site: kept
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(true);

    await writeWorkdirConfig(dir, { siteUrl: 'https://b.com' }); // other site: dropped
    await writeWorkdirConfig(dir, { siteUrl: 'https://a.com' });
    expect(await editLiveAllowed(dir, 'https://a.com')).toBe(false);
  });
});
