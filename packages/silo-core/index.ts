/**
 * @puffergo/silo-core — framework-agnostic core for the SEO Silo content manager.
 * Contains the data model, WP REST client, sync state machine and converters. Hosts (the browser
 * extension today, an Obsidian plugin later) supply StoragePort / NetworkPort / view adapters.
 */

export * from './lib/model/types';
export * from './lib/model/factory';
export * from './lib/model/migrate';
export * from './lib/model/graph';
export * from './lib/model/layout';
export * from './lib/model/health';
export { applySeoLimits, seoWidth, type SeoLimits } from './lib/model/seo-limits';
export * from './lib/model/content-score';
export * from './lib/model/connect';
export * from './lib/model/selectors';
export * from './lib/model/keywords';
export * from './lib/model/libraries';
export * from './lib/model/mutations';
export * from './lib/ports/storage';
export * from './lib/ports/network';
export * from './lib/wp/client';
export * from './lib/wp/parse-links';
export * from './lib/content/body-codec';
export * from './lib/sync/sync-content';
export * from './lib/sync/import-content';
export * from './lib/vault/frontmatter';
export * from './lib/vault/note-links';
export * from './lib/vault/adopt';
