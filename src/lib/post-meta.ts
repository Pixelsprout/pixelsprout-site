export type PostData = {
  title: string;
  date: Date;
  summary: string;
  project: string;
  milestone?: number;
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

export function tagOf(post: PostLike): string {
  return post.data.milestone ? `m${post.data.milestone}` : 'notes';
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

export function assertPosts(posts: PostLike[], milestoneNumbers: number[]): void {
  const seen = new Map<string, string>();
  for (const post of posts) {
    const slug = slugOf(post);
    const other = seen.get(slug);
    if (other) throw new Error(`Posts ${other} and ${post.id} share the slug "${slug}"`);
    seen.set(slug, post.id);
    const { milestone } = post.data;
    if (milestone !== undefined && !milestoneNumbers.includes(milestone)) {
      throw new Error(`Post ${post.id} names milestone ${milestone}, which dex does not have`);
    }
  }
}
