import { describe, it, expect } from 'vitest';
import {
  stripSandboxPreloads,
  stripSandboxNodeOptions,
  stripSandboxExecArgv,
  runningUnderSandboxShim,
  sandboxFreeEnv,
} from '../lib/sandboxEnv';

/**
 * The sandbox preload is the difference between "the customer approved and it was saved" and
 * "the customer approved and the write was rejected by a broker that no longer exists". These
 * assertions pin the two sides of it: shim-shaped preloads go, everything else stays.
 */
describe('stripping the sandbox fs preload', () => {
  it('removes a --require pair that points at a language shim', () => {
    const out = stripSandboxNodeOptions('--require /opt/agenthost/node-language-shim.cjs');
    expect(out.stripped).toBe(true);
    expect(out.value).toBe('');
  });

  it('keeps unrelated NODE_OPTIONS the user actually set', () => {
    const raw = '--max-old-space-size=4096 --require /opt/agenthost/node-language-shim.cjs --no-warnings';
    const out = stripSandboxNodeOptions(raw);
    expect(out.stripped).toBe(true);
    expect(out.value).toBe('--max-old-space-size=4096 --no-warnings');
  });

  it('handles the inline --require= form and -r shorthand', () => {
    expect(stripSandboxNodeOptions('--require=/opt/codebuddy/shim.cjs').value).toBe('');
    expect(stripSandboxNodeOptions('-r "/path with space/language-shim.cjs"').value).toBe('');
  });

  it('handles what the host actually injects: --require="…/node-language-shim.cjs" with a space in the path', () => {
    const raw =
      '--require="/Applications/WorkBuddy.app/Contents/Resources/app.asar.unpacked/cli/vendor/sandbox-center-runtime-kit/shim/node-language-shim.cjs"';
    const out = stripSandboxNodeOptions(raw);
    expect(out.stripped).toBe(true);
    expect(out.value).toBe('');
  });

  it('leaves a legitimate preload alone — we only remove shims', () => {
    const raw = '--require /usr/local/lib/ts-node/register';
    const out = stripSandboxNodeOptions(raw);
    expect(out.stripped).toBe(false);
    expect(out.value).toBe(raw);
  });

  it('is a no-op on empty NODE_OPTIONS', () => {
    expect(stripSandboxNodeOptions('')).toEqual({ value: '', stripped: false });
  });

  it('also cleans process.execArgv, where Node copies the same preload', () => {
    const argv = ['--require', '/opt/agenthost/node-language-shim.cjs', '--enable-source-maps'];
    expect(stripSandboxExecArgv(argv)).toEqual(['--enable-source-maps']);
  });

  it('reports whether this process is running under a shim', () => {
    expect(runningUnderSandboxShim('', [])).toBe(false);
    expect(runningUnderSandboxShim('--require /a/node-language-shim.cjs', [])).toBe(true);
    expect(runningUnderSandboxShim('', ['-r', '/a/codebuddy-shim.cjs'])).toBe(true);
  });

  it('gives children an env without the shim and without inventing one', () => {
    const clean = sandboxFreeEnv({ NODE_OPTIONS: '--require /a/workbuddy-shim.cjs', HOME: '/h' });
    expect(clean.NODE_OPTIONS).toBeUndefined();
    expect(clean.HOME).toBe('/h');

    const untouched = { HOME: '/h' } as NodeJS.ProcessEnv;
    expect(sandboxFreeEnv(untouched)).toBe(untouched);
  });

  it('drops a bare pair only when the flag takes a path', () => {
    const tokens = ['--require', '--inspect'];
    expect(stripSandboxPreloads(tokens)).toEqual({ keep: ['--require', '--inspect'], stripped: false });
  });
});
