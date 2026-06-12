import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { VrtReport } from '../types';

export async function writeReportJson(report: VrtReport, baseDir: string): Promise<string> {
  const filePath = path.join(baseDir, 'report.json');
  await mkdir(baseDir, { recursive: true });
  await writeFile(filePath, `${JSON.stringify(report, null, 2)}\n`);
  return filePath;
}
