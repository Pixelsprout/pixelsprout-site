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
