/** `puffergo products …` command implementations (spec sections 4-7). */

import { resolve } from 'node:path';
import { AgentClient, AgentHttpError } from './agentClient';
import { resolveSite, NoSiteError, NotLoggedInError } from './site';
import { loadProducts, writeProduct, readUploadsCache, writeUploadsCache, type LoadedProduct } from './productFiles';
import { localCheckProduct } from './localCheck';
import { walkImageRefs, identOf } from './imageRefs';
import { resolveUpload } from './uploadImage';
import { readSamples, writeSamples, resolveProductId, sampleReference, TargetError, type SampleEntry } from './samples';
import { loadSiteSchema, optionalFactPaths, getPath, isEmptyValue, SchemaVersionError } from './siteSchema';
import type { ProductFile, ValidationError, DetailSection } from './productTypes';
import { readCategoriesFile, planCategories, CATEGORIES_FILE, type RemoteTerm } from './categories';

export interface CmdCtx {
  dir: string;
  flags: Map<string, string>;
  positional: string[];
}

async function client(ctx: CmdCtx): Promise<AgentClient> {
  const siteFlag = ctx.flags.get('site');
  const cred = await resolveSite(ctx.dir, siteFlag);
  const c = new AgentClient(cred.config);
  await loadSiteSchema(c); // refuses a site whose product-file version is newer than this CLI
  return c;
}

function siteErrorOutput(
  e: unknown,
): { ok: false; code: string; sites?: string[]; fix?: string; message?: string } | null {
  if (e instanceof NoSiteError) return { ok: false, code: 'no_site', sites: e.sites };
  if (e instanceof NotLoggedInError) return { ok: false, code: 'not_logged_in' };
  if (e instanceof SchemaVersionError) return { ok: false, code: 'update_skill', fix: 'user', message: e.message };
  return null;
}

