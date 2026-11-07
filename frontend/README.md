# WasteNot Web

React 19 + TypeScript + Vite + Tailwind.

```
src/
  components/ui      Button, Form controls (Input/Textarea/Select/Field/Checkbox/SearchBar), Modal/ConfirmDialog, Display (Badge, Avatar, EmptyState, ErrorState, Skeleton, Tabs, Stat)
  components/layout  AppLayout (header, mobile bottom nav, footer), Logo
  features/          listings (card, form parts, schema), reservations, safety (report/block)
  pages/             one file per route
  hooks/             useAuth (session + guards), useMeta (catalogue, area preference, geolocation)
  services/api.ts    all REST calls, grouped by domain
  lib/               api client (refresh-on-401, error mapping), formatting helpers
  types/             shared TypeScript types
```

Scripts: `npm run dev`, `npm run build` (outputs `dist/`), `npm run typecheck`, `npm test` (Vitest), `npm run e2e` (Playwright; run `npx playwright install` once).

Env: `VITE_API_URL` = API origin (e.g. `https://api.wastenot.in`). Static hosting needs an SPA fallback — `vercel.json` and `public/_redirects` (Netlify) are included.
