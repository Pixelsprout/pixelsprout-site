import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const css = read('src/styles/global.css');

function rule(selector: string): string {
  const match = new RegExp(`(^|\\n)${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`no rule for ${selector}`);
  return match[2];
}

describe('tap targets', () => {
  it('gives the .tap utility and the copy button a 44px minimum height', () => {
    expect(rule('.tap')).toMatch(/min-height:\s*44px/);
    expect(rule('.copy')).toMatch(/min-height:\s*44px/);
  });

  const smallLinks: [string, RegExp][] = [
    ['src/components/PostAside.astro', /<a class="(?:hash )?tap[^"]*" href=\{commitUrl/],
    ['src/components/PostAside.astro', /<a class="tap" href=\{`#\$\{h\.slug\}`\}/],
    ['src/components/SiteFooter.astro', /<a class="tap" href="\/rss\.xml"/],
    ['src/components/SiteFooter.astro', /<a class="tap" href="https:\/\/github\.com\/Pixelsprout"/],
    ['src/pages/index.astro', /<a class="more tap" href="\/devlog\/"/],
    ['src/pages/index.astro', /<a class="tap" href=\{`\/devlog\/\$\{slugOf\(latest\)\}\/`\}/],
  ];
  for (const [file, pattern] of smallLinks) {
    it(`uses .tap on ${pattern.source.slice(0, 40)} in ${file}`, () => {
      expect(read(file)).toMatch(pattern);
    });
  }
});
