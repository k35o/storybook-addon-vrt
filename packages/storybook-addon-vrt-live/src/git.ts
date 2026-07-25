// Git ref access is a shared primitive; the implementation lives in vrt-core
// and is bundled in at build time (a devDependency, so nothing is published).
export { listFilesAtRef, readFileAtRef, refExists, repoRoot, resolveRef } from 'vrt-core';
