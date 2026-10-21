// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import roc from './src/grammars/roc.tmLanguage.json' with { type: 'json' };
import { docsFiles } from './src/integrations/docs-files.ts';
import { codeFrame } from './src/lib/code-frame.mjs';
import { soil } from './src/styles/soil-theme.mjs';

export default defineConfig({
  site: 'https://pixelsprout.dev',
  integrations: [mdx(), sitemap(), docsFiles()],
  markdown: {
    shikiConfig: {
      theme: soil,
      langs: [{ ...roc, name: 'roc' }],
      transformers: [codeFrame],
    },
  },
});
