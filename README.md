# Siaga Kalsel — versi statis (tanpa kuota Cloudflare Worker)

Dashboard Siaga Kalsel yang sama dengan versi Worker, tapi disajikan
sepenuhnya statis lewat GitHub Pages:

- `index.html`, `app.js`, `style.css` — frontend (Leaflet + data).
- `summary.json` — data gabungan, diperbarui tiap 30 menit oleh cron
  (skrip `update-via-api.py` + `fetch-summary.mjs` di workspace).
- `fetch-summary.mjs` — skrip pembangun `summary.json` (port logika
  Worker: ATCS Banjarmasin, FIRMS, Open-Meteo, BMKG, sheet TMA BWS
  Kalimantan III, RainViewer).

Perbedaan dari versi Worker:

- Video CCTV Banjarmasin TIDAK di-embed: popup menampilkan thumbnail
  langsung dari ATCS + tautan "Buka video di portal ATCS", karena
  stream ATCS tanpa izin cross-origin dan versi ini tidak memakai
  proxy. YouTube Pontianak tetap di-embed.
- Data diperbarui tiap 30 menit (bukan 10 menit).
- Semua teks dari sumber luar di-escape sebelum dirender (perbaikan
  keamanan vs versi Worker).

Catatan: file `.github/workflows/update-summary.yml` tersedia di
workspace sebagai opsi otomasi murni GitHub Actions, tapi tidak bisa
dibuat lewat API karena token tidak punya scope `workflow` — tambahkan
manual lewat web UI bila ingin memakainya.
