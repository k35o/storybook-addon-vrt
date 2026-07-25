// Git helpers are a shared primitive; the implementation lives in vrt-core and
// is bundled in at build time (a devDependency, so nothing extra is published).
export {
  changedFiles,
  type GitResult,
  isInsideWorkTree,
  mergeBase,
  refExists,
  repoRoot,
} from 'vrt-core';
