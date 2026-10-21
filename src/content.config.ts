import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { dexLoader } from './loaders/dex';
import { docsLoader } from './loaders/docs';
import { POST_TYPE_SLUGS } from './lib/post-meta';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: process.env.POSTS_DIR ?? './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    project: z.string().default('rocco'),
    type: z.enum(POST_TYPE_SLUGS),
    // YAML reads an unquoted hash like 56166e1 as a number, so hashes must be quoted.
    commits: z
      .array(z.string({ error: 'Quote each commit hash, for example commits: ["56166e1"]' }).regex(/^[0-9a-f]{7,40}$/))
      .default([]),
    draft: z.boolean().default(false),
  }),
});

const task = z.object({ name: z.string(), completed: z.boolean(), completedAt: z.date().nullable() });

const garden = defineCollection({
  loader: dexLoader(),
  schema: z.object({
    kind: z.enum(['milestone', 'side']),
    number: z.number().int().optional(),
    title: z.string(),
    completed: z.boolean(),
    completedAt: z.date().nullable(),
    tasks: z.array(task),
  }),
});

// One entry per guide page, and one source entry that says where the pages came from.
const docs = defineCollection({
  loader: docsLoader(),
  schema: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page'), path: z.string(), title: z.string(), summary: z.string(), order: z.number() }),
    z.object({ kind: z.literal('source'), origin: z.string(), ref: z.string().nullable(), api: z.array(z.string()) }),
  ]),
});

export const collections = { posts, garden, docs };
