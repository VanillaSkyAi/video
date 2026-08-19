# React + Vite example

This minimal consumer defines one schema-driven template, calls `useVideo`, and
renders `VideoPlayer`. Point `/api/video` at a route created with
`createVideoHandler`.

<!-- verify:start -->
```bash
npm install
npm run build
npm run dev
```
<!-- verify:end -->

The documentation gate runs those commands against the exact packed SDK
candidate matching this example's `package.json`, so a release can be verified
before that immutable version exists on npm. The separate consumer gate also
builds the packed candidate with strict TypeScript.
