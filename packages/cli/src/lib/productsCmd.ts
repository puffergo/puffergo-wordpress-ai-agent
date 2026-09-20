/** `puffergo products …` command implementations (spec sections 4-7). */

import { resolve, join, relative } from 'node:path';
import { readFile, readdir, stat } from 'node:fs/promises';
import { sniffImage } from './imageSniff';
import type { AgentClient } from './agentClient';
import { AgentHttpError } from './agentClient';
import { editLiveAllowed } from './site';
import {
  client,
  errorOutput,
  isLive as isLiveStatus,
  liveLockedMessage,
  customerSaid,
  publishRefusal,
  type CmdCtx,
} from './siteCmd';
import { loadProducts, writeProduct, readUploadsCache, writeUploadsCache, type LoadedProduct } from './productFiles';
import { localCheckProduct } from './localCheck';
import { walkImageRefs, identOf } from './imageRefs';
import { walkConfigImages, isLocalImage } from './configData';
import { resolveUpload } from './uploadImage';
import { readSamples, writeSamples, resolveProductId, sampleReference, type SampleEntry } from './samples';
import {
  loadSiteSchema,
  optionalFactPaths,
  getPath,
  isEmptyValue,
  ABILITIES_MISSING,
  PluginOutdatedError,
} from './siteSchema';
import type { ProductFile, ValidationError, DetailBlock } from './productTypes';
import { blockSignature, detailBlocks } from './detailBlocks';
import { MissingImageError, uploadHtmlImages } from './htmlImages';
import { placeProblems, type ImagesSpec } from './imageAdvice';
import { readCategoriesFile, planCategories, CATEGORIES_FILE, type RemoteTerm } from './categories';

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
    return errorOutput(e);
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
    return errorOutput(e);
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
  // A component's local image: left empty for the server check (checked locally, uploaded on push).
  for (const leaf of walkConfigImages(clone, identOf(clone))) {
    if (!isLocalImage(leaf.value)) continue;
    strippedPaths.add(leaf.path);
    leaf.set('');
  }
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
  const site = await loadSiteSchema(c);
  const local = await localCheckProduct(
    product,
    baseDir,
    site.images as ImagesSpec | undefined,
    site.blocks?.components,
  );
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

/** One error per file that shares its `id` with another local file: pushing both would overwrite each other. */
async function duplicateIdErrors(dir: string): Promise<Map<string, ValidationError>> {
  const byId = new Map<number, string[]>();
  for (const { fileKey, product } of await loadProducts(dir)) {
    if (typeof product.id === 'number') byId.set(product.id, [...(byId.get(product.id) ?? []), fileKey]);
  }
  const out = new Map<string, ValidationError>();
  for (const [id, keys] of byId) {
    if (keys.length < 2) continue;
    for (const key of keys) {
      out.set(key, {
        path: `${key}.id`,
        code: 'duplicate_id',
        message: `Files ${keys.map(k => `products/${k}.json`).join(', ')} are all product ${id}. Merge them into one file and delete the others.`,
        fix: 'ai',
      });
    }
  }
  return out;
}

