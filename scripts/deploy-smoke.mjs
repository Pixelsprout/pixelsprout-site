// Usage: node scripts/deploy-smoke.mjs <deploy URL>
// Set VERCEL_AUTOMATION_BYPASS_SECRET to reach a protected preview deployment.
import { checkDeploy } from './deploy-check.mjs';

const [url] = process.argv.slice(2);
if (!url) {
  console.error('usage: node scripts/deploy-smoke.mjs <deploy URL>');
  process.exit(2);
}
const secret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const headers = secret ? { 'x-vercel-protection-bypass': secret } : {};
const { failures, checked, notes } = await checkDeploy(url, { headers });
for (const note of notes) console.log(`deploy-smoke: ${note}`);
for (const failure of failures) console.error(`deploy-smoke: ${failure}`);
if (failures.length > 0) process.exit(1);
console.log(`deploy-smoke: ok, ${checked.length} Tour files at ${url}`);
