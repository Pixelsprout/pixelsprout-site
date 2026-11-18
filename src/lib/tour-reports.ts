export type Problem = { title: string; path: string; line: number; column: number; endColumn: number; body: string };

// Warnings have the same header with ● in place of ✗. They end the problem before them, but are not problems.
const HEADER = /^── ([✗●]) (.+?) ─+ (\S+):(\d+):(\d+)$/;

export function parseReports(reports: string): Problem[] {
  const lines = reports.split('\n');
  const problems: Problem[] = [];
  let current: { header: RegExpMatchArray; body: string[] } | null = null;
  const finish = () => {
    if (current?.header[1] !== '✗') return;
    const [, , title, path, line, column] = current.header;
    const body = current.body.join('\n').trim();
    const carets = body.match(/^\s*(\^+)\s*$/m)?.[1].length ?? 1;
    problems.push({ title, path, line: Number(line), column: Number(column), endColumn: Number(column) + carets, body });
  };
  for (const line of lines) {
    const header = line.match(HEADER);
    if (header) {
      finish();
      current = { header, body: [] };
    } else {
      current?.body.push(line);
    }
  }
  finish();
  return problems;
}
