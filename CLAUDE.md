# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Control Lechero** is an offline-first PWA for veterinarians performing dairy production controls ("control lechero") at dairy farms (tambos). It runs entirely in the browser — no build step, no package manager, no bundler, no test suite. All source files are served as-is via GitHub Pages.

## No Build Step

There is no `npm install`, `npm run build`, `npm test`, or any compilation step. To "run" the project, open `index.html` in a browser or serve the folder with any static server:

```
npx serve .
# or
python -m http.server 8080
```

Service Worker registration is skipped when `location.hostname` is empty (file protocol), so for SW testing you need a real HTTP server or GitHub Pages.

## Tech Stack

- **Vanilla JS + HTML5 + CSS3** — no frameworks
- **Dexie.js** — IndexedDB ORM (loaded from `js/dexie.js`, ~230KB)
- **html2canvas** — canvas rendering for WhatsApp image export (`js/html2canvas.min.js`, ~195KB, intentionally excluded from SW precache)
- **Google Apps Script** — sync backend (`apps-script/Code.gs`)
- **GitHub Pages** — hosting (requires `.nojekyll` file at repo root)
- **Service Worker** — offline-first cache-first strategy (`sw.js`)

## Architecture

### SPA Router (`js/router.js`)

Hash-based (`#/path`). Every screen module calls `registerScreen(name, asyncFn)` to register a handler. The router matches the hash against `ROUTES` and calls the matching handler with `(element, params)`.

```js
registerScreen('my-screen', async (el, params) => {
  el.innerHTML = `...`;
});
```

Navigate with `navigate('/path')`. Re-render the current screen with `refresh()`. The `FULLSCREEN` set (`registro`, `planilla`) hides the bottom nav.

**Route table** (in `router.js`, in priority order):
```
/tambos/:id/control/:controlId/planilla → planilla
/tambos/:id/padron/:rp                  → historial-vaca
/tambos/:id/control/:fecha              → registro
/tambos/:id/padron                      → padron
/tambos/:id/editar                      → tambo-form
/tambos/:id                             → tambo-detalle
/tambos/nuevo                           → tambo-form
/tambos                                 → tambos
/historial                              → historial
/config                                 → config
/                                       → home
```

### Database Schema (`js/db.js`)

Dexie v3, database named `ControlLechero`. Seven tables:

| Table | Key | Purpose |
|---|---|---|
| `veterinario` | `++id` | Single record (id=1). Stores nombre, matrícula, appsScriptUrl |
| `tambos` | `++id` | One record per farm. Has `sheetId` (Google Sheets ID) and `syncedAt` |
| `controles` | `++id, [tamboId+fecha]` | One per day per farm. Compound index used for uniqueness |
| `tandas` | `++id, controlId` | A "tanda" is a batch within a control (turno: mañana/tarde/extra) |
| `registros` | `++id, [tandaId+rp]` | One per cow per tanda. Stores `litros`, `estado` (normal/venta/secar/pendiente) |
| `vacas_registro` | `++id, [tamboId+rp]` | Padron — auto-populated when a cow is first registered |
| `syncQueue` | `++id, tabla` | Pending sync jobs. `tabla='control'`, `intentos < 3` = pending |

All CRUD helpers are global functions in `db.js` — use them, don't query `db.*` directly from screen files.

**Data hierarchy**: tambo → controles → tandas → registros

### Sync Architecture (`js/sync.js`)

Offline-first, push-pull with Google Apps Script as intermediary:

**Push (local → Sheets):**
- Every write to `registros` calls `enqueueControlSync(controlId, tamboId)` which upserts a job in `syncQueue`
- `procesarQueue()` runs on app load and on `online` event
- Payload: full control snapshot (all cows, litros, estados, totals) sent as `POST` to Apps Script URL
- Apps Script writes a visual sheet tab named `DD-MM-YYYY` and updates hidden `_datos` sheet

**Pull (Sheets → local):**
- `pullFromSheet(tamboId)` — GET request to `?sheetId=...`, imports missing controls non-destructively (local always wins)
- `action=list` — GET to `?action=list` returns all tambos registered in the script's PropertiesService
- Used from Config screen and after saving a tambo with a new sheetId

