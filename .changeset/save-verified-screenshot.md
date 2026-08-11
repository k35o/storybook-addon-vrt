---
'storybook-addon-vrt': patch
---

Save the exact screenshot whose stability was verified. The capture hook used to confirm that two consecutive screenshots hash identically and then take one more screenshot to write to disk — that extra, unverified frame could land mid-animation and produce a flaky capture. The verified bytes are now written directly (via Vitest's fs command, falling back to a fresh screenshot when unavailable). Also documents that JS-driven animations (Framer Motion etc.) are not stopped by the injected CSS and should be disabled via `contextOptions: { reducedMotion: 'reduce' }`.
