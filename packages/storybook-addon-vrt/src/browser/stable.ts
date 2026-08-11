export type StabilityLoopOptions = {
  retries: number;
  interval: number;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16);
}

/**
 * Takes screenshots until two consecutive ones hash identically and returns
 * the capture whose stability was confirmed, so the saved image is exactly
 * the verified frame — a separately taken "final" screenshot could land on a
 * frame the check never saw. Never fails the user's test on instability: it
 * reports through `onUnstable` and returns the last capture anyway.
 */
export async function takeStableScreenshot(
  takeShot: () => Promise<string>,
  { retries, interval }: StabilityLoopOptions,
  onUnstable: () => void,
): Promise<string> {
  let previousHash: string | undefined;
  let shot = '';
  // Two identical captures need at least two attempts, whatever `retries` says.
  for (let attempt = 0; attempt < Math.max(retries, 2); attempt++) {
    shot = await takeShot();
    const hash = fnv1a(shot);
    if (previousHash === hash) return shot;
    previousHash = hash;
    await sleep(interval);
  }
  onUnstable();
  return shot;
}
