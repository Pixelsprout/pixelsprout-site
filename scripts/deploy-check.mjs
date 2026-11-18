import { createHash } from 'node:crypto';
import { request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';

export const ARTIFACTS_LIST = '/projects/rocco/tour/artifacts.json';
const IMMUTABLE = 'public, max-age=31536000, immutable';
const BR_TYPES = { '.wasm.br': 'application/wasm', '.data.br': 'application/octet-stream' };

// node:http, not fetch: fetch decodes the body and folds repeated headers, which hides a double encoding.
function get(url, headers) {
  const request = url.startsWith('https:') ? httpsRequest : httpRequest;
  return new Promise((resolve, reject) => {
    const req = request(url, { headers: { 'Accept-Encoding': 'br, gzip', ...headers } }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, rawHeaders: res.rawHeaders, body: Buffer.concat(chunks) }));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.end();
  });
}

// Every Content-Encoding value, across repeated headers and comma lists.
function encodings(rawHeaders) {
  const values = [];
  for (let i = 0; i < rawHeaders.length; i += 2) {
    if (rawHeaders[i].toLowerCase() === 'content-encoding') values.push(...rawHeaders[i + 1].split(',').map((v) => v.trim()).filter(Boolean));
  }
  return values;
}

function decode(body, encoding) {
  if (encoding === 'br') return brotliDecompressSync(body);
  if (encoding === 'gzip') return gunzipSync(body);
  return body;
}

const sha256 = (data) => createHash('sha256').update(data).digest('hex');

/**
 * Checks the Tour artifacts of a live deploy against the list that the build wrote.
 * @param {string} siteUrl the deploy's origin, such as https://pixelsprout.dev
 * @param {{ headers?: Record<string, string> }} [options] extra request headers, such as a Vercel protection bypass
 * @returns {Promise<{ failures: string[], checked: string[], notes: string[] }>}
 */
export async function checkDeploy(siteUrl, { headers = {} } = {}) {
  const origin = siteUrl.replace(/\/+$/, '');
  const failures = [];
  const checked = [];
  const notes = [];
  const listResponse = await get(origin + ARTIFACTS_LIST, headers);
  if (listResponse.status === 404) {
    notes.push('The deploy has no Tour artifacts list, so there was nothing to check.');
    return { failures, checked, notes };
  }
  if (listResponse.status !== 200) {
    failures.push(`${ARTIFACTS_LIST}: HTTP ${listResponse.status}`);
    return { failures, checked, notes };
  }
  const listEncoding = encodings(listResponse.rawHeaders);
  const list = JSON.parse(decode(listResponse.body, listEncoding[0]).toString('utf8'));

  for (const file of list.files) {
    const fail = (message) => failures.push(`${file.path}: ${message}`);
    const response = await get(origin + list.base + file.path, headers);
    checked.push(file.path);
    if (response.status !== 200) {
      fail(`HTTP ${response.status}`);
      continue;
    }
    const cacheControl = String(response.headers['cache-control'] ?? '');
    if (cacheControl !== IMMUTABLE) fail(`cache-control is "${cacheControl}", not "${IMMUTABLE}"`);
    const found = encodings(response.rawHeaders);
    if (file.encoding === 'br') {
      if (found.length !== 1 || found[0] !== 'br') fail(`content-encoding is "${found.join(', ')}", not exactly "br"`);
      const suffix = Object.keys(BR_TYPES).find((s) => file.path.endsWith(s));
      const type = String(response.headers['content-type'] ?? '');
      if (suffix && type.split(';')[0].trim() !== BR_TYPES[suffix]) fail(`content-type is "${type}", not "${BR_TYPES[suffix]}"`);
      const vary = String(response.headers.vary ?? '');
      if (!/(^|,)\s*accept-encoding\s*(,|$)/i.test(vary)) fail('vary does not name Accept-Encoding');
      const plain = await get(origin + list.base + file.path.slice(0, -'.br'.length), headers);
      if (plain.status !== 404) failures.push(`${file.path.slice(0, -'.br'.length)}: the plain file is deployed beside its .br file`);
    } else if (found.length > 1) {
      fail(`content-encoding is "${found.join(', ')}", more than one encoding`);
    }
    let decoded;
    try {
      decoded = found.reduceRight((body, encoding) => decode(body, encoding), response.body);
    } catch (error) {
      fail(`the body does not decode: ${error.message}`);
      continue;
    }
    if (sha256(decoded) !== file.sha256) fail('the body does not decode to the original bytes');
  }
  return { failures, checked, notes };
}
