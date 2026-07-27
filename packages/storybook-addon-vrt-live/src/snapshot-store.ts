/**
 * Baselines for the dev loop: "freeze what this story looks like now, then show
 * me what my edits change". They live in memory for the dev-server session —
 * nothing is written to the repo, so there is no baseline directory to commit
 * and no environment-specific image to share. Comparing against a commit or a
 * branch is the CI addon's job (`storybook-addon-vrt`), not this one's.
 */
export class SnapshotStore {
  readonly #byStory = new Map<string, Buffer>();

  set(storyId: string, png: Buffer): void {
    this.#byStory.set(storyId, png);
  }

  get(storyId: string): Buffer | null {
    return this.#byStory.get(storyId) ?? null;
  }

  has(storyId: string): boolean {
    return this.#byStory.has(storyId);
  }

  get size(): number {
    return this.#byStory.size;
  }

  clear(storyId?: string): void {
    if (storyId === undefined) this.#byStory.clear();
    else this.#byStory.delete(storyId);
  }
}
