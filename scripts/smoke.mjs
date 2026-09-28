import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const fixtureEnv = { DEX_SOURCE: 'test/fixtures/tasks.jsonl', VERCEL_ENV: 'production' };

function build(env) {
  execFileSync('npx', ['astro', 'build'], { stdio: 'inherit', env: { ...process.env, ...fixtureEnv, ...env } });
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
  'devlog/m3/index.html',
  'projects/index.html',
  'projects/rocco/index.html',
  'rss.xml',
  'sitemap-index.xml',
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
check(read('index.html').includes('stage 3/7'), 'the homepage does not show stage 3/7');

build({ POSTS_DIR: 'test/fixtures/empty-posts' });

check(read('index.html').includes('nothing published yet'), 'the homepage lacks the empty state');
check(read('devlog/index.html').includes('nothing published yet'), '/devlog/ lacks the empty state');
check(read('rss.xml').includes('<channel>'), 'rss.xml is not a feed');

console.log('smoke: ok');
