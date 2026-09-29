import { describe, expect, it } from 'vitest';
import {
  assertPosts, commitUrl, formatDate, POST_TYPES, previousPublished, showDrafts, slugOf, tagOf, visiblePosts, type PostLike,
} from '../src/lib/post-meta';

function post(id: string, date: string, extra: Partial<PostLike['data']> = {}): PostLike {
  return { id, data: { title: id, date: new Date(date), summary: 's', project: 'rocco', type: 'notes', commits: [], draft: false, ...extra } };
}

describe('showDrafts', () => {
  it('shows drafts in dev and on preview deployments only', () => {
    expect(showDrafts({ dev: true })).toBe(true);
    expect(showDrafts({ dev: false, vercelEnv: 'preview' })).toBe(true);
    expect(showDrafts({ dev: false, vercelEnv: 'production' })).toBe(false);
    expect(showDrafts({ dev: false })).toBe(false);
  });
});

describe('slugs, tags and links', () => {
  it('uses the file name as the slug', () => {
    expect(slugOf(post('rocco/mesh-handles', '2026-09-28'))).toBe('mesh-handles');
  });

  it('tags a post with the label of its type', () => {
    expect(tagOf(post('a', '2026-09-28', { type: 'deep-dive' }))).toBe('deep dive');
    expect(tagOf(post('a', '2026-09-28', { type: 'walkthrough' }))).toBe('walkthrough');
  });

  it('gives every type a unique slug and label', () => {
    expect(POST_TYPES.map((t) => t.slug)).toEqual(['announcement', 'walkthrough', 'deep-dive', 'notes']);
    expect(new Set(POST_TYPES.map((t) => t.label)).size).toBe(POST_TYPES.length);
  });

  it('links a commit on GitHub', () => {
    expect(commitUrl('9039d52')).toBe('https://github.com/Pixelsprout/rocco-engine/commit/9039d52');
  });

  it('formats dates in UTC', () => {
    expect(formatDate(new Date('2026-09-28T23:30:00.000Z'))).toBe('2026-09-28');
  });
});

describe('visiblePosts', () => {
  const posts = [
    post('rocco/b', '2026-09-28'),
    post('rocco/old', '2026-09-22'),
    post('rocco/draft', '2026-09-30', { draft: true }),
    post('rocco/a', '2026-09-28'),
  ];

  it('hides drafts and sorts newest first, ties by id', () => {
    expect(visiblePosts(posts, false).map((p) => p.id)).toEqual(['rocco/a', 'rocco/b', 'rocco/old']);
  });

  it('includes drafts when asked', () => {
    expect(visiblePosts(posts, true).map((p) => p.id)).toEqual(['rocco/draft', 'rocco/a', 'rocco/b', 'rocco/old']);
  });
});

describe('assertPosts', () => {
  it('accepts posts with unique slugs', () => {
    expect(() => assertPosts([post('rocco/a', '2026-09-28'), post('rocco/b', '2026-09-28')])).not.toThrow();
  });

  it('names both files when two posts share a slug', () => {
    expect(() => assertPosts([post('rocco/intro', '2026-09-28'), post('other/intro', '2026-09-28')])).toThrow(
      'Posts rocco/intro and other/intro share the slug "intro"',
    );
  });
});

describe('previousPublished', () => {
  const posts = [
    post('rocco/new', '2026-09-30'),
    post('rocco/draft', '2026-09-29', { draft: true }),
    post('rocco/old', '2026-09-28'),
  ];

  it('skips drafts to find the older published post', () => {
    expect(previousPublished(posts, 0)).toEqual(posts[2]);
  });

  it('returns undefined for the oldest post', () => {
    expect(previousPublished(posts, 2)).toBeUndefined();
  });
});