export async function cmdSchema(ctx: CmdCtx): Promise<unknown> {
  try {
    const c = await client(ctx);
    const schema = await loadSiteSchema(c);
    const samples = await readSamples(ctx.dir, c.siteUrl, 'product');
    return {
      ok: true,
      ...(schema as Record<string, unknown>),
      samples: Object.entries(samples).map(([name, t]) => ({ name, id: t.id, title: t.title })),
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

export async function cmdListProducts(ctx: CmdCtx): Promise<unknown> {
  try {
    const c = await client(ctx);
    const res = await c.listProducts({
      search: ctx.flags.get('search'),
      page: Number(ctx.flags.get('page')) || undefined,
    });
    return { ok: true, ...(res as Record<string, unknown>) };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// check: local checks + server validate, with local `file` refs stripped from
// the payload (the server only accepts mediaId/url) and the resulting
// "missing image" errors for exactly those refs filtered back out — they were
// already checked locally (existence/format/size), so surfacing them again as
// a server error would be a false positive, not a real block on push.
// ---------------------------------------------------------------------------

export function stripFileRefsForValidate(product: ProductFile): { clone: ProductFile; strippedPaths: Set<string> } {
  const clone: ProductFile = JSON.parse(JSON.stringify(product));
  const strippedPaths = new Set<string>();
  for (const { path, ref } of walkImageRefs(clone)) {
    if (ref.file) {
      strippedPaths.add(path);
      // Replace in place: same array slot, now an empty (invalid-on-its-own) ref — the server's own
      // "image ref must have mediaId/url" for THIS exact path is what we filter back out below.
      Object.keys(ref).forEach(k => delete (ref as Record<string, unknown>)[k]);
    }
  }
  if (clone.detail) delete clone.detail.unmanagedHtml;
  delete clone.sample;
  return { clone, strippedPaths };
}

function filterStrippedErrors(list: ValidationError[], strippedPaths: Set<string>): ValidationError[] {
  return list.filter(e => !strippedPaths.has(e.path));
}

// ---------------------------------------------------------------------------
// samples: a product naming a sample skips the "missing_source" warnings for the fields that sample
// leaves out on purpose (the site doesn't show a price, say) — otherwise the AI would ask about them again.
// ---------------------------------------------------------------------------

export class SampleCtx {
  private notUsed = new Map<string, Set<string>>();
  constructor(
    private c: AgentClient,
    readonly samples: Record<string, SampleEntry>,
    /** The site's optional facts (trade fields from the schema + specs), as product-file paths. */
    private factPaths: string[],
  ) {}
  static async load(c: AgentClient, dir: string): Promise<SampleCtx> {
    const schema = await loadSiteSchema(c);
    return new SampleCtx(c, await readSamples(dir, c.siteUrl, 'product'), optionalFactPaths(schema));
  }
  /** Fields the named sample doesn't use; null when no such sample is saved. */
  async fieldsNotUsed(name: string): Promise<Set<string> | null> {
    const entry = this.samples[name];
    if (!entry) return null;
    if (!this.notUsed.has(name)) {
      const remote = await this.c.getProduct<Record<string, unknown>>(entry.id);
      this.notUsed.set(name, new Set(this.factPaths.filter(path => isEmptyValue(getPath(remote, path)))));
    }
    return this.notUsed.get(name)!;
  }
}

export async function applySample(
  product: ProductFile,
  tpl: SampleCtx,
  warnings: ValidationError[],
): Promise<{ errors: ValidationError[]; warnings: ValidationError[] }> {
  const names = Object.keys(tpl.samples);
  if (!product.sample) return { errors: [], warnings };
  const notUsed = await tpl.fieldsNotUsed(product.sample);
  if (!notUsed) {
    return {
      errors: [
        {
          path: `${identOf(product)}.sample`,
          code: 'unknown_sample',
          message: `No sample named "${product.sample}". Saved samples: ${names.length ? names.join(', ') : 'none'} (see \`products sample list\`).`,
          fix: 'ai',
        },
      ],
      warnings,
    };
  }
  const ident = identOf(product);
  return {
    errors: [],
    warnings: warnings.filter(
      w => !(w.code === 'missing_source' && [...notUsed].some(f => w.path === `${ident}.${f}`)),
    ),
  };
}

export interface CheckResult {
  key: string | null;
  id: number | null;
  errors: ValidationError[];
  warnings: ValidationError[];
}

async function checkOne(c: AgentClient, loaded: LoadedProduct, baseDir: string, tpl: SampleCtx): Promise<CheckResult> {
  const { product } = loaded;
  if (loaded.parseError) {
    return {
      key: loaded.fileKey,
      id: null,
      errors: [
        {
          path: `products/${loaded.fileKey}.json`,
          code: 'format',
          message: `Invalid JSON: ${loaded.parseError}`,
          fix: 'ai',
        },
      ],
      warnings: [],
    };
  }
  const local = await localCheckProduct(product, baseDir);
  const { clone, strippedPaths } = stripFileRefsForValidate(product);
  let serverErrors: ValidationError[] = [];
  let serverWarnings: ValidationError[] = [];
  try {
    const res = await c.validate<{
      ok: boolean;
      results: Array<{ key: string | null; id: number | null; errors: ValidationError[]; warnings: ValidationError[] }>;
    }>([clone]);
    const r = res.results[0];
    if (r) {
      serverErrors = filterStrippedErrors(r.errors, strippedPaths);
      serverWarnings = filterStrippedErrors(r.warnings, strippedPaths);
    }
  } catch (e) {
    serverErrors = [
      { path: identOf(product), code: 'error', message: e instanceof Error ? e.message : String(e), fix: 'ai' },
    ];
  }
  const sampled = await applySample(product, tpl, [...local.warnings, ...serverWarnings]);
  return {
    key: product.key ?? null,
    id: product.id ?? null,
    errors: [...local.errors, ...serverErrors, ...sampled.errors],
    warnings: sampled.warnings,
  };
}

export async function cmdCheck(ctx: CmdCtx): Promise<unknown> {
  const only = ctx.flags.get('only')?.split(',').filter(Boolean);
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results: CheckResult[] = [];
    for (const item of loaded) results.push(await checkOne(c, item, ctx.dir, tpl));
    const ok = results.every(r => r.errors.length === 0);
    return { ok, results };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// push
// ---------------------------------------------------------------------------

interface PushOneResult {
  key: string | null;
  id: number | null;
  ok: boolean;
  status?: string;
  previewUrl?: string;
  editUrl?: string;
  uploaded: number;
  reused: number;
  errors: ValidationError[];
  warnings: ValidationError[];
}

function sectionSignature(sections: DetailSection[] | undefined): Array<{ layout: string; images: number }> {
  return (sections ?? []).map(s => ({
    layout: s.layout,
    images: s.layout === 'gallery' ? (s.images ?? []).length : s.image ? 1 : 0,
  }));
}

export function readbackMismatches(local: ProductFile, remote: Record<string, unknown>): string[] {
  const mismatches: string[] = [];
  const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (local.title !== remote.title)
    mismatches.push(`title: expected "${local.title}", got "${remote.title as string}"`);
  const expectedStatus = local.status ?? (remote.status as string); // status omitted → keeps site value
  if (local.status && local.status !== remote.status)
    mismatches.push(`status: expected ${local.status}, got ${remote.status as string}`);
  if (local.excerpt !== undefined && (local.excerpt || '') !== ((remote.excerpt as string) ?? '')) {
    mismatches.push(`excerpt mismatch`);
  }
  if (local.price !== undefined && !eq(local.price, remote.price)) mismatches.push('price mismatch');
  if (local.moq !== undefined && !eq(local.moq, remote.moq)) mismatches.push('moq mismatch');
  if (local.leadTime !== undefined && !eq(local.leadTime, remote.leadTime)) mismatches.push('leadTime mismatch');
  if (local.trade !== undefined) {
    const nonEmpty = (m: unknown) =>
      Object.fromEntries(
        Object.entries((m as Record<string, unknown>) ?? {})
          .filter(([, v]) => !isEmptyValue(v))
          .sort(),
      );
    if (!eq(nonEmpty(local.trade), nonEmpty(remote.trade))) mismatches.push('trade mismatch');
  }
  const localSpecCount = (local.specs ?? []).length;
  const remoteSpecCount = ((remote.specs as unknown[]) ?? []).length;
  if (local.specs !== undefined && localSpecCount !== remoteSpecCount) {
    mismatches.push(`specs count: expected ${localSpecCount}, got ${remoteSpecCount}`);
  }
  const localGalleryCount = (local.gallery ?? []).length;
  const remoteGalleryCount = ((remote.gallery as unknown[]) ?? []).length;
  if (local.gallery !== undefined && localGalleryCount !== remoteGalleryCount) {
    mismatches.push(`gallery count: expected ${localGalleryCount}, got ${remoteGalleryCount}`);
  }
  if (local.detail?.sections !== undefined) {
    const remoteDetail = remote.detail as { sections?: DetailSection[] } | undefined;
    const localSig = sectionSignature(local.detail.sections);
    const remoteSig = sectionSignature(remoteDetail?.sections);
    if (!eq(localSig, remoteSig)) {
      mismatches.push(
        `detail.sections signature mismatch: expected ${JSON.stringify(localSig)}, got ${JSON.stringify(remoteSig)}`,
      );
    }
  }
  void expectedStatus;
  return mismatches;
}

/** Strip `file`/local-only fields from a (post-upload) product before sending it to upsert/validate. */
function toWirePayload(product: ProductFile): Record<string, unknown> {
  const clone: ProductFile = JSON.parse(JSON.stringify(product));
  if (clone.detail) delete clone.detail.unmanagedHtml;
  delete clone.sample;
  for (const { ref } of walkImageRefs(clone)) {
    delete ref.file;
  }
  return clone as unknown as Record<string, unknown>;
}

async function pushOne(
  c: AgentClient,
  loaded: LoadedProduct,
  ctx: CmdCtx,
  cache: Record<string, { mediaId: number; url: string }>,
  allowPublish: boolean,
  tpl: SampleCtx,
): Promise<PushOneResult> {
  const { product, path } = loaded;
  const checkOutcome = await checkOne(c, loaded, ctx.dir, tpl);
  if (checkOutcome.errors.length) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded: 0,
      reused: 0,
      errors: checkOutcome.errors,
      warnings: checkOutcome.warnings,
    };
  }

  let uploaded = 0;
  let reused = 0;
  const uploadErrors: ValidationError[] = [];
  // Resolve uploads on a CLONE: the file on disk keeps its local `file` refs (readable for the AI, and
  // re-pushing is cheap thanks to the sha256 cache); only the wire payload carries mediaId.
  const wire: ProductFile = JSON.parse(JSON.stringify(product));
  // Only `products publish` (which checks the customer's words) may send status "publish". A plain push
  // omits it, so the site keeps its current status: a draft stays a draft, a live product stays live.
  const statusWarnings: ValidationError[] = [];
  if (wire.status === 'publish' && !allowPublish) {
    delete wire.status;
    statusWarnings.push({
      path: `${identOf(product)}.status`,
      code: 'publish_ignored',
      message:
        'push never publishes; the site status was left unchanged. Use `products publish` only when the customer asks to publish.',
      fix: 'user',
    });
  }
  for (const { ref, path: refPath } of walkImageRefs(wire)) {
    if (!ref.file) continue;
    try {
      const abs = resolve(ctx.dir, ref.file);
      const res = await resolveUpload(c, cache, abs);
      if (res.reused) reused++;
      else uploaded++;
      ref.mediaId = res.mediaId;
      ref.sha256 = res.sha256;
      delete ref.file;
    } catch (e) {
      uploadErrors.push({
        path: refPath,
        code: 'error',
        message: e instanceof Error ? e.message : String(e),
        fix: 'ai',
      });
    }
  }
  if (uploadErrors.length) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: uploadErrors,
      warnings: checkOutcome.warnings,
    };
  }

  const payload = toWirePayload(wire);
  let upsertRes: {
    key: string | null;
    id: number | null;
    ok: boolean;
    status?: string;
    modifiedGmt?: string;
    previewUrl?: string;
    editUrl?: string;
    errors: ValidationError[];
  };
  try {
    const results = await c.upsert<Array<typeof upsertRes>>([payload]);
    upsertRes = results[0];
  } catch (e) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: [
        { path: identOf(product), code: 'error', message: e instanceof Error ? e.message : String(e), fix: 'ai' },
      ],
      warnings: checkOutcome.warnings,
    };
  }

  if (!upsertRes.ok || !upsertRes.id) {
    return {
      key: upsertRes.key ?? product.key ?? null,
      id: upsertRes.id ?? product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: upsertRes.errors,
      warnings: checkOutcome.warnings,
    };
  }

  // Write back id/key/baseModified into the ORIGINAL local file (keeping its `file` refs, per spec —
  // the on-disk product still names the local image, not the mediaId we resolved for the wire payload).
  product.id = upsertRes.id;
  if (upsertRes.key) product.key = upsertRes.key;
  product.baseModified = upsertRes.modifiedGmt;
  await writeProduct(ctx.dir, loaded.fileKey, product);
  void path;

  // Read-back: fetch the just-written product and compare against what we intended to write.
  let readbackErrors: ValidationError[] = [];
  try {
    const remote = await c.getProduct<Record<string, unknown>>(upsertRes.id);
    const mismatches = readbackMismatches({ ...product, status: wire.status }, remote);
    if (mismatches.length) {
      readbackErrors = mismatches.map(m => ({
        path: identOf(product),
        code: 'readback_mismatch',
        message: m,
        fix: 'ai' as const,
      }));
    }
  } catch (e) {
    readbackErrors = [
      {
        path: identOf(product),
        code: 'readback_mismatch',
        message: e instanceof Error ? e.message : String(e),
        fix: 'ai',
      },
    ];
  }

  return {
    key: upsertRes.key ?? null,
    id: upsertRes.id,
    ok: readbackErrors.length === 0,
    status: upsertRes.status,
    previewUrl: upsertRes.previewUrl,
    editUrl: upsertRes.editUrl,
    uploaded,
    reused,
    errors: readbackErrors,
    warnings: [...checkOutcome.warnings, ...statusWarnings],
  };
}

