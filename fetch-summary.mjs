// fetch-summary.mjs — pembangun summary.json untuk Siaga Kalsel versi
// statis (tanpa Cloudflare Worker). Logika port 1:1 dari Worker
// dashboard-siaga-kalsel: sumber, parser, dan bentuk JSON sama, jadi
// frontend yang sama bisa membaca summary.json apa adanya.
// Dijalankan terjadwal oleh GitHub Actions tiap 30 menit, atau manual:
//   node fetch-summary.mjs [output-path]
// Kegagalan satu sumber tidak menggagalkan file (nilai null/kosong).
import { writeFileSync } from "node:fs";

const PONTIANAK_YT = [
  { name: "Simpang Tanjung Raya", lat: -0.0255, lng: 109.36203, youtubeId: "cgiRv02T6PU" },
  { name: "Simpang Pasar Flamboyan", lat: -0.03643, lng: 109.34212, youtubeId: "-pdP4IyU1vI" },
  { name: "Bundaran Digulis", lat: -0.05536, lng: 109.34934, youtubeId: "oqSqC-gOALo" },
  { name: "Simpang Pajak Jl Ahmad Yani", lat: -0.05984, lng: 109.35331, youtubeId: "opUgqUij2oA" },
  { name: "Simpang Tanjung Hulu", lat: -0.02858, lng: 109.3756, youtubeId: "BjGmSpuf4cw" },
  { name: "Jl Imam Bonjol depan SPBU", lat: -0.0471, lng: 109.31934, youtubeId: "sLf6s76ncU8" },
  { name: "Simpang Jl Pattimura", lat: -0.02951, lng: 109.33914, youtubeId: "DFGsiYGYffM" },
  { name: "Jl Komyos Sudarso", lat: -0.00714, lng: 109.29843, youtubeId: "ClV_1whkm_Y" },
];
const LINK_PORTALS = [
  { name: "Portal CCTV Kota Banjarbaru", city: "Banjarbaru", lat: -3.44, lng: 114.83, portalUrl: "https://cctv.banjarbarukota.go.id/CCTV", count: 71, note: "71 kamera, 2 diuji live (Arah Polresta, Arah Museum). Video diputar di portal resmi." },
  { name: "Portal CCTV Kabupaten Banjar", city: "Banjar", lat: -3.41, lng: 114.85, portalUrl: "https://cctv.banjarkab.go.id/", count: 59, note: "59 kamera, 14 live saat cek 30 Okt malam (mis. Depan CBS). Video diputar di portal resmi." },
];
const BJM_UPSTREAM = "https://atcs.banjarmasinkota.go.id";
const BJM_API = BJM_UPSTREAM + "/api/public/cameras";
const FIRMS_SOURCES = [
  { id: "MODIS", url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/c6.1/csv/MODIS_C6_1_Global_24h.csv" },
  { id: "VIIRS_SNPP", url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/suomi-npp-viirs-c2/csv/SUOMI_VIIRS_C2_Global_24h.csv" },
  { id: "VIIRS_NOAA20", url: "https://firms.modaps.eosdis.nasa.gov/data/active_fire/noaa-20-viirs-c2/csv/J1_VIIRS_C2_Global_24h.csv" },
];
function parseFirms(csv, source) {
  const lines = csv.trim().split("\n");
  const head = lines[0].split(",");
  const idx = (n) => head.indexOf(n);
  const out = [];
  for (const line of lines.slice(1)) {
    const v = line.split(",");
    const lat = Number(v[idx("latitude")]), lng = Number(v[idx("longitude")]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (lat < -4.8 || lat > -1.9 || lng < 114.3 || lng > 116.9) continue;
    const rawConf = String(v[idx("confidence")] ?? "").toLowerCase();
    let confidence;
    if (source === "MODIS") { const n = Number(rawConf); confidence = n >= 80 ? "high" : n >= 30 ? "nominal" : "low"; }
    else confidence = ["high", "nominal", "low"].includes(rawConf) ? rawConf : "nominal";
    const t = String(v[idx("acq_time")] ?? "0").padStart(4, "0");
    out.push({ source, satellite: String(v[idx("satellite")] ?? ""), lat, lng, acquiredAt: `${v[idx("acq_date")]}T${t.slice(0, 2)}:${t.slice(2)}:00Z`, confidence, frp: v[idx("frp")] === "" ? null : Number(v[idx("frp")]) });
  }
  return out;
}
const TMA_CSV_URL = "https://docs.google.com/spreadsheets/d/11hCN6PYwFvb6kd1cP9ZZDXrBEqECSrA_/export?format=csv&gid=1796036928";
const BMKG_TIDE_URL = "https://www.bmkg.go.id/cuaca/maritim/pelabuhan/XX003";
function parseTide(html) {
  const hIdx = html.indexOf("Pasang Surut</span>");
  if (hIdx < 0) return null;
  const rowStart = html.indexOf("<tr>", hIdx);
  const rowEnd = html.indexOf("</tr>", rowStart);
  if (rowStart < 0 || rowEnd < 0) return null;
  const vals = [...html.slice(rowStart, rowEnd).matchAll(/<!--\[-->(-?[\d,]+)<span[^>]*> m<\/span>/g)].map(m => Number(m[1].replace(",", ".")));
  if (vals.length < 12 || vals.some(v => !Number.isFinite(v))) return null;
  const kIdx = html.indexOf('{"local_datetime"');
  const anchor = kIdx >= 0 ? (html.slice(kIdx).match(/"(20\d\d-\d\d-\d\dT\d\d:00:00)"/) || [])[1] : null;
  const issued = (html.match(/"(20\d\d-\d\d-\d\dT\d\d:00:00)","WIB"/) || [])[1] || null;
  if (!anchor) return null;
  const t0 = new Date(anchor + "+08:00").getTime();
  if (!Number.isFinite(t0)) return null;
  const hours = vals.map((v, i) => ({ time: new Date(t0 + i * 3600000).toISOString(), value: v }));
  return { station: "Muara Sungai Barito", issued, hours };
}
function parseCsvRows(text, delim) {
  const rows = []; let row = [], cur = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += ch; }
    else if (ch === '"') inQ = true;
    else if (ch === delim) { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (ch !== "\r") cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
function parseTma(csv) {
  let rows = parseCsvRows(csv, ",");
  let hi = rows.findIndex(r => r.some(c => String(c).includes("NAMA INFRASTRUKTUR")));
  if (hi < 0) { rows = parseCsvRows(csv, ";"); hi = rows.findIndex(r => r.some(c => String(c).includes("NAMA INFRASTRUKTUR"))); }
  if (hi < 0) return null;
  const posts = []; let cat = "";
  for (const r of rows.slice(hi + 1)) {
    const f = r.map(c => String(c ?? "").trim());
    if (!f.some(Boolean)) continue;
    if (/^[IVX]+$/.test(f[0]) && !/^\d+$/.test(f[1])) { cat = f[1] || f[0]; continue; }
    if (!/^\d+$/.test(f[1]) || !f[2]) continue;
    posts.push({ no: Number(f[1]), category: cat, name: f[2], reading: f[3], condition: f[4], date: f[5] });
  }
  if (!posts.length) return null;
  const alertCount = posts.filter(p => { const c = String(p.condition || "").trim().toLowerCase(); return c !== "" && !c.includes("normal"); }).length;
  return { posts, alertCount };
}
const WEATHER_URL = "https://api.open-meteo.com/v1/forecast?latitude=-3.32&longitude=114.59&current=temperature_2m,weather_code,precipitation&hourly=temperature_2m,precipitation,weather_code&daily=sunrise,sunset&timezone=Asia%2FMakassar&forecast_days=2";
const QUAKE_URL = "https://data.bmkg.go.id/DataMKG/TEWS/autogempa.json";
const QUAKE_LIST_URL = "https://data.bmkg.go.id/DataMKG/TEWS/gempaterkini.json";
const WEATHER_CITIES = [
  { name: "Banjarmasin", lat: -3.32, lng: 114.59 },
  { name: "Banjarbaru", lat: -3.44, lng: 114.83 },
  { name: "Martapura", lat: -3.41, lng: 114.85 },
  { name: "Kotabaru", lat: -3.24, lng: 116.23 },
  { name: "Tanjung (Tabalong)", lat: -2.17, lng: 115.38 },
];
function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
function aqiCat(aqi) {
  if (aqi == null) return "tidak diketahui";
  if (aqi <= 50) return "baik";
  if (aqi <= 100) return "sedang";
  if (aqi <= 150) return "tidak sehat untuk kelompok sensitif";
  if (aqi <= 200) return "tidak sehat";
  if (aqi <= 300) return "sangat tidak sehat";
  return "berbahaya";
}
async function fetchAq(lat, lng) {
  try {
    const r = await fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lng}&hourly=pm2_5,us_aqi&timezone=Asia%2FMakassar&forecast_days=1`);
    if (!r.ok) return null;
    const a = await r.json();
    const times = a.hourly.time || [];
    const nowMakassar = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
    const nowKey = nowMakassar.getFullYear() + "-" + String(nowMakassar.getMonth() + 1).padStart(2, "0") + "-" + String(nowMakassar.getDate()).padStart(2, "0") + "T" + String(nowMakassar.getHours()).padStart(2, "0");
    let i = -1;
    for (let k = 0; k < times.length; k++) if (times[k] <= nowKey) i = k;
    if (i < 0) i = times.length - 1;
    const aqi = a.hourly.us_aqi[i];
    return { time: times[i], pm25: a.hourly.pm2_5[i], aqi, cat: aqiCat(aqi) };
  } catch { return null; }
}
function codeDesc(c) {
  if (c === 0) return "cerah";
  if (c >= 1 && c <= 3) return "berawan";
  if (c === 45 || c === 48) return "berkabut";
  if (c >= 51 && c <= 67) return "hujan";
  if (c >= 80 && c <= 82) return "hujan deras";
  if (c === 95) return "badai petir";
  return "kode " + c;
}
const UA = { "User-Agent": "siaga-kalsel-static/1.0" };
async function getSummary() {
  const [cctvRes, wxRes, qkRes, rvRes] = await Promise.allSettled([
    fetch(BJM_API, { headers: { Accept: "application/json", ...UA } }),
    fetch(WEATHER_URL), fetch(QUAKE_URL),
    fetch("https://api.rainviewer.com/public/weather-maps.json"),
  ]);
  const firmsLists = await Promise.all(FIRMS_SOURCES.map(async (s) => {
    try { const r = await fetch(s.url, { headers: UA }); return r.ok ? parseFirms(await r.text(), s.id) : []; }
    catch { return []; }
  }));
  let cameras = [], atcsOk = false;
  if (cctvRes.status === "fulfilled" && cctvRes.value.ok) {
    const raw = await cctvRes.value.json();
    const list = Array.isArray(raw) ? raw : raw.cameras || [];
    cameras = list.filter(c => c && c.code).map(c => ({
      code: String(c.code), name: String(c.name ?? c.code), city: "Banjarmasin", type: "hls",
      lat: c.lat == null ? null : Number(c.lat), lng: c.lng == null ? null : Number(c.lng),
      // Versi statis: thumbnail langsung via <img> (tidak butuh CORS),
      // video TIDAK di-embed — playUrl = portal ATCS, dibuka sebagai tautan.
      thumbUrl: BJM_UPSTREAM + "/screenshot/" + c.code + ".webp",
      playUrl: BJM_UPSTREAM + "/",
      announcement: c.announcement ?? null,
    })).sort((a, b) => a.name.localeCompare(b.name, "id"));
    atcsOk = true;
  }
  cameras = cameras.concat(PONTIANAK_YT.map(p => ({
    code: "pontianak-" + p.youtubeId, name: p.name, city: "Pontianak", type: "youtube",
    lat: p.lat, lng: p.lng, thumbUrl: null,
    playUrl: "https://www.youtube.com/embed/" + p.youtubeId,
    announcement: null,
  })));
  cameras = cameras.concat(LINK_PORTALS.map(p => ({
    code: "link-" + p.city.toLowerCase(), name: p.name, city: p.city, type: "link",
    lat: p.lat, lng: p.lng, thumbUrl: null,
    playUrl: p.portalUrl,
    announcement: p.note,
  })));
  let points = firmsLists.flat(), hotOk = points.length > 0;
  const highPoints = points.filter(h => h.confidence === "high").sort((a, b) => (b.frp ?? 0) - (a.frp ?? 0)).slice(0, 20);
  let weather = { now: null, nowDesc: null, hourly: [] };
  if (wxRes.status === "fulfilled" && wxRes.value.ok) {
    const w = await wxRes.value.json();
    weather.now = w.current ? w.current.temperature_2m : null;
    weather.nowDesc = w.current ? codeDesc(w.current.weather_code) : null;
    const RAIN_CODES = new Set([51, 53, 55, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99]);
    weather.code = w.current ? w.current.weather_code : null;
    weather.raining = w.current ? (RAIN_CODES.has(w.current.weather_code) || (w.current.precipitation || 0) > 0) : false;
    const sr = w.daily && w.daily.sunrise ? w.daily.sunrise[0] : null;
    const ss = w.daily && w.daily.sunset ? w.daily.sunset[0] : null;
    weather.isNight = (w.current && sr && ss) ? (w.current.time < sr || w.current.time > ss) : null;
    const nowMakassar = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Makassar" }));
    const nowKey = nowMakassar.getFullYear() + "-" + String(nowMakassar.getMonth() + 1).padStart(2, "0") + "-" + String(nowMakassar.getDate()).padStart(2, "0") + "T" + String(nowMakassar.getHours()).padStart(2, "0");
    const times = (w.hourly && w.hourly.time) || [];
    const start = times.findIndex(t => t >= nowKey);
    const idx = start < 0 ? 0 : start;
    weather.hourly = times.slice(idx, idx + 12).map((t, i) => ({ time: t, temp: w.hourly.temperature_2m[idx + i], precip: w.hourly.precipitation[idx + i], code: w.hourly.weather_code[idx + i], desc: codeDesc(w.hourly.weather_code[idx + i]) }));
  }
  let quake = null;
  if (qkRes.status === "fulfilled" && qkRes.value.ok) {
    try { const q = (await qkRes.value.json()).Infogempa.gempa; quake = { tanggal: q.Tanggal, jam: q.Jam, magnitude: q.Magnitude, wilayah: q.Wilayah, kedalaman: q.Kedalaman, potensi: q.Potensi }; } catch {}
  }
  let weatherCities = [], airQuality = null, airQualityCities = [], quakesNear = [], flood = null;
  try {
    const cityResults = await Promise.allSettled(WEATHER_CITIES.map(c =>
      fetch(`https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lng}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=Asia%2FMakassar&forecast_days=7`).then(r => r.json()).then(w => ({ name: c.name, temp: w.current ? w.current.temperature_2m : null, desc: w.current ? codeDesc(w.current.weather_code) : null, forecast: w.daily ? { time: w.daily.time, tmax: w.daily.temperature_2m_max, tmin: w.daily.temperature_2m_min, pop: w.daily.precipitation_probability_max, rain: w.daily.precipitation_sum } : null }))));
    weatherCities = cityResults.filter(r => r.status === "fulfilled").map(r => r.value);
  } catch {}
  try {
    airQuality = await fetchAq(-3.32, 114.59);
    const aqResults = await Promise.allSettled(WEATHER_CITIES.map(c => fetchAq(c.lat, c.lng).then(v => v ? { name: c.name, ...v } : null)));
    airQualityCities = aqResults.filter(r => r.status === "fulfilled" && r.value).map(r => r.value);
  } catch {}
  try {
    const r = await fetch(QUAKE_LIST_URL);
    if (r.ok) {
      const list = (await r.json()).Infogempa.gempa || [];
      quakesNear = list.map(q => {
        const parts = String(q.Coordinates || "").split(",");
        const lat = Number(parts[0]), lng = Number(parts[1]);
        return { tanggal: q.Tanggal, jam: q.Jam, magnitude: q.Magnitude, wilayah: q.Wilayah, kedalaman: q.Kedalaman, km: Number.isFinite(lat) ? haversineKm(-3.32, 114.59, lat, lng) : null };
      }).filter(q => q.km != null).sort((a, b) => a.km - b.km).slice(0, 5);
    }
  } catch {}
  try {
    const r = await fetch(TMA_CSV_URL, { headers: UA });
    if (r.ok) flood = parseTma(await r.text());
  } catch {}
  let tide = null;
  try {
    const r = await fetch(BMKG_TIDE_URL, { headers: UA });
    if (r.ok) tide = parseTide(await r.text());
  } catch {}
  let radar = null;
  try {
    if (rvRes.status === "fulfilled" && rvRes.value.ok) {
      const j = await rvRes.value.json();
      const last = j.radar && j.radar.past && j.radar.past[j.radar.past.length - 1];
      if (last && last.path) radar = { path: last.path, time: last.time };
    }
  } catch {}
  const byConfidence = { high: 0, nominal: 0, low: 0 };
  for (const h of points) byConfidence[h.confidence]++;
  const at = Date.now();
  return { at, fetchedAt: new Date(at).toISOString(), hotOk, atcsOk, radar, tide,
    sources: { cctv: BJM_API, hotspot: FIRMS_SOURCES.map(s => s.url), weather: "Open-Meteo Banjarmasin", quake: QUAKE_URL },
    note: "Hotspot FIRMS difilter kotak Kalsel (lat -4.8..-1.9, lng 114.3..116.9), bukan batas provinsi persis. Titik panas = deteksi satelit, bukan kebakaran terverifikasi.",
    cctv: { count: cameras.length, cameras },
    hotspot: { count: points.length, high: highPoints.length, byConfidence, highPoints, points: points.slice(0, 500) },
    weather, weatherCities, airQuality, airQualityCities, quakesNear, quake, flood };
}
const out = process.argv[2] || "summary.json";
const d = await getSummary();
writeFileSync(out, JSON.stringify(d));
console.log(`summary ditulis ke ${out}: CCTV ${d.cctv.count} (ATCS ${d.atcsOk ? "ok" : "gagal"}), hotspot ${d.hotspot.count} (tinggi ${d.hotspot.high}), gempa ${d.quake ? "ok" : "gagal"}, pasang ${d.tide ? "ok" : "gagal"}, TMA ${d.flood ? d.flood.posts.length + " pos" : "gagal"}, fetchedAt ${d.fetchedAt}`);
