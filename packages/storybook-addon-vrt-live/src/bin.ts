#!/usr/bin/env node
import path from 'node:path';
import { styleText } from 'node:util';
import { cac } from 'cac';
import { LiveCapturer } from './capture';
import { repoRoot } from './git';
import { captureBaseline } from './snapshot';
import { fetchStoryIndex } from './stories';

const cli = cac('svrt-live');

cli
  .command('snapshot', 'Capture every story into the committed baseline directory')
  .option('--url <url>', 'Running Storybook origin', { default: 'http://localhost:6006' })
  .option('--base-dir <dir>', 'Baseline directory, relative to the repo root', {
    default: '.vrt-live/baseline',
  })
  .option('--clean', 'Wipe the baseline directory before capturing (full re-snapshot)')
  .action(async (flags: { url: string; baseDir: string; clean?: boolean }) => {
    const root = repoRoot(process.cwd());
    if (root === null) {
      console.error(styleText('red', 'Not inside a git repository — baselines are stored in git.'));
      process.exit(2);
    }
    const baselineDirAbs = path.join(root, flags.baseDir);

    let stories;
    try {
      stories = await fetchStoryIndex(flags.url);
    } catch (error) {
      console.error(
        styleText(
          'red',
          `Could not reach Storybook at ${flags.url}. Is it running? ` +
            `(${error instanceof Error ? error.message : String(error)})`,
        ),
      );
      process.exit(2);
    }

    console.info(
      styleText('cyan', `svrt-live · snapshot ${stories.length} stories from ${flags.url}`),
    );
    const capturer = new LiveCapturer();
    try {
      const summary = await captureBaseline({
        capturer,
        sbUrl: flags.url,
        stories,
        baselineDirAbs,
        ...(flags.clean ? { clean: true } : {}),
        onProgress: ({ done, total, id, status }) => {
          const mark =
            status === 'written'
              ? styleText('green', '✓')
              : status === 'skipped'
                ? styleText('yellow', '−')
                : styleText('red', '✗');
          console.info(styleText('dim', `  [${done}/${total}] `) + `${mark} ${id}`);
        },
      });
      console.info(
        `\n${summary.written.length} written, ${summary.skipped.length} skipped, ${summary.failed.length} failed`,
      );
      console.info(
        styleText(
          'dim',
          `Baselines: ${path.relative(process.cwd(), baselineDirAbs)} — commit them.`,
        ),
      );
      for (const f of summary.failed) console.error(styleText('red', `  ✗ ${f.id}: ${f.error}`));
      process.exit(summary.failed.length > 0 ? 1 : 0);
    } finally {
      await capturer.close();
    }
  });

cli.help();
cli.parse();
