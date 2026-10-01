/**
 * preview.ts — LOCAL PREVIEW rendering only. This is NOT part of the transport channel: bodies travel
 * as Markdown both ways (the plugin owns the one Markdown→blocks compiler). A preview panel that shows
 * an unpushed local note in an iframe still needs HTML, and on the Obsidian host that note never goes
 * near WordPress — so this tiny marked wrapper renders it locally. Nothing here may ever be used to
 * build a body that gets pushed.
 */

import { marked } from 'marked';

/** Render a Markdown body to simple HTML for a local preview iframe. Empty input → ''. */
export function renderLocalPreviewHtml(md: string): string {
  const trimmed = md.trim();
  if (!trimmed) return '';
  return marked.parse(trimmed, { async: false }) as string;
}