export async function cmdCheck(ctx: CmdCtx): Promise<unknown> {
  const only = ctx.flags.get('only')?.split(',').filter(Boolean);
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results: CheckResult[] = [];
    const dups = await duplicateIdErrors(ctx.dir);
    for (const item of loaded) {
      const r = await checkOne(c, item, ctx.dir, tpl);
      const dup = dups.get(item.fileKey);
      results.push(dup ? { ...r, errors: [dup, ...r.errors] } : r);
    }
    const ok = results.every(r => r.errors.length === 0);
    return { ok, results };
  } catch (e) {
    return errorOutput(e);
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
  if (local.seo !== undefined) {
    const remoteSeo = (remote.seo ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(local.seo)) if (!eq(v, remoteSeo[k])) mismatches.push(`seo.${k} mismatch`);
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
  if (local.detail !== undefined) {
    const localBlocks = detailBlocks(local, '').map(w => w.block);
    const remoteBlocks = (remote.detail as { blocks?: DetailBlock[] } | undefined)?.blocks ?? [];
    // A legacy file changes only its component block; compare that one.
    const remoteSig = blockSignature(
      local.detail.blocks ? remoteBlocks : remoteBlocks.filter(b => b.type === 'config'),
    );
    const localSig = blockSignature(localBlocks);
    if (!(local.detail.blocks ? eq(localSig, remoteSig) : remoteSig.includes(localSig[0]))) {
      mismatches.push(`detail blocks mismatch: expected ${JSON.stringify(localSig)}, got ${JSON.stringify(remoteSig)}`);
    }
  }
  void expectedStatus;
  return mismatches;
}

/** Strip `file`/local-only fields from a (post-upload) product before sending it to upsert/validate. */
function toWirePayload(product: ProductFile): Record<string, unknown> {
  const clone: ProductFile = JSON.parse(JSON.stringify(product));
  delete clone.sample;
  for (const { ref } of walkImageRefs(clone)) {
    delete ref.file;
  }
  return clone as unknown as Record<string, unknown>;
}

interface PreparedWire {
  /** The product as sent: images uploaded and referenced by mediaId, status only when publishing. */
  wire: ProductFile;
  uploaded: number;
  reused: number;
  errors: ValidationError[];
  /** From the check. */
  warnings: ValidationError[];
  /** A status "publish" left out because this is not `products publish`. */
  statusWarnings: ValidationError[];
}

/** What push and preview share: check the file, then upload its local images (on a clone). */
async function prepareWire(
  c: AgentClient,
  loaded: LoadedProduct,
  ctx: CmdCtx,
  cache: Record<string, { mediaId: number; url: string }>,
  tpl: SampleCtx,
  allowPublish: boolean,
): Promise<PreparedWire> {
  const { product } = loaded;
  const checkOutcome = await checkOne(c, loaded, ctx.dir, tpl);
  if (checkOutcome.errors.length) {
    return {
      wire: product,
      uploaded: 0,
      reused: 0,
      errors: checkOutcome.errors,
      warnings: checkOutcome.warnings,
      statusWarnings: [],
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
  for (const leaf of walkConfigImages(wire, identOf(product))) {
    if (!isLocalImage(leaf.value)) continue;
    try {
      const res = await resolveUpload(c, cache, resolve(ctx.dir, leaf.value));
      if (res.reused) reused++;
      else uploaded++;
      leaf.set(res.url);
    } catch (e) {
      uploadErrors.push({
        path: leaf.path,
        code: 'error',
        message: e instanceof Error ? e.message : String(e),
        fix: 'ai',
      });
    }
  }
  for (const { path: blockPath, block } of detailBlocks(wire, identOf(product))) {
    if (block.type !== 'static') continue;
    try {
      const up = await uploadHtmlImages(c, cache, block.html, ctx.dir);
      block.html = up.html;
      uploaded += up.uploaded.length;
      reused += up.reused;
    } catch (e) {
      uploadErrors.push({
        path: `${blockPath}.html`,
        code: e instanceof MissingImageError ? 'not_found' : 'error',
        message:
          e instanceof MissingImageError
            ? `${e.message} Image paths in static HTML are relative to the working folder.`
            : String(e instanceof Error ? e.message : e),
        fix: 'ai',
      });
    }
  }
  return {
    wire,
    uploaded,
    reused,
    errors: uploadErrors,
    warnings: checkOutcome.warnings,
    statusWarnings,
  };
}

async function pushOne(
  c: AgentClient,
  loaded: LoadedProduct,
  ctx: CmdCtx,
  cache: Record<string, { mediaId: number; url: string }>,
  allowPublish: boolean,
  tpl: SampleCtx,
  editLive: boolean,
): Promise<PushOneResult> {
  const { product } = loaded;
  if (!editLive && (await isLive(c, product))) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded: 0,
      reused: 0,
      errors: [
        {
          path: identOf(product),
          code: 'live_locked',
          fix: 'ai',
          message: liveLockedMessage('product', 'products'),
        },
      ],
      warnings: [],
    };
  }
  const prep = await prepareWire(c, loaded, ctx, cache, tpl, allowPublish);
  const { wire, uploaded, reused } = prep;
  if (prep.errors.length) {
    return {
      key: product.key ?? null,
      id: product.id ?? null,
      ok: false,
      uploaded,
      reused,
      errors: prep.errors,
      warnings: prep.warnings,
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
      warnings: prep.warnings,
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
      warnings: prep.warnings,
    };
  }

  // Write back id/key/baseModified into the ORIGINAL local file (keeping its `file` refs, per spec —
  // the on-disk product still names the local image, not the mediaId we resolved for the wire payload).
  product.id = upsertRes.id;
  if (upsertRes.key) product.key = upsertRes.key;
  product.baseModified = upsertRes.modifiedGmt;
  await writeProduct(ctx.dir, loaded.fileKey, product);

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
    warnings: [...prep.warnings, ...prep.statusWarnings],
  };
}

