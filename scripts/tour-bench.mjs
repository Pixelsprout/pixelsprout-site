// The Tour load and memory bench. It drives a Tour step in headless Chrome over CDP.
//
//   node scripts/tour-bench.mjs <Tour step URL> [--runs 10] [--json out.json]
//
// CHROME names the Chrome binary. The budgets assume desktop Chrome at 50 Mbps, so the
// bench throttles the network to that. Point it at a real deploy for numbers that mean
// something; a local server has no CDN, TLS or real latency.
import { execFileSync, spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

const MIB = 1024 * 1024;
const BUDGETS = { coldMs: 3000, repeatMs: 1500, hotRunMs: 250, newPreviewRunMs: 400, workerBytes: 1024 * MIB, visitBytes: 1024 * MIB };
const NETWORK = { offline: false, latency: 20, downloadThroughput: (50e6 / 8), uploadThroughput: (10e6 / 8) };

const { positionals, values } = parseArgs({ allowPositionals: true, options: { runs: { type: 'string', default: '10' }, json: { type: 'string' } } });
const [pageUrl] = positionals;
if (!pageUrl) {
  console.error('usage: node scripts/tour-bench.mjs <Tour step URL> [--runs 10] [--json out.json]');
  process.exit(2);
}
const runs = Number(values.runs);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const chromePath = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profile = mkdtempSync(join(tmpdir(), 'tour-bench-'));
const chrome = spawn(chromePath, [
  `--user-data-dir=${profile}`, '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  '--window-size=1400,900', '--headless=new', '--enable-unsafe-webgpu', 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });
let stderr = '';
const browserWs = await new Promise((resolve, reject) => {
  chrome.stderr.on('data', (data) => {
    stderr += data;
    const match = stderr.match(/DevTools listening on (ws:\S+)/);
    if (match) resolve(match[1]);
  });
  chrome.on('exit', () => reject(new Error(stderr)));
});

// Whole-visit memory: the summed RSS of Chrome's process tree, sampled every 200 ms.
function chromeRss() {
  const rows = execFileSync('ps', ['-A', '-o', 'pid=,ppid=,rss='], { encoding: 'utf8' })
    .trim().split('\n').map((line) => line.trim().split(/\s+/).map(Number));
  const tree = new Set([chrome.pid]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [pid, ppid] of rows) if (tree.has(ppid) && !tree.has(pid)) { tree.add(pid); grew = true; }
  }
  return rows.filter(([pid]) => tree.has(pid)).reduce((sum, [, , rss]) => sum + rss * 1024, 0);
}
let visitPeak = 0;
const sampler = setInterval(() => { visitPeak = Math.max(visitPeak, chromeRss()); }, 200);

const http = browserWs.replace(/^ws:/, 'http:').replace(/\/devtools\/.*/, '');
const target = (await (await fetch(`${http}/json`)).json()).find((t) => t.type === 'page');
const socket = new WebSocket(target.webSocketDebuggerUrl);
let nextId = 0;
let transferred = 0;
const waiting = new Map();
socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id !== undefined && waiting.has(message.id)) {
    waiting.get(message.id)(message);
    waiting.delete(message.id);
  } else if (message.method === 'Target.attachedToTarget') {
    // Workers fetch their own files, so they get the same network limits.
    send('Network.enable', {}, message.params.sessionId);
    send('Network.emulateNetworkConditions', NETWORK, message.params.sessionId);
  } else if (message.method === 'Network.loadingFinished') {
    transferred += message.params.encodedDataLength;
  }
});
await new Promise((resolve) => socket.addEventListener('open', resolve));
function send(method, params = {}, sessionId) {
  const id = nextId++;
  socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  return new Promise((resolve) => waiting.set(id, resolve));
}
const evaluate = async (expression) =>
  (await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })).result?.result?.value;
async function until(expression, ms) {
  const end = Date.now() + ms;
  for (;;) {
    const value = await evaluate(expression);
    if (value) return value;
    if (Date.now() > end) return null;
    await sleep(50);
  }
}

