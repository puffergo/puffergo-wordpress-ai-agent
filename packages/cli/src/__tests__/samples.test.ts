// ---- samples live in each site's own folder, bucketed by content type ------------------------------
import { describe, it, expect } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readSamples, writeSamples } from '../lib/samples';

describe('samples file', () => {
  it('stores one file per site, content type → name inside', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-samples-'));
    await writeSamples(dir, 'https://a.com', 'product', { valves: { id: 1, title: 'V' } });
    await writeSamples(dir, 'https://b.com', 'product', { motors: { id: 2, title: 'M' } });
    expect(JSON.parse(await readFile(join(dir, '.puffergo', 'sites', 'a.com', 'samples.json'), 'utf8'))).toEqual({
      product: { valves: { id: 1, title: 'V' } },
    });
    expect(JSON.parse(await readFile(join(dir, '.puffergo', 'sites', 'b.com', 'samples.json'), 'utf8'))).toEqual({
      product: { motors: { id: 2, title: 'M' } },
    });
    expect(await readSamples(dir, 'https://a.com', 'product')).toEqual({ valves: { id: 1, title: 'V' } });
  });
});