export async function cmdPush(ctx: CmdCtx, allowPublish = false): Promise<unknown> {
  const only = ctx.flags.get('only')?.split(',').filter(Boolean);
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const cache = await readUploadsCache(ctx.dir, c.siteUrl);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results: PushOneResult[] = [];
    for (const item of loaded) {
      results.push(await pushOne(c, item, ctx, cache, allowPublish, tpl));
      await writeUploadsCache(ctx.dir, c.siteUrl, cache); // persist as we go — an early failure shouldn't lose earlier uploads' cache entries
    }
    const ok = results.every(r => r.ok);
    return { ok, results };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    throw e;
  }
}

// ---------------------------------------------------------------------------
// pull
// ---------------------------------------------------------------------------

function deriveKeyFromTitle(title: string, existingKeys: Set<string>): string {
  const base =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'product';
  const padded = base.length >= 3 ? base : `${base}-item`;
  let candidate = padded;
  let i = 2;
  while (existingKeys.has(candidate) || !/^[a-z0-9-]{3,80}$/.test(candidate)) {
    candidate = `${padded}-${i++}`.slice(0, 80);
  }
  return candidate;
}

export async function cmdPull(ctx: CmdCtx): Promise<unknown> {
  const target = ctx.positional[0];
  if (!target) return { ok: false, code: 'error', message: 'usage: puffergo products pull <key|id|link>' };
  try {
    const c = await client(ctx);
    const id = await resolveProductId(c, target);
    const remote = await c.getProduct<ProductFile & { key: string | null; unmanagedHtml?: string }>(id);
    const existing = await loadProducts(ctx.dir);
    let key = remote.key;
    if (!key) key = deriveKeyFromTitle(remote.title, new Set(existing.map(p => p.fileKey)));
    // `sample` lives only in the local file — keep it across a pull.
    const sample = existing.find(p => p.fileKey === key)?.product.sample;
    const product: ProductFile = { ...remote, key, ...(sample ? { sample } : {}) };
    await writeProduct(ctx.dir, key, product);
    if (product.detail?.unmanagedHtml) {
      process.stderr.write(
        `注意：该产品正文里有非 content-alternating 的内容（detail.unmanagedHtml），只读，推送时会原样保留、不会被这份文件覆盖。\n`,
      );
    }
    return {
      ok: true,
      key,
      id,
      path: `products/${key}.json`,
      hint: 'pull is for editing THIS product. If the customer wants new products to look like it, run `products sample set <type name> <this link or id>` instead.',
    };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    if (e instanceof TargetError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof AgentHttpError) return { ok: false, code: 'error', status: e.status, body: e.body };
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

/** Publishing makes a product public, so it needs the customer's own words asking for it — "push" /
 *  "推" / "上传" / "更新" only ever mean a draft. Checked in code because models misread "直接推" as publish. */
export const PUBLISH_INTENT = /发布|上线|公开|publish|go live|make (it|them|.+) live|put (it|them|.+) live/i;

export async function cmdPublish(ctx: CmdCtx): Promise<unknown> {
  const keys = ctx.positional;
  if (!keys.length) {
    return {
      ok: false,
      code: 'error',
      message: 'usage: puffergo products publish <key…> --customer-said "<the customer\'s exact words>"',
    };
  }
  const said = ctx.flags.get('customer-said') ?? '';
  if (!PUBLISH_INTENT.test(said)) {
    return {
      ok: false,
      code: 'needs_publish_request',
      fix: 'user',
      message:
        'Publishing makes the product public. Only publish when the customer explicitly asked to publish (发布/上线/publish) these products — "push"/"推"/"上传"/"更新" mean draft only. Ask the customer; if they say to publish, pass their exact words with --customer-said.',
    };
  }
  const loaded = await loadProducts(ctx.dir, keys);
  const missing = keys.filter(k => !loaded.some(l => l.fileKey === k));
  if (missing.length) {
    return {
      ok: false,
      code: 'not_found',
      message: `No local file products/<key>.json for: ${missing.join(', ')} — pull it first.`,
    };
  }
  for (const item of loaded) {
    item.product.status = 'publish';
    await writeProduct(ctx.dir, item.fileKey, item.product);
  }
  return cmdPush({ ...ctx, flags: new Map([...ctx.flags, ['only', keys.join(',')]]) }, true);
}

// ---------------------------------------------------------------------------
// sample list | set <name> <key|id|link> | show <name> | remove <name>
// ---------------------------------------------------------------------------

export async function cmdSample(ctx: CmdCtx): Promise<unknown> {
  const [sub, name, target] = ctx.positional;
  const usage = 'usage: puffergo products sample <list | set <name> <key|id|link> | show <name> | remove <name>>';
  try {
    const c = await client(ctx);
    const samples = await readSamples(ctx.dir, c.siteUrl, 'product');
    const missing = () => ({
      ok: false,
      code: 'unknown_sample',
      message: `No sample named "${name}". Saved: ${Object.keys(samples).join(', ') || 'none'}.`,
    });
    switch (sub) {
      case 'list':
        return {
          ok: true,
          samples: Object.entries(samples).map(([n, t]) => ({ name: n, id: t.id, title: t.title })),
        };
      case 'set': {
        if (!name || !target) return { ok: false, code: 'usage', message: usage };
        const id = await resolveProductId(c, target);
        const remote = await c.getProduct<{ title: string }>(id);
        samples[name] = { id, title: remote.title };
        await writeSamples(ctx.dir, c.siteUrl, 'product', samples);
        return { ok: true, name, id, title: remote.title };
      }
      case 'show': {
        if (!name) return { ok: false, code: 'usage', message: usage };
        const entry = samples[name];
        if (!entry) return missing();
        const remote = await c.getProduct<ProductFile>(entry.id);
        return {
          ok: true,
          name,
          id: entry.id,
          note:
            'Structure reference only. Follow which fields it uses (notUsed = the site does not show these: do not write them and do not ask), its units, spec names and order, section layouts, image placement and text lengths. Write every text from the customer\'s facts; drop a section the customer gave nothing for. Set "sample": "' +
            name +
            '" in each product file that follows it.',
          reference: sampleReference(remote, await loadSiteSchema(c)),
        };
      }
      case 'remove': {
        if (!name) return { ok: false, code: 'usage', message: usage };
        if (!samples[name]) return missing();
        delete samples[name];
        await writeSamples(ctx.dir, c.siteUrl, 'product', samples);
        return { ok: true, removed: name };
      }
      default:
        return { ok: false, code: 'usage', message: usage };
    }
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    if (e instanceof TargetError) return { ok: false, code: e.code, message: e.message };
    if (e instanceof AgentHttpError && e.status === 404)
      return { ok: false, code: 'not_found', message: 'That product no longer exists on the site.' };
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}

// ---------------------------------------------------------------------------
// categories check | push — sync categories.json to the site's product categories
// ---------------------------------------------------------------------------

export async function cmdCategories(ctx: CmdCtx): Promise<unknown> {
  const sub = ctx.positional[0];
  if (sub !== 'check' && sub !== 'push')
    return { ok: false, code: 'usage', message: 'usage: puffergo products categories <check | push>' };
  try {
    const file = await readCategoriesFile(ctx.dir);
    if (file === null) return { ok: false, code: 'no_file', message: `No ${CATEGORIES_FILE} in the work folder.` };
    const c = await client(ctx);
    const { language } = (await loadSiteSchema(c)) as { language?: string };
    const remote = await c.listCategoryTerms<RemoteTerm>(language ?? '');
    const { errors, warnings, ops } = planCategories(file, remote);
    const summary = ops.filter(o => o.op !== 'keep').map(o => ({ op: o.op, slug: o.slug }));
    if (errors.length) return { ok: false, code: 'invalid', errors, warnings };
    if (sub === 'check') return { ok: true, changes: summary, warnings };

    const idBySlug = new Map(remote.map(t => [t.slug, t.id]));
    for (const o of ops) {
      if (o.op === 'keep') continue;
      const body: Record<string, unknown> = {
        name: o.name,
        slug: o.slug,
        parent: o.parentSlug ? (idBySlug.get(o.parentSlug) ?? 0) : 0,
        ...(o.description !== undefined ? { description: o.description } : {}),
      };
      const saved = await c.saveCategoryTerm<{ id: number }>(o.op === 'update' ? o.id : null, body);
      idBySlug.set(o.slug, saved.id);
    }
    return { ok: true, changes: summary, warnings };
  } catch (e) {
    const siteErr = siteErrorOutput(e);
    if (siteErr) return siteErr;
    if (e instanceof SyntaxError)
      return { ok: false, code: 'invalid_json', message: `${CATEGORIES_FILE}: ${e.message}` };
    if (e instanceof AgentHttpError) return { ok: false, code: 'http_error', status: e.status, body: e.body };
    return { ok: false, code: 'error', message: e instanceof Error ? e.message : String(e) };
  }
}
