import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { getPosts } from '../lib/content';
import { slugOf } from '../lib/post-meta';

export async function GET(context: APIContext) {
  const posts = (await getPosts()).filter((p) => !p.data.draft);
  return rss({
    title: 'pixelsprout devlog',
    description: 'Notes from building rocco, a 3D engine in Odin that runs games written in Roc.',
    site: context.site!,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.summary,
      link: `/devlog/${slugOf(post)}/`,
    })),
  });
}
