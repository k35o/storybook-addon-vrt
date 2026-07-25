export type StoryEntry = {
  id: string;
  title: string;
  name: string;
  importPath: string;
};

type RawIndex = {
  entries?: Record<
    string,
    { id: string; type?: string; title: string; name: string; importPath: string }
  >;
};

/**
 * Fetches the running Storybook's story list from `/index.json`. Only entries
 * of type `story` are returned (docs pages are skipped). `sbUrl` is the
 * Storybook origin, e.g. `http://localhost:6006`.
 */
export async function fetchStoryIndex(sbUrl: string): Promise<StoryEntry[]> {
  const res = await fetch(`${sbUrl.replace(/\/$/, '')}/index.json`);
  if (!res.ok) {
    throw new Error(`Could not read ${sbUrl}/index.json (status ${res.status})`);
  }
  const index = (await res.json()) as RawIndex;
  const entries = Object.values(index.entries ?? {});
  return entries
    .filter((entry) => entry.type === undefined || entry.type === 'story')
    .map(({ id, title, name, importPath }) => ({ id, title, name, importPath }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
