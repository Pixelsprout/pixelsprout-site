import type { Loader } from 'astro/loaders';
import { parseDex } from '../lib/dex';
import { readDexSource } from '../lib/dex-source';

export function dexLoader(): Loader {
  return {
    name: 'dex',
    load: async ({ store, parseData, logger }) => {
      const { text, origin } = await readDexSource({
        source: process.env.DEX_SOURCE,
        token: process.env.GITHUB_TOKEN,
      });
      const entries = parseDex(text);
      store.clear();
      for (const { id, ...data } of entries) {
        store.set({ id, data: await parseData({ id, data }) });
      }
      logger.info(`Loaded ${entries.length} garden entries from ${origin}`);
    },
  };
}
