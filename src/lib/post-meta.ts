export const POST_TYPES = [
  { slug: 'announcement', label: 'announcement' },
  { slug: 'walkthrough', label: 'walkthrough' },
  { slug: 'deep-dive', label: 'deep dive' },
  { slug: 'notes', label: 'notes' },
] as const;

export type PostType = (typeof POST_TYPES)[number]['slug'];

export const POST_TYPE_SLUGS = POST_TYPES.map((t) => t.slug) as [PostType, ...PostType[]];

export type PostData = {
  title: string;
  date: Date;
  summary: string;
  project: string;
  type: PostType;
  commits: string[];
  draft: boolean;
};

export type PostLike = { id: string; data: PostData };

const REPO_URL = 'https://github.com/Pixelsprout/rocco-engine';

export function showDrafts(env: { dev: boolean; vercelEnv?: string }): boolean {
  return env.dev || env.vercelEnv === 'preview';
}

export function slugOf(post: PostLike): string {
  return post.id.split('/').pop()!;
}

export function typeLabel(type: PostType): string {
  return POST_TYPES.find((t) => t.slug === type)!.label;
}

export function tagOf(post: PostLike): string {
  return typeLabel(post.data.type);
}

export function commitUrl(hash: string): string {
  return `${REPO_URL}/commit/${hash}`;
}

export function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function visiblePosts<T extends PostLike>(posts: T[], drafts: boolean): T[] {
  return posts
    .filter((p) => drafts || !p.data.draft)
    .sort((a, b) => b.data.date.getTime() - a.data.date.getTime() || a.id.localeCompare(b.id));
}

export function assertPosts(posts: PostLike[]): void {
  const seen = new Map<string, string>();
  for (const post of posts) {
    const slug = slugOf(post);
    const other = seen.get(slug);
    if (other) throw new Error(`Posts ${other} and ${post.id} share the slug "${slug}"`);
    seen.set(slug, post.id);
  }
}

// The growth line compares against published posts only, so a preview shows what production will.
export function previousPublished<T extends PostLike>(newestFirst: T[], index: number): T | undefined {
  return newestFirst.slice(index + 1).find((p) => !p.data.draft);
}