**Toast notifications:** `_showToast(msg, tipo)` in `sync.js` is the single toast function for the whole app.

### Apps Script Backend (`apps-script/Code.gs`)

Deployed as: *Execute as "Me", access "Anyone"*.

- `doPost`: receives `action=register` (just registers tambo metadata) or a full control payload (writes visual sheet + updates `_datos`)
- `doGet`: `?action=list` returns tambos from PropertiesService; `?sheetId=X` returns full `_datos` JSON for bidirectional sync
- `_datos` is a hidden sheet whose A1 cell stores the entire tambo history as a JSON string
- After any code change, **must redeploy** ("Manage Deployments → New version") for changes to take effect

### Service Worker (`sw.js`)

Cache-first, offline-first. ASSETS list is the app shell (excludes `html2canvas.min.js` intentionally — too large, cached lazily on first use). 

**Version bumping** — every deploy that changes behavior requires bumping both:
1. `CACHE` constant in `sw.js`: `'control-lechero-vN'`
2. `APP_VERSION` in `js/config.js`: `'1.N'`

These must stay in sync. The "Buscar actualizaciones" button in Config triggers SW update via `reg.update()` + `updatefound` listener + `SKIP_WAITING` message.

### CSS Architecture (`css/app.css`)

Single file. Mobile-first with two breakpoints:
- `min-width: 600px` — centers the 430px column with box-shadow (tablet portrait)
- `min-width: 768px` — full desktop layout: sidebar nav (220px) + content area. All screen wrappers (`.reg-wrap`, `.pl-wrap`, `.pl-body`, `.home-wrap`, `.page-body`) are constrained to `max-width: 800px; margin: auto` at this breakpoint

Design tokens are CSS custom properties in `:root`. Key ones: `--accent: #2D6A4F`, `--bg: #F4F1EC`, `--surface`, `--border`, `--nav-height: 64px`.

At `min-width: 768px`, `#bottom-nav` becomes a left sidebar via `position: static; flex-direction: column; width: 220px`.

## Patterns and Conventions

### Adding a New Screen

1. Create `js/my-screen.js`
2. Call `registerScreen('my-screen', async (el, params) => { ... })` inside it
3. Add a route to the `ROUTES` array in `router.js`
4. Add `<script src="js/my-screen.js"></script>` to `index.html` (before the inline script)
5. Add `'./js/my-screen.js'` to `ASSETS` in `sw.js`

### Cow States (`estado`)

Four states used throughout — always use exactly these strings:
- `'normal'` — productive cow with litros
- `'pendiente'` — cow in control but litros not yet measured
- `'secar'` — cow flagged to be dried off (still has litros, shown with purple highlight)
- `'venta'` — cow sold (no litros, shown with orange highlight)

State priority (highest wins): `venta > secar > pendiente > normal`

### Litros Formatting

Two separate formatters exist — use the right one per context:
- `fmtL(n)` in `db.js` — global utility
- `_fmtLp(n)` in `planilla.js` — planilla-specific (same logic, local scope)
- `_fmtL(n)` in `registro.js` — registro-specific

### Dates

Always store as `YYYY-MM-DD` (ISO). Display with `formatFecha(dateStr)` → `DD/MM/YYYY`. For Apps Script payloads, convert to `DD-MM-YYYY` (used as sheet tab names).

### Inline onclick Handlers

All interactive elements use `onclick="globalFunction()"` directly in the HTML template strings. All screen-level functions must be global (not inside blocks or modules).

### Registro Screen State

The `R` object in `registro.js` holds all in-memory state for the active control session. After any DB write, call the relevant `_render*()` functions to update the UI — there is no reactive framework.

## Deployment Checklist

When making any functional change:
1. Bump `CACHE` in `sw.js` (e.g., `v18` → `v19`)
2. Bump `APP_VERSION` in `js/config.js` (e.g., `'1.18'` → `'1.19'`)
3. Commit and push to `main` — GitHub Pages deploys automatically
4. If `apps-script/Code.gs` changed: redeploy the Apps Script (new version required)
