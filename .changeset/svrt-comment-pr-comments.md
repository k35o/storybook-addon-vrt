---
'storybook-addon-vrt': minor
---

Add `svrt comment`: post the VRT result as a GitHub pull request comment — one marker-tagged comment per PR, updated in place. With `--report-url` it embeds expected/actual/diff images and links the hosted `report.html`; without it it degrades to a text summary pointing at the CI artifact. Ships with a composite GitHub Action (`k35o/storybook-addon-vrt@v0`) wrapping `svrt run`, the comment, and the report artifact upload.
