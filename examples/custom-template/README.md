# Custom template references

These files are deliberately complete, one-file examples. Copy the closest
shape into `vanillasky/templates/`, rename its ID, then run `npx vanillasky
sync` and `npx vanillasky check`.

| Reference | Use it when |
| --- | --- |
| [Minimal text](minimal-text.tsx) | One short, grounded idea should fill the scene. |
| [Structured data](structured-data.tsx) | An exact metric and its change are the central proof. |
| [Supplied media](supplied-media.tsx) | An image already supplied by the application is the strongest evidence. |

All three use only `defineTemplate` from the public
`@vanillaskyai/video/templates` entry point. They include selection guidance,
JSON Schema defaults, a named example, deterministic progress-based motion,
safe-zone layout, and portrait/landscape handling. The media reference uses
`format: "supplied-image"` for an image that must appear in
`VideoInput.suppliedMedia`; use `format: "uri"` for another approved media or
link URL governed by the same server media policy.
