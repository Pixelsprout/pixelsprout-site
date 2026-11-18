import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseReports } from '../src/lib/tour-reports';

const report = (name: string) => readFileSync(new URL(`fixtures/tour-reports/${name}.txt`, import.meta.url), 'utf8');

describe('parseReports', () => {
  it('turns a report into a problem with its title, location and body', () => {
    const [problem, ...rest] = parseReports(report('unknown-name'));
    expect(rest).toEqual([]);
    expect(problem).toMatchObject({
      title: 'does not exist',
      path: '/rocco/examples/tutorial/tour/main.roc',
      line: 34,
      column: 55,
      endColumn: 62,
    });
    expect(problem.body.startsWith('linalg.Vec3.zeroo does not exist.')).toBe(true);
    expect(problem.body.endsWith('linalg.Vec3 is in scope, but it has no associated zeroo.')).toBe(true);
  });

  it('splits a report with many problems into one problem per header', () => {
    const problems = parseReports(report('two-errors'));
    expect(problems.map((p) => [p.title, p.line, p.column, p.endColumn])).toEqual([
      ['does not exist', 34, 55, 62],
      ['type mismatch', 29, 82, 84],
    ]);
    expect(problems[0].body).not.toContain('type mismatch');
    expect(problems[1].body.endsWith('convert it with .to_str().')).toBe(true);
    expect(parseReports(report('parse-error'))).toHaveLength(141);
  });

  it('does not split at a header that is not at the start of a line', () => {
    const problems = parseReports(report('header-in-string'));
    expect(problems.map((p) => p.title)).toEqual(['does not exist']);
    expect(problems[0].body).toContain('"── ✗ fake ─── /x.roc:1:1"');
  });

  it('leaves warnings out, and keeps their text out of the errors', () => {
    expect(parseReports(report('unused-var'))).toEqual([]);
    const problems = parseReports(report('error-and-warning'));
    expect(problems.map((p) => p.title)).toEqual(['type mismatch']);
    const [after] = parseReports(report('unknown-name') + report('unused-var'));
    expect(after.body).not.toContain('unused');
  });
});
