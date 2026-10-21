import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fixtureEnv = { DEX_SOURCE: 'test/fixtures/tasks.jsonl', DOCS_SOURCE: 'test/fixtures/rocco', VERCEL_ENV: 'production' };

function build(env) {
  execFileSync('pnpm', ['exec', 'astro', 'build'], { stdio: 'inherit', env: { ...process.env, ...fixtureEnv, ...env } });
}

function fail(message) {
  console.error(`smoke: ${message}`);
  process.exit(1);
}

function check(condition, message) {
  if (!condition) fail(message);
}

const read = (path) => readFileSync(join('dist', path), 'utf8');

const outputFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? outputFiles(path) : [path];
  });

build({ POSTS_DIR: 'test/fixtures/posts' });

for (const path of [
  'index.html',
  'devlog/index.html',
  'devlog/published-post/index.html',
  'devlog/type/deep-dive/index.html',
  'devlog/type/announcement/index.html',
  'projects/index.html',
  'projects/rocco/index.html',
  'rss.xml',
  'sitemap-index.xml',
  'projects/rocco/docs/index.html',
  'projects/rocco/docs/install/index.html',
  'projects/rocco/docs/calls/index.html',
  'projects/rocco/docs/tutorial/index.html',
  'projects/rocco/docs/tutorial/01-cube/index.html',
  'projects/rocco/docs/images/cube.png',
  'projects/rocco/api/index.html',
  'projects/rocco/api/platform/index.html',
  'projects/rocco/api/fonts/ibm-plex-mono-latin-400-normal.woff2',
]) {
  check(existsSync(join('dist', path)), `missing dist/${path}`);
}

check(!existsSync('dist/devlog/draft-post'), 'a draft page was built');
const everything = outputFiles('dist')
  .filter((f) => /\.(html|xml)$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');
check(!everything.includes('Draft post title'), 'a draft title appears in the production output');
check(read('rss.xml').includes('Published post title'), 'rss.xml lacks the published post');
check(read('devlog/type/deep-dive/index.html').includes('Published post title'), '/devlog/type/deep-dive/ lacks the deep dive post');
check(read('devlog/type/announcement/index.html').includes('nothing published yet'), 'an empty type page lacks the empty state');
check(read('index.html').includes('stage 3/7'), 'the homepage does not show stage 3/7');
for (const page of [
  'index.html',
  'devlog/index.html',
  'projects/index.html',
  'projects/rocco/index.html',
  'devlog/published-post/index.html',
  'projects/rocco/docs/index.html',
  'projects/rocco/docs/install/index.html',
  'projects/rocco/api/index.html',
]) {
  check((read(page).match(/<h1[\s>]/g) ?? []).length === 1, `dist/${page} does not have exactly one <h1>`);
}
check(/<span[^>]*id="copy-status"[^>]*aria-live="polite"|<span[^>]*aria-live="polite"[^>]*id="copy-status"/.test(read('devlog/published-post/index.html')), 'the post page lacks the copy-status live region');

const install = read('projects/rocco/docs/install/index.html');
check(install.includes('href="/projects/rocco/docs/tutorial/01-cube/"'), 'install does not link to the chapter route');
check(install.includes('src="/projects/rocco/docs/images/cube.png"'), 'install does not point its image at the copied file');
check(install.includes('{{platform_url}}'), 'a checkout build replaced a marker');
check(install.indexOf('>Install and first run<') < install.indexOf('>The five calls<'), 'the sidebar is not sorted by order');
check(read('projects/rocco/api/platform/styles.css').includes("font-family: 'IBM Plex Mono'"), 'the API stylesheet lacks the override');
check(read('projects/rocco/api/platform/index.html') === readFileSync('test/fixtures/rocco/build/docs/platform/index.html', 'utf8'), 'the API HTML changed on the way');
check(read('projects/rocco/index.html').includes('href="/projects/rocco/docs/"'), 'the rocco page does not link to the docs');
check(read('projects/rocco/index.html').includes('href="/projects/rocco/api/"'), 'the rocco page does not link to the API');

build({ POSTS_DIR: 'test/fixtures/empty-posts' });

check(read('index.html').includes('nothing published yet'), 'the homepage lacks the empty state');
check(read('devlog/index.html').includes('nothing published yet'), '/devlog/ lacks the empty state');
check(read('rss.xml').includes('<channel>'), 'rss.xml is not a feed');

console.log('smoke: ok');