// The page sees the Preview's first frame as a rocco:ready message, and the compile worker's memory in its replies.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `if (window === window.top) {
  window.__bench = { ready: [], swapped: [], workerPeak: 0, workerReports: false };
  addEventListener('message', (e) => {
    if (e.data?.type === 'rocco:ready') __bench.ready.push(performance.now());
    if (e.data?.type === 'tour:swapped') __bench.swapped.push(performance.now());
  });
  const W = window.Worker;
  window.Worker = class extends W { constructor(...a) { super(...a); this.addEventListener('message', (e) => {
    if (typeof e.data?.memory === 'number') { __bench.workerReports = true; __bench.workerPeak = Math.max(__bench.workerPeak, e.data.memory); }
  }); } };
}` });
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.emulateNetworkConditions', NETWORK);
await send('Target.setAutoAttach', { autoAttach: true, waitForDebuggerOnStart: false, flatten: true });

const firstFrame = () => until(`window.__bench?.ready.length > 0 && Math.round(window.__bench.ready[0])`, 30000);

const report = { url: pageUrl, network: '50 Mbps down, 20 ms latency', runs };
await send('Network.clearBrowserCache');
await send('Page.navigate', { url: pageUrl });
report.coldMs = await firstFrame();
await sleep(1000);
report.coldBytes = transferred;
transferred = 0;
await send('Page.navigate', { url: pageUrl });
await sleep(100);
report.repeatMs = await firstFrame();
await sleep(1000);
report.repeatBytes = transferred;

// A Run of the same source compiles warm. Hot reload answers tour:swapped; a new Preview answers rocco:ready.
const hot = [];
const fresh = [];
for (let i = 0; i < runs; i++) {
  const before = await evaluate(`JSON.stringify([__bench.ready.length, __bench.swapped.length])`);
  const [readyCount, swappedCount] = JSON.parse(before);
  const clicked = await evaluate(`(() => { const t = performance.now(); document.querySelector('[data-action="run"]').click(); return t; })()`);
  const done = await until(`(__bench.swapped.length > ${swappedCount} && ['hot', __bench.swapped.at(-1)]) || (__bench.ready.length > ${readyCount} && ['new', __bench.ready.at(-1)])`, 10000);
  if (!done) continue;
  (done[0] === 'hot' ? hot : fresh).push(Math.round(done[1] - clicked));
  await sleep(300);
}
const median = (list) => (list.length ? [...list].sort((a, b) => a - b)[Math.floor(list.length / 2)] : null);
report.hotRunMs = median(hot);
report.newPreviewRunMs = median(fresh);
report.runSamples = { hot, fresh };
const worker = await evaluate(`({ reports: __bench.workerReports, peak: __bench.workerPeak })`);
report.workerPeakBytes = worker?.reports ? worker.peak : null;
await sleep(500);
clearInterval(sampler);
report.visitPeakBytes = visitPeak;

socket.close();
const exited = new Promise((resolve) => chrome.once('exit', resolve));
chrome.kill();
await exited;
rmSync(profile, { recursive: true, force: true, maxRetries: 5 });

const verdict = (value, budget) => (value === null ? 'not measured' : value <= budget ? 'ok' : 'MISSED');
const lines = [
  ['cold visit to first frame', report.coldMs, BUDGETS.coldMs, 'ms'],
  ['repeat visit to first frame', report.repeatMs, BUDGETS.repeatMs, 'ms'],
  ['warm Run, hot reload', report.hotRunMs, BUDGETS.hotRunMs, 'ms'],
  ['warm Run, new Preview', report.newPreviewRunMs, BUDGETS.newPreviewRunMs, 'ms'],
  ['compile worker peak memory', report.workerPeakBytes && Math.round(report.workerPeakBytes / MIB), BUDGETS.workerBytes / MIB, 'MiB'],
  ['whole-visit peak (Chrome RSS)', Math.round(report.visitPeakBytes / MIB), BUDGETS.visitBytes / MIB, 'MiB'],
];
console.log(`cold visit transferred ${Math.round(report.coldBytes / 1024)} KiB; repeat visit ${Math.round(report.repeatBytes / 1024)} KiB`);
for (const [name, value, budget, unit] of lines) {
  console.log(`${name.padEnd(30)} ${String(value ?? '-').padStart(6)} ${unit}  budget ${budget} ${unit}  ${verdict(value, budget)}`);
}
if (report.workerPeakBytes === null) console.log('The compile worker does not report memory, so the worker ceiling is not checked.');
if (values.json) writeFileSync(values.json, JSON.stringify(report, null, 2));
// Only the memory ceiling blocks the launch. A missed time budget is a bug to fix, not a failed bench.
if (report.workerPeakBytes !== null && report.workerPeakBytes > BUDGETS.workerBytes) process.exit(1);
