import { getCollection, type CollectionEntry } from 'astro:content';
import type { GardenEntry } from './dex';
import { assertPosts, showDrafts, visiblePosts } from './post-meta';

export type Post = CollectionEntry<'posts'>;

export async function getGarden(): Promise<GardenEntry[]> {
  const entries = await getCollection('garden');
  const order = (e: GardenEntry) => (e.kind === 'milestone' ? e.number! : Number.MAX_SAFE_INTEGER);
  return entries
    .map((e) => ({ id: e.id, ...e.data }))
    .sort((a, b) => order(a) - order(b) || a.title.localeCompare(b.title));
}

export async function getPosts(): Promise<Post[]> {
  const all = await getCollection('posts');
  assertPosts(all);
  return visiblePosts(all, showDrafts({ dev: import.meta.env.DEV, vercelEnv: process.env.VERCEL_ENV }));
}

type DocsEntry = CollectionEntry<'docs'>;
type PageData = Extract<DocsEntry['data'], { kind: 'page' }>;
type SourceData = Extract<DocsEntry['data'], { kind: 'source' }>;
export type DocsPage = DocsEntry & { data: PageData; slug: string; title: string; order: number };

export async function getDocs(): Promise<{ source: SourceData; pages: DocsPage[] }> {
  const entries = await getCollection('docs');
  const pages = entries
    .filter((e): e is DocsEntry & { data: PageData } => e.data.kind === 'page')
    .map((e) => ({ ...e, slug: e.id, title: e.data.title, order: e.data.order }));
  const source = entries.find((e) => e.data.kind === 'source')?.data as SourceData | undefined;
  if (!source) throw new Error('The docs collection has no source entry');
  return { source, pages };
}
