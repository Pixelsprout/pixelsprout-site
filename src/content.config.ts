import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { dexLoader } from './loaders/dex';

const posts = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: process.env.POSTS_DIR ?? './src/content/posts' }),
  schema: z.object({
    title: z.string(),
    date: z.coerce.date(),
    summary: z.string(),
    project: z.string().default('rocco'),
    milestone: z.number().int().min(1).optional(),
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

export const collections = { posts, garden };
