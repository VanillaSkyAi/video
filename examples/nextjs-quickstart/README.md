# Next.js quickstart

This is the smallest complete VanillaSky app: one server route, one React page,
and the built-in templates.

<!-- verify:start -->
```bash
npm install
cp .env.example .env.local
npm run build
npm run dev
```
<!-- verify:end -->

Add your OpenAI API key to `.env.local` before selecting **Generate video**.

Open <http://localhost:3000> and select **Generate video**.

The packaged development command supplies a non-secret marker only to
`next dev`, so the example authorizes local development and denies production
requests.
Replace the local-only authorization before deploying. See the
[Next.js guide](../../docs/integrate-nextjs.md) for production and optional
configuration.
