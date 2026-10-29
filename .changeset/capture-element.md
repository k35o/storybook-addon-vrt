---
'storybook-addon-vrt': patch
---

Stories that set `parameters.vrt.capture` to a selector now capture the matched element instead of failing. The capture hook read the element screenshot as `{ base64 }`, but Vitest returns the base64 string itself when a screenshot is not saved (`save: false`), so every such story failed in its `afterEach` hook with `TypeError: Cannot read properties of undefined (reading 'length')`. The hook now uses the returned string, which Vitest 4 and 5 both return.
