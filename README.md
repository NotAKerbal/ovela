# Mosaic Haven

A Next.js App Router prototype for a personal homelab home. Four app tiles sit on a warm stone surface. A short pigment wash reveals each tile on arrival; clicking a tile spreads a watercolor bloom from the pointer before opening its preview.

## Run

```sh
npm install
npm run dev
```

## Configure

Edit `lib/apps.ts` to change the catalog, labels, palette, and destination URLs. Apps without a destination show a clearly labeled preview. This prototype does not implement authentication, access control, or the destination apps.

`components/haven.tsx` contains the reusable tile and launcher. `app/globals.css` controls material, depth, responsive layout, and motion. All text remains live HTML.

## Motion

- Entrance: 850 ms staggered tile reveal, with a 1.5 second pigment wash.
- Click: a bounded 760 ms bloom from the pointer, or the tile center for keyboard activation.
- Idle: no running animation, frame loop, WebGL, or pointer tracking.
- Reduced motion: immediate opening without entrance, hover, or paint animation.
- Grain and bloom masks are fixed SVG textures. Only transform and opacity animate on the paint layers; no animated SVG filters.
- Replay restarts the entrance. Escape, backdrop click, and the close button dismiss previews; focus returns to the app.

## Validate and build

```sh
npm run typecheck
npm run build
```

The prototype exports static files to `out/`. Remove `output: 'export'` from `next.config.ts` when introducing server-side authentication. The framework is Next.js, not a compatibility layer.
