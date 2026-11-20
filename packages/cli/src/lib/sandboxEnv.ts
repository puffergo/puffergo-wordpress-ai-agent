/**
 * Agent sandboxes (desktop AI hosts that wrap tool calls) inject a fs-broker preload through
 * `NODE_OPTIONS=--require …/…-language-shim.cjs`. The shim proxies `fs` calls to a **broker process
 * owned by the command that started it**.
 *
 * That breaks this CLI in a way that looks like an authorization failure rather than a filesystem one:
 * `puffergo login` double-forks the callback listener so it outlives the command — and the listener
 * inherits the shim. The command ends, its broker is torn down, and when the customer finally clicks
 * Approve the listener receives everything and then fails to write `~/.puffergo/credentials.json`:
 *
 *   保存凭据失败：Broker request outcome unknown: execution attempt 不存在或已关闭
 *
 * The listener is healthy, the password arrived, nothing was saved. Verified fix: running the same
 * command under `env -u NODE_OPTIONS` writes the file on the first try.
 *
 * So the CLI strips that preload at startup and re-executes itself once, and every child it spawns gets
 * the cleaned environment. Only shim-shaped preloads are removed — a user's own `NODE_OPTIONS` survives.
 */

/** Substrings that identify a sandbox/broker preload rather than a legitimate user preload. */
const SANDBOX_HINT = /(language-shim|node-shim|fs-shim|codebuddy|workbuddy|\.workbuddy[/\\]|genie[-_ ]?(trash|shim)|broker)/i;

/** Flags that take a script path as their next token. */
const PRELOAD_FLAGS = new Set(['--require', '-r', '--import', '--loader', '--experimental-loader']);

/** Drop `--require <sandbox shim>` style pairs, keep everything else (e.g. `--max-old-space-size`). */
export function stripSandboxPreloads(tokens: readonly string[]): { keep: string[]; stripped: boolean } {
  const keep: string[] = [];
  let stripped = false;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]!;
    if (PRELOAD_FLAGS.has(token)) {
      const target = tokens[i + 1];
      if (target !== undefined && SANDBOX_HINT.test(target)) {
        i++; // consume the path too
        stripped = true;
        continue;
      }
      keep.push(token);
      continue;
    }
    const inline = /^(--require|--import|--loader|--experimental-loader)=(.+)$/.exec(token);
    if (inline && SANDBOX_HINT.test(inline[2]!)) {
      stripped = true;
      continue;
    }
    keep.push(token);
  }
  return { keep, stripped };
}

/** Split a `NODE_OPTIONS` string the way Node does closely enough for our purpose. Quoted runs stay in
 *  one token so `--require="/Applications/Some App/shim.cjs"` is not chopped at the space. */
function splitOptions(raw: string): string[] {
  return raw.match(/(?:"[^"]*"|'[^']*'|\S)+/g) ?? [];
}

export function stripSandboxNodeOptions(raw: string): { value: string; stripped: boolean } {
  if (!raw.trim()) return { value: raw, stripped: false };
  const { keep, stripped } = stripSandboxPreloads(splitOptions(raw));
  return { value: keep.join(' '), stripped };
}

/** `process.env` minus the sandbox preload — what every child of this CLI should inherit. */
export function sandboxFreeEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const { value, stripped } = stripSandboxNodeOptions(base.NODE_OPTIONS ?? '');
  if (!stripped) return base;
  const env: NodeJS.ProcessEnv = { ...base };
  if (value) env.NODE_OPTIONS = value;
  else delete env.NODE_OPTIONS;
  return env;
}

/** `process.execArgv` can carry the same preload Node lifted out of `NODE_OPTIONS`. */
export function stripSandboxExecArgv(argv: readonly string[]): string[] {
  return stripSandboxPreloads(argv).keep;
}

/** True when this process is running under a sandbox shim that would poison later writes. */
export function runningUnderSandboxShim(
  nodeOptions: string | undefined = process.env.NODE_OPTIONS,
  execArgv: readonly string[] = process.execArgv,
): boolean {
  return (
    stripSandboxNodeOptions(nodeOptions ?? '').stripped || stripSandboxPreloads(execArgv).stripped
  );
}
