# Bengal Planting Atlas

Algorithmic species suitability for West Bengal landscapes, implementing the
framework in *Algorithmic Landscape Development in the Subcontinent: A
Python-GIS Framework for Automated Species Suitability Indexing and Spatial
Planting Optimization in Indian Bioclimates* by Sarthak Chatterjee, B.Arch,
Jadavpur University.

Pick a point on the 3D relief map of West Bengal and get the tree, shrub and
ground cover with the highest Species Suitability Index for that coordinate,
the AHP weights and consistency check behind it, a non-intersecting planting
layout with UTM 45N coordinates, the planting window relative to monsoon onset,
and APTI, PM10 and carbon sequestration figures.

## Deploy to Vercel

1. Push the repository to GitHub.
2. In Vercel choose **Add New > Project** and import it. Framework Preset:
   **Other**, Build Command empty. `vercel.json` already sets the output folder
   (`public`) and the API functions (`api/`). Click **Deploy**.
3. In the project, open **Storage** and connect:
   - **Neon** (Postgres), free plan. Vercel adds `DATABASE_URL`.
   - **Blob**. Vercel adds `BLOB_READ_WRITE_TOKEN`.
4. In **Settings > Environment Variables** add `ADMIN_TOKEN`, a passcode you
   choose. It unlocks the archive.
5. Optional: add `GOOGLE_MAPS_API_KEY` (Geocoding API and Maps Embed API
   enabled, restricted to your domain) to use Google place names and an
   embedded Google satellite map. Without it the site uses OpenStreetMap.
6. **Redeploy** (Deployments > ... > Redeploy) so the new variables apply.

Open `/api/health` on the live site to confirm: it lists anything still
missing. The database table creates itself on the first save; `db/schema.sql`
has the same definition if you want to run it by hand.

```
git remote add origin https://github.com/YOUR_USER/bengal-planting-atlas.git
git push -u origin main
```

## Backend

| Route | Access | Purpose |
| --- | --- | --- |
| `GET /api/health` | public | Which services are connected |
| `GET /api/geocode?lat=&lon=` | public | Place name for a coordinate. OpenStreetMap Nominatim by default, Google when `GOOGLE_MAPS_API_KEY` is set. Cached at the Vercel edge for 30 days per coordinate |
| `POST /api/upload?kind=site\|surroundings&name=` | public | Stores one site photo in Vercel Blob (the page resizes to 2000 px JPEG first, 4 MB cap) |
| `POST /api/runs` | public | Saves one generated palette with its inputs |
| `GET /api/runs` | passcode | List with `q`, `district`, `from`, `to`, `photos=1`, `limit`, `offset` |
| `GET /api/runs?id=` | passcode | One full record |
| `GET /api/runs?format=json` / `format=csv` | passcode | Export every matching record |
| `DELETE /api/runs?id=` | passcode | Remove a record |

The passcode is sent as the `x-admin-token` header (or `Authorization: Bearer`).

**What is saved.** Every time the palette changes after a visitor acts (map
click, district, preset, any field, or the Run button), the page waits 1.2
seconds for further changes, then writes one row to `planting_runs`: the exact
inputs, the resolved place name, the extracted site profile, criterion
severities and AHP weights with the consistency ratio, the prescribed tree,
understory, shrub and ground cover, every species that cleared SSI 0.85, the
screened exotics, layout metrics and species counts, the planting window, air
and carbon figures, and links to the attached photos. Opening the page does not
save anything, and the same visitor producing identical inputs within 30
minutes is stored once. The full coordinate matrix is not stored because the
layout is deterministic: the inputs plus `engine_version` regenerate it
exactly, which is what **Reopen in the atlas** on the archive does.

**Archive.** `/archive` is locked by `ADMIN_TOKEN`. It filters by text,
district, date and photos, opens any record in full with its photo gallery,
exports JSON or CSV, and deletes records.

**Photos.** Stored in Vercel Blob under unguessable random URLs. Blob links are
public to anyone who has the exact URL; the URLs are only ever shown inside the
passcode-locked archive.

## Local development

```
npm install
python3 tools/build.py        # rebuild public/ after editing src/
node tools/dev-server.mjs     # http://localhost:8787, in-memory Postgres, archive passcode local-pass
npm test                      # API tests on real Postgres (PGlite) plus engine checks
```

`vercel dev` runs the same site against your real Neon database and Blob store
once the project is linked.

## Features

- 3D relief map (Three.js): districts extruded by mean elevation, the selected
  district lifts off the map with a cast shadow, a pin and pulse rings mark the
  exact coordinate. Tap to choose a site, drag sideways to turn. A flat SVG map
  is available from the toggle and is used automatically if WebGL is missing.
- Generative ambient score (Web Audio): slow pads, soft bells, a faint breeze.
  Synthesised live, no audio files, no licensing. Play, pause and volume sit at
  the top right and are remembered per browser. Browsers block audible autoplay
  until the first interaction, so the page tries to start the score on landing
  and the entry screen's button starts it for everyone else.
- Motion: growing-tree entry screen, drifting seeds and leaves, scroll reveals,
  3D tilt on the species cards, animated SSI rings and count-ups, planting plan
  that grows outward from the centre, animated planting calendar.
- Place name for the chosen coordinate under the latitude and longitude, with
  a map preview and an Open in Google Maps link.
- Site photos: attach pictures of the site and of the surrounding region
  before running the schema; they are saved with each run.
- Archive of every generated palette in Neon Postgres (see Backend).
- Contact section with Sarthak Chatterjee's LinkedIn profile.
- Honours `prefers-reduced-motion`. Responsive down to 360 px.

## Editing

Source lives in `src/`:

| File | Contents |
| --- | --- |
| `data-env.js` | 75 environmental control points, agro-climatic zones, presets, UHI and compaction factors, NCAP cities |
| `data-species.js` | 130 species records with tolerance vectors, APTI, dust capture, dimensions, wood density |
| `data-districts.js` | Simplified district geometry |
| `engine.js` | AHP, SSI, layout and planting-window engine |
| `map3d.js` | 3D relief map |
| `audio.js` | Ambient score |
| `fx.js` | Motion, splash, sound controls |
| `store.js` | Place names, photo attach and upload, archive autosave |
| `app.js` | Interface and rendering |
| `archive-body.html`, `archive.js`, `archive.css` | The archive page |
| `body.html`, `styles.css` | Markup and styles |

After editing, rebuild and commit `public/`:

```
python3 tools/build.py
```

`node tools/test-engine.cjs` prints the pipeline for the paper's Bidhannagar
case and seven other sites. Expected for Bidhannagar: Barringtonia acutangula
first, Terminalia arjuna and Pongamia pinnata selected, Delonix regia and
Peltophorum pterocarpum screened out, target planting date 18 May.

## Provenance and limits

Embedded values are climatological normals and survey midpoints standing in for
the live IMD, ISRO Bhuvan, SRTM and CPCB feeds the paper's Python backend would
query. APTI figures are literature-derived representative ranges from Indian
urban studies; CPCB and NGT publish guidance and orders, not per-species
databases. Treat the output as the data-driven starting palette for a site
survey.

© Sarthak Chatterjee, 2026. Three.js is © three.js authors, MIT licence
(`public/vendor/THREE-LICENSE.txt`).
