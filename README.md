# moodnight

A space for Ukrainian poetry — a static prototype built on React 18 + Babel standalone (no build step).

**Live:** https://satanovskyiv.github.io/moodnight/

**Roadmap:** [docs/ROADMAP.md](docs/ROADMAP.md) — the plan for turning this prototype into a real product (Next.js + NestJS + Postgres), phase by phase.

## Running locally

You need an HTTP server — `file://` won't work, because the JSX is loaded via `<script src>`.

```bash
python3 -m http.server 8777
```

Then open http://localhost:8777/MoodNight.html

## Files

- `MoodNight.html` — page shell
- `index.html` — redirect to `MoodNight.html` (entry point for GitHub Pages)
- `app.jsx` — page components
- `data.jsx` — sample poems
- `ornaments.jsx` — SVG ornaments
- `styles.css` — styles
- `tweaks-panel.jsx` — tweaks panel