/** Published (or scheduled) on the site. A product not on the site yet is not live. */
async function isLive(c: AgentClient, product: ProductFile): Promise<boolean> {
  if (product.id) {
    try {
      return isLiveStatus((await c.getProduct<{ status?: string }>(product.id)).status);
    } catch (e) {
      if (e instanceof AgentHttpError && e.status === 404) return false;
      throw e;
    }
  }
  if (!product.key) return false;
  const found = await c.listProducts<{ items: Array<{ status: string }> }>({ key: product.key });
  return isLiveStatus(found.items[0]?.status);
}

export async function cmdPush(ctx: CmdCtx, allowPublish = false): Promise<unknown> {
  const only = ctx.flags.get('only')?.split(',').filter(Boolean);
  // --customer-said on push: the go-ahead to change the live products named with --only, in this run only.
  // (publish passes its own --customer-said, which is about publishing, not about changing live products.)
  const said = allowPublish ? undefined : customerSaid(ctx);
  if (said && !only?.length)
    return {
      ok: false,
      code: 'usage',
      fix: 'ai',
      message: 'With --customer-said, name the live products the customer agreed to change: --only k1,k2.',
    };
  const loaded = await loadProducts(ctx.dir, only);
  if (!loaded.length) return { ok: true, results: [] };
  try {
    const c = await client(ctx);
    const cache = await readUploadsCache(ctx.dir, c.siteUrl);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const editLive = !!said || (await editLiveAllowed(ctx.dir, c.siteUrl));
    const results: PushOneResult[] = [];
    const dups = await duplicateIdErrors(ctx.dir);
    for (const item of loaded) {
      const dup = dups.get(item.fileKey);
      if (dup) {
        results.push({
          key: item.product.key ?? null,
          id: item.product.id ?? null,
          ok: false,
          uploaded: 0,
          reused: 0,
          errors: [dup],
          warnings: [],
        });
        continue;
      }
      results.push(await pushOne(c, item, ctx, cache, allowPublish, tpl, editLive));
      await writeUploadsCache(ctx.dir, c.siteUrl, cache); // persist as we go — an early failure shouldn't lose earlier uploads' cache entries
    }
    const ok = results.every(r => r.ok);
    return { ok, results };
  } catch (e) {
    return errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// preview
// ---------------------------------------------------------------------------

interface PreviewOneResult {
  key: string | null;
  id: number | null;
  ok: boolean;
  previewUrl?: string;
  /** Changes the preview page can't show (a new category, SEO): tell the customer in words. */
  notShown?: string[];
  errors: ValidationError[];
  warnings: ValidationError[];
}

/** Shows products already on the site as a push would change them, without writing them: images are uploaded
 *  (push reuses them), the product is not touched. Works on live products with no --customer-said. */
export async function cmdPreview(ctx: CmdCtx): Promise<unknown> {
  const keys = ctx.positional;
  if (!keys.length) return { ok: false, code: 'usage', fix: 'ai', message: 'usage: puffergo products preview <key…>' };
  const loaded = await loadProducts(ctx.dir, keys);
  const missing = keys.filter(k => !loaded.some(l => l.fileKey === k));
  if (missing.length)
    return { ok: false, code: 'not_found', message: `No local file products/<key>.json for: ${missing.join(', ')}.` };
  try {
    const c = await client(ctx);
    const cache = await readUploadsCache(ctx.dir, c.siteUrl);
    const tpl = await SampleCtx.load(c, ctx.dir);
    const results: PreviewOneResult[] = [];
    for (const item of loaded) {
      results.push(await previewOne(c, item, ctx, cache, tpl));
      await writeUploadsCache(ctx.dir, c.siteUrl, cache);
    }
    return { ok: results.every(r => r.ok), results };
  } catch (e) {
    return errorOutput(e);
  }
}

async function previewOne(
  c: AgentClient,
  loaded: LoadedProduct,
  ctx: CmdCtx,
  cache: Record<string, { mediaId: number; url: string }>,
  tpl: SampleCtx,
): Promise<PreviewOneResult> {
  const { product } = loaded;
  const failed = (errors: ValidationError[], warnings: ValidationError[] = []): PreviewOneResult => ({
    key: product.key ?? null,
    id: product.id ?? null,
    ok: false,
    errors,
    warnings,
  });
  const prep = await prepareWire(c, loaded, ctx, cache, tpl, false);
  if (prep.errors.length) return failed(prep.errors, prep.warnings);
  try {
    const res = await c.previewProduct<{
      ok: boolean;
      id?: number;
      previewUrl?: string;
      notShown?: string[];
      errors?: ValidationError[];
      warnings?: ValidationError[];
    }>(toWirePayload(prep.wire));
    if (!res.ok) return failed(res.errors ?? [], res.warnings ?? prep.warnings);
    return {
      key: product.key ?? null,
      id: res.id ?? product.id ?? null,
      ok: true,
      previewUrl: res.previewUrl,
      notShown: res.notShown ?? [],
      errors: [],
      warnings: res.warnings ?? prep.warnings,
    };
  } catch (e) {
    if (!(e instanceof AgentHttpError)) throw e;
    const body = (e.body ?? {}) as { code?: string; message?: string };
    if (body.code && ABILITIES_MISSING.has(body.code)) throw new PluginOutdatedError();
    return failed([
      {
        path: identOf(product),
        code: body.code ?? `http_${e.status}`,
        message: body.message ?? `HTTP ${e.status}`,
        fix: 'ai',
      },
    ]);
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
    const { link, editUrl, ...remote } = await c.getProduct<
      ProductFile & { key: string | null; link?: string; editUrl?: string }
    >(id);
    const existing = await loadProducts(ctx.dir);
    // A product without a key on the site keeps the local file it already has, so a pull never makes a second one.
    let key = remote.key ?? existing.find(p => p.product.id === id)?.fileKey;
    if (!key) key = deriveKeyFromTitle(remote.title, new Set(existing.map(p => p.fileKey)));
    // `sample` lives only in the local file — keep it across a pull.
    const sample = existing.find(p => p.fileKey === key)?.product.sample;
    const product: ProductFile = { ...remote, key, ...(sample ? { sample } : {}) };
    await writeProduct(ctx.dir, key, product);
    return {
      ok: true,
      key,
      id,
      path: `products/${key}.json`,
      link,
      editUrl,
      hint: 'pull is for editing THIS product. If the customer wants new products to look like it, run `products sample set <type name> <this link or id>` instead.',
    };
  } catch (e) {
    return errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// publish
// ---------------------------------------------------------------------------

export async function cmdPublish(ctx: CmdCtx): Promise<unknown> {
  const keys = ctx.positional;
  if (!keys.length) {
    return {
      ok: false,
      code: 'error',
      message: 'usage: puffergo products publish <key…> --customer-said "<the customer\'s exact words>"',
    };
  }
  const refused = publishRefusal(ctx, 'product');
  if (refused) return refused;
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
    if (e instanceof AgentHttpError && e.status === 404)
      return { ok: false, code: 'not_found', message: 'That product no longer exists on the site.' };
    return errorOutput(e);
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
    if (errors.length) return { ok: false, code: 'invalid', errors, warnings };
    // Switch off (default): existing categories are left alone, only missing ones are created.
    const editLive = await editLiveAllowed(ctx.dir, c.siteUrl);
    const todo = ops.filter(o => o.op === 'create' || (o.op === 'update' && editLive));
    const leftAlone = editLive ? [] : ops.filter(o => o.op === 'update').map(o => o.slug);
    const out = {
      ok: true,
      changes: todo.map(o => ({ op: o.op, slug: o.slug })),
      ...(leftAlone.length
        ? {
            leftAlone,
            leftAloneNote:
              'These categories already exist on the site and differ from categories.json; they were not changed. The customer can change them in wp-admin, or tell you to turn on editing live content (`products edit-live on --customer-said "…"`).',
          }
        : {}),
      warnings,
    };
    if (sub === 'check') return out;

    const idBySlug = new Map(remote.map(t => [t.slug, t.id]));
    for (const o of todo) {
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
    return out;
  } catch (e) {
    if (e instanceof SyntaxError)
      return { ok: false, code: 'invalid_json', message: `${CATEGORIES_FILE}: ${e.message}` };
    return errorOutput(e);
  }
}

// ---------------------------------------------------------------------------
// images <file|folder…> — look over the customer's photos as soon as they arrive
// ---------------------------------------------------------------------------

export async function cmdImages(ctx: CmdCtx): Promise<unknown> {
  if (!ctx.positional.length)
    return { ok: false, code: 'usage', message: 'usage: puffergo products images <file or folder>…' };
  try {
    const c = await client(ctx);
    const spec = (await loadSiteSchema(c)).images as ImagesSpec | undefined;
    if (!spec) return { ok: false, code: 'update_plugin', message: 'The site plugin is too old to give image specs.' };
    const files: string[] = [];
    for (const p of ctx.positional) {
      const abs = resolve(ctx.dir, p);
      const st = await stat(abs);
      if (st.isDirectory()) files.push(...(await readdir(abs)).filter(n => !n.startsWith('.')).map(n => join(abs, n)));
      else files.push(abs);
    }
    const images = [];
    for (const abs of files) {
      const bytes = await readFile(abs);
      const { format, width, height } = sniffImage(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));
      if (!format || width == null || height == null) continue;
      const info = { bytes: bytes.length, width, height };
      const fits = Object.entries(spec.places)
        .filter(([place, s]) => placeProblems({ ...info, bytes: 0 }, place, s, spec.maxBytes).length === 0)
        .map(([place]) => place);
      images.push({
        file: relative(ctx.dir, abs),
        sizeKB: Math.round(bytes.length / 1024),
        width,
        height,
        overLimit: bytes.length > spec.maxBytes,
        fits,
      });
    }
    return {
      ok: true,
      note: `Tell the customer now, in one message: which photos are over ${Math.round(spec.maxBytes / 1024)}KB, and which don't fit where they are meant to go (fits lists the places whose size and shape already match). Give the cropUrl of that place; the tool crops, resizes and compresses in one go. The customer may also keep them as they are.`,
      places: spec.places,
      images,
    };
  } catch (e) {
    return errorOutput(e);
  }
}
