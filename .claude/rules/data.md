---
paths:
  - "data/**/*.js"
---

# Content data

- A data file only assigns literal data: `window.NAME = ...`. No functions, computed values, DOM or presentation logic. The scripts in `js/` decide how it looks.
- Keep the existing field names and shapes. Their readers are `js/*.js`; if a shape must change, change the file's header comment and every reader in the same change (find readers with Grep for the field name).
- Dates are `YYYY-MM-DD`. Prices are numbers. Empty strings mean "not set yet" (for example `checkoutUrl: ""`).
- Start with a `//` comment saying what the file holds and documenting any non-obvious field.
