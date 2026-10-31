const map = L.map("map", { scrollWheelZoom: false, minZoom: 7, maxZoom: 18, maxBounds: [[-6, 108], [5, 120]], maxBoundsViscosity: 0.8 }).fitBounds([[-4.0, 108.8], [0.3, 115.2]]);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
const clusterIcon = (color) => (c) => L.divIcon({ html: `<div style="background:${color}">${c.getChildCount()}</div>`, className: "hot-cluster", iconSize: [40, 40] });
const cctvLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 50, iconCreateFunction: clusterIcon("#0EA5E9") }).addTo(map);
const hotLayer = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 60, iconCreateFunction: (c) => { const n = c.getChildCount(); return clusterIcon(n >= 50 ? "#DC2626" : n >= 20 ? "#F97316" : "#EAB308")(c); } }).addTo(map);
let D = null;
const hotPlaces = new Map();
function hotPopupHtml(h, place) {
  return `<b>${h.confidence.toUpperCase()}</b> · ${esc(h.source)}<br>FRP ${h.frp ?? "?"} MW<br>${wita(h.acquiredAt)}<br>${place ? `<span class="hot-place">${esc(place)}</span><br>` : ""}${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}`;
}
function wita(iso) { try { return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) + " WITA"; } catch { return iso; } }
// Escape untuk semua teks dari sumber luar (ATCS, BMKG, sheet TMA,
// Nominatim) sebelum dimasukkan ke innerHTML — tanpa ini, satu nilai
// berisi tag HTML dari sumber hulu akan jalan di browser pengunjung.
const esc = s => String(s ?? "").replace(/[&<>"']/g, ch => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
map.on("popupopen", (e) => {
  const src = e.popup._source;
  if (src && src._hotspot) {
    const h = src._hotspot, key = src._hotKey;
    const known = hotPlaces.get(key);
    if (known) e.popup.setContent(hotPopupHtml(h, known));
    else fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${h.lat}&lon=${h.lng}&zoom=10&addressdetails=1&accept-language=id`)
      .then(r => r.ok ? r.json() : null).then(j => {
        if (!j) return;
        const a = j.address || {};
        const parts = [a.village || a.town || a.municipality || a.suburb || a.hamlet, a.county || a.city, a.state].filter(Boolean);
        if (parts.length) {
          const text = parts.join(", ");
          hotPlaces.set(key, text);
          if (map._popup && map._popup._source === src) e.popup.setContent(hotPopupHtml(h, text));
        }
      }).catch(() => {});
  }
  const favBtn = e.popup.getElement().querySelector(".fav-btn");
  if (favBtn && src && src._fav) {
    const f = src._fav;
    const paint = () => { favBtn.textContent = isFav(f) ? "★ Favorit tersimpan — ketuk untuk hapus" : "☆ Simpan ke favorit"; };
    paint();
    favBtn.onclick = () => { toggleFav(f); paint(); renderFavs(); };
  }
});
  // Versi statis tanpa proxy video: tidak ada elemen <video> di popup
  // Banjarmasin — thumbnail langsung + tautan ke portal ATCS.
const toggles = { "show-cctv": true, "show-hot": true, "f-high": true, "f-nominal": true, "f-low": true };
function render() {
  if (!D) return;
  cctvLayer.clearLayers(); hotLayer.clearLayers();
  if (toggles["show-cctv"]) {
    for (const c of D.cctv.cameras) if (c.lat != null) {
      if (c.type === "link") {
        L.marker([c.lat, c.lng], { icon: L.divIcon({ html: '<span class="cctv-dot"></span>', className: "cctv-pin link-pin", iconSize: [28, 28] }) }).bindPopup(`<b>${esc(c.name)} (${esc(c.city)})</b><br>${esc(c.announcement)}<br><a href="${esc(c.playUrl)}" target="_blank" rel="noopener">Buka portal resmi ↗</a><br><small>Video tidak diputar di dashboard karena URL stream portal ini tidak tersedia untuk di-embed.</small>`).addTo(cctvLayer);
      } else if (c.type === "youtube") {
        const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ html: '<span class="cctv-dot"></span>', className: "cctv-pin yt-pin", iconSize: [28, 28] }) });
        m._fav = { name: c.name, lat: c.lat, lng: c.lng, city: "Pontianak" };
        m.bindPopup(`<b>${esc(c.name)} (Pontianak)</b><br><iframe src="${esc(c.playUrl)}" style="width:280px;max-width:80vw;height:157px;border:0;border-radius:10px" allow="autoplay; encrypted-media" allowfullscreen></iframe><br><small>Stream YouTube Dishub Pontianak. Kalau video tidak jalan, stream itu sudah berakhir, cek <a href="https://www.youtube.com/@CCTVDISHUBKOTAPONTIANAK/streams" target="_blank" rel="noopener">kanal Dishub</a>.</small><br><button type="button" class="chip fav-btn">☆ Simpan ke favorit</button>`).addTo(cctvLayer);
      } else {
        const m = L.marker([c.lat, c.lng], { icon: L.divIcon({ html: '<span class="cctv-dot"></span>', className: "cctv-pin", iconSize: [28, 28] }) });
        m._fav = { name: c.name, lat: c.lat, lng: c.lng, city: "Banjarmasin" };
        m.bindPopup(`<b>${esc(c.name)} (Banjarmasin)</b>${c.announcement ? `<br><small class="cam-ann">Status: ${esc(c.announcement)}</small>` : ""}<br><img src="${esc(c.thumbUrl)}" style="width:280px;max-width:80vw;border-radius:10px"><br><a href="${esc(c.playUrl)}" target="_blank" rel="noopener">Buka video di portal ATCS ↗</a><br><small>Video diputar di portal resmi: stream ATCS tidak bisa di-embed langsung karena tanpa izin cross-origin, dan versi statis ini tidak memakai proxy.</small><br><button type="button" class="chip fav-btn">☆ Simpan ke favorit</button>`).addTo(cctvLayer);
      }
    }
  }
  if (toggles["show-hot"]) {
    const keep = new Set(["high", "nominal", "low"].filter(c => toggles["f-" + c]));
    for (const h of D.hotspot.points.filter(h => keep.has(h.confidence))) {
      const hm = L.marker([h.lat, h.lng], { icon: L.divIcon({ className: "hot-dot " + h.confidence, iconSize: [12, 12] }) });
      hm._hotspot = h; hm._hotKey = h.lat + "," + h.lng;
      hm.bindPopup(hotPopupHtml(h, null)).addTo(hotLayer);
    }
  }
}
async function load() {
  document.getElementById("meta").textContent = "Memuat…";
  try {
    const r = await fetch("summary.json", { cache: "no-store" });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || r.status);
    D = d;
    watchCheck();
    watchQuakeCheck();
    document.getElementById("meta").textContent = "Diperbarui " + wita(d.fetchedAt) + " · data diperbarui tiap 30 menit";
    const banner = document.getElementById("alert-banner");
    if (banner) {
      const floodN = d.flood ? d.flood.alertCount : 0;
      const hotN = d.hotspot ? d.hotspot.high : 0;
      if (floodN || hotN) {
        const parts = [];
        if (floodN) parts.push(floodN + " pos TMA berstatus tidak Normal");
        if (hotN) parts.push(hotN + " titik panas kepercayaan tinggi di Kalsel");
        banner.textContent = "Siaga: " + parts.join(" · ") + " — ketuk untuk melihat detail.";
        banner.className = floodN ? "banner-danger" : "banner-warn";
        banner.hidden = false;
        banner.onclick = () => { activateTab(floodN ? "banjir" : "hotspot"); document.querySelector(".tabs").scrollIntoView(); };
      } else banner.hidden = true;
    }
    const icons = {
      cam: '<svg viewBox="0 0 24 24"><rect x="2" y="6" width="13" height="12" rx="2"/><circle cx="8.5" cy="12" r="3"/><path d="M15 10l7-4v12l-7-4z"/></svg>',
      fire: '<svg viewBox="0 0 24 24"><path d="M12 2C12 2 5 10 5 15a7 7 0 0 0 14 0C19 10 12 2 12 2Z"/></svg>',
      alert: '<svg viewBox="0 0 24 24"><path d="M12 3L2 20h20L12 3Z"/><path d="M12 10v4"/><circle cx="12" cy="17" r="0.5"/></svg>',
      temp: '<svg viewBox="0 0 24 24"><path d="M10 4a2 2 0 1 1 4 0v10.3a4.5 4.5 0 1 1-4 0V4Z"/><circle cx="12" cy="16.5" r="1.5"/></svg>',
      wind: '<svg viewBox="0 0 24 24"><path d="M3 8h9a3 3 0 1 0-3-3"/><path d="M2 12h13a3 3 0 1 1-3 3"/><path d="M3 16h6"/></svg>',
    };
    const stat = (icon, val, label) => `<div class="stat"><div class="stat-icon">${icons[icon]}</div><div><b>${val}</b><span>${label}</span></div></div>`;
    document.getElementById("cards").innerHTML =
      stat("cam", d.cctv.count, "CCTV") +
      stat("fire", d.hotspot.count, "Titik Panas") +
      stat("alert", d.hotspot.high, "Tinggi") +
      stat("temp", d.weather.now != null ? d.weather.now + "°C" : "—", d.weather.nowDesc || "Banjarmasin") +
      stat("wind", d.airQuality ? "AQI " + d.airQuality.aqi : "—", d.airQuality ? "PM2.5 " + d.airQuality.pm25 : "—");
    render();
    updateWxLayers();
    document.getElementById("cities").innerHTML = (d.weatherCities || []).map(c =>
      `<div class="city-card"><b>${esc(c.name)}</b><span class="temp">${c.temp != null ? c.temp + "°C" : "—"}</span><span>${esc(c.desc || "—")}</span></div>`).join("") || "Tidak termuat.";
    if (d.airQuality) {
      const a = d.airQuality, pct = Math.min(100, Math.round(a.aqi / 300 * 100));
      const col = a.aqi <= 50 ? "#16A34A" : a.aqi <= 100 ? "#EAB308" : a.aqi <= 150 ? "#F97316" : "#DC2626";
      const circ = 2 * Math.PI * 34;
      document.getElementById("aq").innerHTML = `<div class="aq-wrap"><svg class="aq-ring" viewBox="0 0 84 84"><circle class="bg" cx="42" cy="42" r="34"/><circle class="fg" cx="42" cy="42" r="34" stroke="${col}" stroke-dasharray="${circ * pct / 100} ${circ}"/></svg><div class="aq-text"><b>AQI ${a.aqi} (${esc(a.cat)})</b><span>PM2.5 ${a.pm25} µg/m³ · ${a.time ? wita(a.time) : ""}</span></div></div>`;
    } else { document.getElementById("aq").textContent = "Tidak termuat."; }
    const aqc = document.getElementById("aq-cities");
    if (aqc) {
      const others = (d.airQualityCities || []).filter(c => c.name !== "Banjarmasin");
      aqc.innerHTML = others.length ? others.map(c => {
        const col = c.aqi <= 50 ? "#16A34A" : c.aqi <= 100 ? "#EAB308" : c.aqi <= 150 ? "#F97316" : "#DC2626";
        return `<div class="city-card"><b>${esc(c.name)}</b><span class="temp" style="color:${col}">AQI ${c.aqi}</span><span>${esc(c.cat)}</span><span>PM2.5 ${c.pm25} µg/m³ · ${c.time ? wita(c.time) : ""}</span></div>`;
      }).join("") : "Tidak termuat.";
    }
    document.getElementById("weather").innerHTML = (d.weather.hourly || []).map(h =>
      `<div class="hour-card"><b>${wita(h.time)}</b><span class="t">${h.temp}°C</span><span>${esc(h.desc)}</span><span>Hujan ${h.precip} mm</span></div>`).join("") || "Tidak termuat.";
    document.getElementById("forecast-chips").innerHTML = (d.weatherCities || []).map(c =>
      `<button class="chip${c.name === forecastCity ? " active" : ""}" data-fc="${esc(c.name)}">${esc(c.name)}</button>`).join("");
    document.querySelectorAll("#forecast-chips .chip").forEach(b => b.addEventListener("click", () => {
      forecastCity = b.dataset.fc;
      document.querySelectorAll("#forecast-chips .chip").forEach(x => x.classList.remove("active"));
      b.classList.add("active");
      renderForecast();
    }));
    renderForecast();
    const maxFrp = d.hotspot.highPoints.length ? Math.max(...d.hotspot.highPoints.map(h => h.frp || 0), 1) : 1;
    document.getElementById("hotspots").innerHTML = d.hotspot.highPoints.map(h =>
      `<li data-lat="${h.lat}" data-lng="${h.lng}"><b>${h.frp ?? "?"} MW</b> · ${esc(h.source)} · ${wita(h.acquiredAt)}<br><span class="hot-place">${h.lat.toFixed(4)}, ${h.lng.toFixed(4)}</span><div class="frp-bar"><i style="width:${Math.round((h.frp || 0) / maxFrp * 100)}%"></i></div></li>`).join("") || "<li>Tidak ada titik kepercayaan tinggi di Kalsel dalam 24 jam terakhir.</li>";
    enrichHotspotPlaces();
    document.getElementById("quakes").innerHTML = (d.quakesNear || []).map(q => {
      const m = Number(q.magnitude), cls = m < 5 ? "mag-low" : m <= 6 ? "mag-mid" : "mag-high";
      return `<li><span class="mag ${cls}">M ${q.magnitude}</span>${esc(q.wilayah)} · ${Math.round(q.km)} km dari Banjarmasin · ${esc(q.tanggal)} ${esc(q.jam)}</li>`;
    }).join("") || "<li>Tidak termuat.</li>";
    document.getElementById("quake").textContent = d.quake ? `${d.quake.tanggal} ${d.quake.jam}, magnitudo ${d.quake.magnitude}, ${d.quake.wilayah}, kedalaman ${d.quake.kedalaman}` : "Tidak termuat.";
    const td = document.getElementById("tide");
    if (d.tide && d.tide.hours && d.tide.hours.length) {
      const nowMs = Date.now();
      let ci = d.tide.hours.findIndex(h => new Date(h.time).getTime() > nowMs) - 1;
      if (ci < 0) ci = 0;
      if (ci >= d.tide.hours.length) ci = d.tide.hours.length - 1;
      const cur = d.tide.hours[ci];
      const peak = d.tide.hours.reduce((a, b) => (b.value > a.value ? b : a));
      const nxt = d.tide.hours[ci + 1];
      const trend = nxt ? (nxt.value > cur.value ? `naik ke ${nxt.value} m jam berikut` : nxt.value < cur.value ? `turun ke ${nxt.value} m jam berikut` : "stabil jam berikut") : "";
      const chartHours = d.tide.hours.slice(ci, ci + 24);
      const cvals = chartHours.map(h => h.value);
      const cmn = Math.min(...cvals), cmx = Math.max(...cvals);
      const CW = 600, CH = 160, CP = 10;
      const CX = i => CP + (chartHours.length > 1 ? i / (chartHours.length - 1) * (CW - CP * 2) : CW / 2);
      const CY = v => { const r = (cmx - cmn) || 1; return CP + 10 + (1 - (v - cmn) / r) * (CH - CP * 2 - 30); };
      const cpts = chartHours.map((h, i) => CX(i).toFixed(1) + "," + CY(h.value).toFixed(1)).join(" ");
      const zeroY = (cmn < 0 && cmx > 0) ? CY(0) : null;
      const peakI = cvals.indexOf(cmx);
      const hourLabel = iso => { try { return new Date(iso).toLocaleString("id-ID", { timeZone: "Asia/Makassar", hour: "2-digit" }) + ".00"; } catch { return ""; } };
      const midI = Math.floor(chartHours.length / 2);
      td.innerHTML = `<div class="tide-now"><b>${cur.value} m</b><span>sekarang · ${wita(cur.time)} · ${trend}</span></div><div>Puncak tertinggi prakiraan: <b>${peak.value} m</b> · ${wita(peak.time)}</div><svg class="tide-chart" viewBox="0 0 ${CW} ${CH}" role="img" aria-label="Grafik pasang 24 jam">${zeroY != null ? `<line x1="${CP}" y1="${zeroY}" x2="${CW - CP}" y2="${zeroY}" class="tide-zero"/>` : ""}<polyline points="${cpts}" class="tide-line"/><circle cx="${CX(peakI)}" cy="${CY(cmx)}" r="4" class="tide-peak"/><text x="${CX(peakI)}" y="${Math.max(12, CY(cmx) - 10)}" class="tide-label">${cmx} m</text><text x="${CP}" y="${CH - 2}" class="tide-axis">${hourLabel(chartHours[0].time)}</text><text x="${CW / 2}" y="${CH - 2}" class="tide-axis" text-anchor="middle">${hourLabel(chartHours[midI].time)}</text><text x="${CW - CP}" y="${CH - 2}" class="tide-axis" text-anchor="end">${hourLabel(chartHours[chartHours.length - 1].time)}</text></svg><p class="note">Diterbitkan ${d.tide.issued ? d.tide.issued + " WIB" : "—"}.</p>`;
    } else td.textContent = "Tidak termuat.";
    const fl = document.getElementById("flood");
    const tabBanjir = document.querySelector('.tab[data-tab="banjir"]');
    if (d.flood) {
      const isAlert = p => !String(p.condition || "").toLowerCase().includes("normal");
      const sorted = [...d.flood.posts].sort((a, b) => (isAlert(b) - isAlert(a)));
      const cls = p => { const c = String(p.condition || "").toLowerCase(); return c.includes("bahaya") ? "cond-bahaya" : c.includes("siaga") ? "cond-siaga" : c.includes("waspada") ? "cond-waspada" : c.includes("normal") ? "cond-normal" : "cond-other"; };
      fl.innerHTML = sorted.map(p => `<li><span class="flood-badge ${cls(p)}">${esc(p.condition || "—")}</span><b>${esc(p.name)}</b> · ${esc(p.reading)} m · ${esc(p.date)}${p.category ? ` <span class="flood-cat">${esc(p.category)}</span>` : ""}</li>`).join("");
      if (tabBanjir) { if (d.flood.alertCount) { tabBanjir.textContent = `Banjir (${d.flood.alertCount})`; tabBanjir.classList.add("tab-alert"); } }
    } else { fl.innerHTML = "<li>Tidak termuat.</li>"; }
  } catch (e) { document.getElementById("meta").textContent = "Gagal memuat: " + e.message; }
}
for (const id of Object.keys(toggles)) {
  const btn = document.getElementById(id);
  btn.addEventListener("click", () => {
    toggles[id] = !toggles[id];
    btn.classList.toggle("active", toggles[id]);
    btn.setAttribute("aria-pressed", String(toggles[id]));
    render();
  });
}
document.getElementById("refresh").addEventListener("click", load);
function kmDist(a, b, c, d) {
  const r = 6371, p = Math.PI / 180;
  const x = (c - a) * p, y = (d - b) * p;
  const h = Math.sin(x / 2) ** 2 + Math.cos(a * p) * Math.cos(c * p) * Math.sin(y / 2) ** 2;
  return 2 * r * Math.asin(Math.sqrt(h));
}
let myLocMarker = null;
let lastPick = null, routeLayer = null;
function showNearest(la, lo, label) {
  const st = document.getElementById("nearest-status"), ul = document.getElementById("nearest-list");
  lastPick = { lat: la, lng: lo };
  if (routeLayer) { map.removeLayer(routeLayer); routeLayer = null; }
  document.getElementById("clear-route").hidden = true;
  document.getElementById("route-status").hidden = true;
  if (myLocMarker) map.removeLayer(myLocMarker);
  myLocMarker = L.circleMarker([la, lo], { radius: 9, color: "#fff", weight: 2, fillColor: "#0EA5E9", fillOpacity: 1 }).bindPopup(label).addTo(map);
  const near = D.cctv.cameras.filter(c => c.type !== "link" && c.lat != null)
    .map(c => ({ ...c, km: kmDist(la, lo, c.lat, c.lng) })).sort((a, b) => a.km - b.km).slice(0, 5);
  st.textContent = near.length ? "5 CCTV video terdekat dari titik itu:" : "Tidak ada kamera video dengan koordinat.";
  ul.innerHTML = near.map(c => `<li><span><b>${esc(c.name)}</b> (${esc(c.city)}) · ${c.km < 1 ? Math.round(c.km * 1000) + " m" : c.km.toFixed(1) + " km"}</span> <button type="button" class="mini-btn" data-code="${esc(c.code)}">Lihat di peta</button> <button type="button" class="mini-btn" data-route="${esc(c.code)}">Rute ke sini</button></li>`).join("");
  if (near.length) map.setView([la, lo], 13);
}
let picking = false;
document.getElementById("pick-loc").addEventListener("click", () => {
  const st = document.getElementById("nearest-status");
  if (!D) { st.textContent = "Tunggu data dimuat dulu."; return; }
  if (picking) return;
  picking = true;
  st.textContent = "Ketuk area kosong di peta pada posisi kamu (bukan pin/klaster, karena ketukan itu hanya memperbesar) — nanti muncul 5 CCTV terdekat dari titik itu.";
  document.getElementById("map").style.cursor = "crosshair";
  map.once("click", (e) => {
    picking = false;
    document.getElementById("map").style.cursor = "";
    showNearest(e.latlng.lat, e.latlng.lng, "Lokasi yang kamu tandai di peta");
  });
});
function openCameraPopup(code) {
  const cam = (D.cctv.cameras || []).find(c => c.code === code);
  if (!cam) return;
  let found = null;
  cctvLayer.eachLayer(l => { const ll = l.getLatLng && l.getLatLng(); if (ll && ll.lat === cam.lat && ll.lng === cam.lng) found = l; });
  if (found) cctvLayer.zoomToShowLayer(found, () => found.openPopup());
  else map.setView([cam.lat, cam.lng], 16);
}
// Cari kamera berdasarkan nama: hanya kamera video (Banjarmasin +
// Pontianak); pin portal dikecualikan karena bukan titik kamera.
// Minimal 2 huruf, maks 8 hasil, Enter = hasil pertama, Esc / ketuk
// di luar = tutup daftar.
const camSearch = document.getElementById("cam-search"), camResults = document.getElementById("cam-search-results");
function renderCamSearch() {
  const q = camSearch.value.trim().toLowerCase();
  if (q.length < 2 || !D || !D.cctv.cameras) { camResults.hidden = true; camResults.innerHTML = ""; return; }
  const hits = D.cctv.cameras.filter(c => c.type !== "link" && ((c.name || "").toLowerCase().includes(q) || (c.city || "").toLowerCase().includes(q))).slice(0, 8);
  camResults.innerHTML = hits.length
    ? hits.map(c => `<li><button type="button" class="search-item" data-code="${esc(c.code)}">${esc(c.name)} (${esc(c.city)})</button></li>`).join("")
    : `<li class="meta">Tidak ada kamera bernama “${esc(camSearch.value.trim())}”.</li>`;
  camResults.hidden = false;
}
camSearch.addEventListener("input", renderCamSearch);
camSearch.addEventListener("focus", renderCamSearch);
camSearch.addEventListener("keydown", (e) => {
  if (e.key === "Escape") { camResults.hidden = true; camSearch.blur(); }
  if (e.key === "Enter") {
    const first = camResults.querySelector("[data-code]");
    if (first) { openCameraPopup(first.dataset.code); camResults.hidden = true; }
  }
});
camResults.addEventListener("click", (e) => {
  const b = e.target.closest("[data-code]");
  if (b) { openCameraPopup(b.dataset.code); camResults.hidden = true; }
});
document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-row")) camResults.hidden = true;
});
document.getElementById("nearest").addEventListener("click", () => {
  const btn = document.getElementById("nearest"), box = document.getElementById("nearest-box"), st = document.getElementById("nearest-status"), ul = document.getElementById("nearest-list");
  box.hidden = false;
  if (!D) { st.textContent = "Tunggu data dimuat dulu."; return; }
  if (!navigator.geolocation) { st.textContent = "Perangkat ini tidak mendukung lokasi."; return; }
  btn.disabled = true; btn.textContent = "Mencari lokasi…"; st.textContent = "Meminta lokasi…";
  const blockedMsg = "Lokasi untuk situs ini sudah diblokir, jadi Chrome tidak akan meminta izin lagi. Ketuk ikon gembok di kiri address bar → Izin → Lokasi → Izinkan, lalu muat ulang halaman dan tekan CCTV Terdekat lagi. Kalau menu itu tidak ada, cek Pengaturan Android → Aplikasi → Chrome → Izin → Lokasi → Izinkan.";
  const runLoc = () => navigator.geolocation.getCurrentPosition(pos => {
    btn.disabled = false; btn.textContent = "CCTV Terdekat";
    showNearest(pos.coords.latitude, pos.coords.longitude, "Lokasi kamu (perkiraan GPS)");
  }, err => {
    btn.disabled = false; btn.textContent = "CCTV Terdekat";
    st.textContent = err.code === 1 ? blockedMsg : "Lokasi tidak didapat. Coba lagi di tempat dengan sinyal GPS lebih baik.";
  }, { enableHighAccuracy: true, timeout: 15000 });
  // Kalau situs ini sudah pernah diblokir, Chrome tidak menampilkan prompt
  // sama sekali — deteksi langsung dan tampilkan cara membukanya.
  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: "geolocation" }).then(p => {
      if (p.state === "denied") { btn.disabled = false; btn.textContent = "CCTV Terdekat"; st.textContent = blockedMsg; }
      else runLoc();
    }).catch(runLoc);
  } else runLoc();
});
document.getElementById("nearest-box").addEventListener("click", (e) => {
  const r = e.target.closest("[data-route]");
  if (r) { drawRoute(r.dataset.route); return; }
  const b = e.target.closest("[data-code]");
  if (b) openCameraPopup(b.dataset.code);
});
// Rute jalan dari titik terdekat terakhir ke kamera, via OSRM demo
// (tanpa kunci, data OpenStreetMap). Gagal = pesan, bukan garis palsu.
async function drawRoute(code) {
  const cam = (D.cctv.cameras || []).find(c => c.code === code);
  const rs = document.getElementById("route-status"), clr = document.getElementById("clear-route");
  if (!cam || !lastPick) return;
  rs.hidden = false; rs.textContent = "Menghitung rute…";
  try {
    const r = await fetch(`https://router.project-osrm.org/route/v1/driving/${lastPick.lng},${lastPick.lat};${cam.lng},${cam.lat}?overview=full&geometries=geojson`);
    const j = await r.json();
    if (j.code !== "Ok" || !j.routes || !j.routes.length) throw new Error("no route");
    const rt = j.routes[0];
    if (routeLayer) map.removeLayer(routeLayer);
    routeLayer = L.geoJSON(rt.geometry, { style: { color: "#16A34A", weight: 4 } }).addTo(map);
    map.fitBounds(routeLayer.getBounds());
    rs.textContent = `Rute ke ${cam.name}: ${(rt.distance / 1000).toFixed(1)} km, ±${Math.round(rt.duration / 60)} menit berkendara (OSRM, data OpenStreetMap).`;
    clr.hidden = false;
  } catch { rs.textContent = "Rute gagal dimuat. Coba lagi nanti."; }
}
document.getElementById("clear-route").addEventListener("click", () => {
  if (routeLayer) map.removeLayer(routeLayer);
  routeLayer = null;
  document.getElementById("clear-route").hidden = true;
  document.getElementById("route-status").hidden = true;
});
// Ringkasan siaga siap kirim: dirangkai dari data yang sudah dimuat,
// nilai kosong dilewati (bukan ditebak).
document.getElementById("copy-summary").addEventListener("click", async () => {
  const btn = document.getElementById("copy-summary"), st = document.getElementById("summary-status");
  if (!D) { st.hidden = false; st.textContent = "Tunggu data dimuat dulu."; return; }
  const cams = D.cctv.cameras || [];
  const bjm = cams.filter(c => c.city === "Banjarmasin").length;
  const ptk = cams.filter(c => c.city === "Pontianak").length;
  const links = cams.filter(c => c.type === "link").length;
  const hot = D.hotspot || {};
  const lines = [`Siaga Kalsel — ${wita(new Date().toISOString())}`,
    `CCTV: ${cams.length} titik (Banjarmasin ${bjm}, Pontianak ${ptk}, portal ${links})`,
    `Titik panas Kalsel 24 jam: ${hot.total ?? "?"} (tinggi ${hot.high ?? "?"})`];
  if (D.quake) lines.push(`Gempa terbaru: M ${D.quake.magnitude}, ${D.quake.wilayah} · ${D.quake.tanggal} ${D.quake.jam}`);
  if (D.tide && D.tide.hours && D.tide.hours.length) {
    let ci = D.tide.hours.findIndex(h => new Date(h.time).getTime() > Date.now()) - 1;
    if (ci < 0) ci = 0;
    lines.push(`Pasang Muara Barito: ${D.tide.hours[ci].value} m sekarang`);
  }
  if (D.flood) lines.push(`TMA BWS Kal III: ${D.flood.posts.length} pos, peringatan ${D.flood.alertCount}`);
  lines.push(`Detail: ${location.origin}${location.pathname}`);
  const text = lines.join("\n");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Ringkasan disalin!";
      st.hidden = true;
      setTimeout(() => { btn.textContent = "Salin ringkasan siaga"; }, 2000);
    } else throw new Error("no clipboard");
  } catch {
    st.hidden = false;
    st.textContent = "Salin otomatis gagal, salin teks ini:\n" + text;
  }
});
// Kamera favorit: hanya localStorage perangkat ini, tidak dikirim ke
// server. Kunci = koordinat (berlaku untuk Banjarmasin + Pontianak;
// pin portal tidak punya tombol favorit karena bukan titik kamera).
const FAV_KEY = "siaga-fav";
function loadFavs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch { return []; } }
function saveFavs(f) { try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch {} }
function favKey(f) { return f.lat + "," + f.lng; }
function isFav(f) { return loadFavs().some(x => favKey(x) === favKey(f)); }
function toggleFav(f) {
  const k = favKey(f);
  saveFavs(loadFavs().some(x => favKey(x) === k) ? loadFavs().filter(x => favKey(x) !== k) : [...loadFavs(), f]);
}
function renderFavs() {
  const box = document.getElementById("fav-box"), ul = document.getElementById("fav-list");
  const arr = loadFavs();
  box.hidden = !arr.length;
  ul.innerHTML = arr.map(f => `<li><b>${esc(f.name)}</b> (${esc(f.city)})<br><button type="button" class="chip chip-action" data-flat="${f.lat}" data-flng="${f.lng}">Lihat di peta</button> <button type="button" class="chip chip-action" data-fdel="${f.lat}" data-fdlng="${f.lng}">Hapus</button></li>`).join("");
}
document.getElementById("fav-box").addEventListener("click", (e) => {
  const go = e.target.closest("[data-flat]");
  const del = e.target.closest("[data-fdel]");
  if (go) {
    const lat = +go.dataset.flat, lng = +go.dataset.flng;
    let found = null;
    cctvLayer.eachLayer(l => { const ll = l.getLatLng && l.getLatLng(); if (ll && ll.lat === lat && ll.lng === lng) found = l; });
    if (found) cctvLayer.zoomToShowLayer(found, () => found.openPopup());
    else map.setView([lat, lng], 16);
  }
  if (del) {
    saveFavs(loadFavs().filter(x => !(x.lat === +del.dataset.fdel && x.lng === +del.dataset.fdlng)));
    renderFavs();
  }
});
renderFavs();
// Nama daerah titik panas dari Nominatim (OpenStreetMap), dicari satu per
// satu dengan jeda 1,1 detik agar tidak melanggar batas layanan (maks 1
// req/detik). Hanya 30 item pertama; sisanya tetap tampil koordinat.
// Gagal/tempat tak ditemukan = koordinat dibiarkan apa adanya.
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function enrichHotspotPlaces() {
  const items = [...document.querySelectorAll("#hotspots li[data-lat]")].slice(0, 30);
  for (const li of items) {
    const lat = li.dataset.lat, lng = li.dataset.lng;
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=10&addressdetails=1&accept-language=id`);
      if (r.ok) {
        const a = (await r.json()).address || {};
        const parts = [a.village || a.town || a.municipality || a.suburb || a.hamlet, a.county || a.city, a.state].filter(Boolean);
        const sp = li.querySelector(".hot-place");
        if (parts.length && sp) sp.textContent = parts.join(", ") + " · " + Number(lat).toFixed(4) + ", " + Number(lng).toFixed(4);
        if (parts.length) hotPlaces.set(li.dataset.lat + "," + li.dataset.lng, parts.join(", "));
      }
    } catch {}
    await sleep(1100);
  }
}
// Mode pantau titik panas: hanya selama halaman terbuka. Tiap load()
// (otomatis 10 menit / tombol muat ulang) membandingkan titik tinggi
// dengan set sebelumnya; titik baru memunculkan peringatan di halaman,
// notifikasi sistem bila izin diberikan, dan bunyi singkat bila audio
// diizinkan (konteks audio dibuat dari ketukan tombol = gestur user).
let watching = false, prevHighKeys = new Set(), audioCtx = null;
const highKey = h => h.lat.toFixed(4) + "," + h.lng.toFixed(4);
document.getElementById("watch-btn").addEventListener("click", async () => {
  watching = !watching;
  const btn = document.getElementById("watch-btn"), st = document.getElementById("watch-status"), al = document.getElementById("watch-alert");
  if (watching) {
    prevHighKeys = new Set((D && D.hotspot ? D.hotspot.highPoints : []).map(highKey));
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); await audioCtx.resume(); } catch {}
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {}
    btn.textContent = "Berhenti memantau";
    st.hidden = false;
    st.textContent = "Memantau aktif: titik panas tinggi baru akan memunculkan peringatan di sini selama halaman ini terbuka.";
  } else {
    btn.textContent = "Mulai pantau titik panas";
    st.hidden = true; al.hidden = true;
  }
});
function watchCheck() {
  if (!watching || !D || !D.hotspot) return;
  const keys = D.hotspot.highPoints.map(highKey);
  const fresh = keys.filter(k => !prevHighKeys.has(k));
  if (fresh.length && prevHighKeys.size) {
    const al = document.getElementById("watch-alert");
    al.textContent = "Titik panas tinggi BARU: " + fresh.length + " titik — lihat daftar di bawah.";
    al.hidden = false;
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Titik panas tinggi baru", { body: fresh.length + " titik baru di Kalsel." }); } catch {}
    try {
      if (audioCtx) {
        const o = audioCtx.createOscillator(), g = audioCtx.createGain();
        o.connect(g); g.connect(audioCtx.destination);
        o.frequency.value = 880; g.gain.setValueAtTime(0.15, audioCtx.currentTime);
        o.start(); o.stop(audioCtx.currentTime + 0.5);
      }
    } catch {}
  }
  prevHighKeys = new Set(keys);
}
// Prakiraan 7 hari: tanggal diformat manual dari UTC agar tidak geser
// hari bila zona waktu perangkat bukan WITA.
let forecastCity = "Banjarmasin";
function renderForecast() {
  const wrap = document.getElementById("forecast-list");
  const city = (D.weatherCities || []).find(c => c.name === forecastCity) || (D.weatherCities || [])[0];
  if (!city || !city.forecast) { wrap.textContent = "Tidak termuat."; document.getElementById("forecast-chart").innerHTML = ""; return; }
  const f = city.forecast, days = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"], months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  wrap.innerHTML = f.time.map((t, i) => {
    const [y, m, dd] = t.split("-").map(Number);
    const label = days[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()] + ", " + dd + " " + months[m - 1];
    return `<div class="fc-day"><b>${label}</b><span>${f.tmin[i]}°–${f.tmax[i]}°C</span><span>Hujan ${f.pop[i] ?? "?"}% · ${f.rain[i]} mm</span></div>`;
  }).join("");
  // Grafik: garis suhu maks (kuning) + min (biru), batang peluang hujan
  // di bawah, label hari singkat. Skala suhu dari min–maks 7 hari.
  const chart = document.getElementById("forecast-chart");
  const n = f.time.length;
  const tmn = Math.min(...f.tmin), tmx = Math.max(...f.tmax);
  const W = 600, H = 180, P = 12, BH = 34;
  const X = i => P + (n > 1 ? i / (n - 1) * (W - P * 2) : W / 2);
  const Y = v => { const r = (tmx - tmn) || 1; return P + 12 + (1 - (v - tmn) / r) * (H - P * 2 - BH - 24); };
  const pts = arr => arr.map((v, i) => X(i).toFixed(1) + "," + Y(v).toFixed(1)).join(" ");
  const shortDay = t => { const [y, m, dd] = t.split("-").map(Number); return days[new Date(Date.UTC(y, m - 1, dd)).getUTCDay()].slice(0, 3) + " " + dd; };
  chart.innerHTML = `<svg class="fc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Grafik cuaca 7 hari">${f.time.map((t, i) => `<rect x="${(X(i) - 12).toFixed(1)}" y="${(H - BH - 14 - ((f.pop[i] ?? 0) / 100 * BH)).toFixed(1)}" width="24" height="${((f.pop[i] ?? 0) / 100 * BH).toFixed(1)}" class="fc-pop"/>`).join("")}<polyline points="${pts(f.tmax)}" class="fc-max"/><polyline points="${pts(f.tmin)}" class="fc-min"/>${f.time.map((t, i) => `<text x="${X(i)}" y="${Math.max(12, Y(f.tmax[i]) - 6)}" class="fc-val" text-anchor="middle">${f.tmax[i]}°</text><text x="${X(i)}" y="${H - 2}" class="fc-label" text-anchor="${i === 0 ? "start" : i === n - 1 ? "end" : "middle"}">${shortDay(t)}</text>`).join("")}</svg>`;
}
// Lapisan cuaca peta: malam menggelapkan tile via filter CSS (bukan
// tile gelap CARTO — itu pernah menampilkan watermark API KEY
// REQUIRED); hujan memakai radar RainViewer bila ada, bila tidak ada
// memakai efek hujan CSS dari data cuaca Open-Meteo. Malam otomatis
// dari sunrise/sunset; tombol hanya mematikan lapisan cuaca.
let radarLayer = null, wxOn = true;
function updateWxLayers() {
  if (!D) return;
  const w = D.weather || {};
  const mapEl = document.getElementById("map");
  if (w.isNight) mapEl.classList.add("night"); else mapEl.classList.remove("night");
  const note = document.getElementById("wx-note"), fx = document.getElementById("rain-fx");
  if (radarLayer) { map.removeLayer(radarLayer); radarLayer = null; }
  if (wxOn && D.radar) {
    // Radar RainViewer hanya tersedia sampai zoom 7 (diverifikasi 31 Okt
    // 2026: tile zoom 7 berisi data, zoom 8+ mengembalikan gambar
    // "Zoom Level Not Supported"). maxNativeZoom membuat Leaflet
    // memperbesar tile zoom 7 saat pengguna zoom ke level jalan, jadi
    // tidak ada lagi kotak abu-abu itu — blob radar memang jadi kasar,
    // itu resolusi asli datanya, bukan bug.
    radarLayer = L.tileLayer("https://tilecache.rainviewer.com" + D.radar.path + "/256/{z}/{x}/{y}/2/1_1.png", { opacity: 0.55, maxNativeZoom: 7, attribution: "Radar: RainViewer" }).addTo(map);
    if (fx) fx.hidden = true;
    if (note) note.textContent = "Radar hujan RainViewer aktif." + (w.raining ? " Banjarmasin sedang hujan/gerimis." : "");
  } else if (wxOn && w.raining) {
    if (fx) fx.hidden = false;
    if (note) note.textContent = "Radar tidak tersedia, efek hujan dari data cuaca Open-Meteo (Banjarmasin sedang hujan/gerimis).";
  } else {
    if (fx) fx.hidden = true;
    if (note) note.textContent = wxOn ? "Lapisan cuaca aktif, tidak ada hujan terdeteksi." : "Lapisan cuaca dimatikan.";
  }
}
// Tautan berbagi: posisi peta + tab aktif dikodekan di hash URL, dibaca
// saat halaman dibuka (blok di akhir file). Salinan memakai Clipboard
// API, gagal = tautan ditampilkan sebagai teks untuk disalin manual.
document.getElementById("share-view").addEventListener("click", async () => {
  const c = map.getCenter(), z = map.getZoom();
  const tab = document.querySelector(".tab.active")?.dataset.tab || "cuaca";
  const url = location.origin + location.pathname + `#map=${c.lat.toFixed(4)},${c.lng.toFixed(4)},${z}&tab=${tab}`;
  const btn = document.getElementById("share-view"), st = document.getElementById("share-status");
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(url);
      btn.textContent = "Tautan disalin!";
      st.hidden = true;
      setTimeout(() => { btn.textContent = "Bagikan tampilan ini"; }, 2000);
    } else throw new Error("no clipboard");
  } catch {
    st.hidden = false;
    st.textContent = "Salin otomatis gagal, salin tautan ini: " + url;
  }
});
// Pantau gempa: pola yang sama dengan pantau titik panas, patokannya
// gempa terbaru nasional BMKG (tanggal+jam+wilayah). Peringatan hanya
// saat kunci berubah pada load() berikutnya.
let watchingQuake = false, prevQuakeKey = "";
const quakeKey = () => (D && D.quake ? D.quake.tanggal + "|" + D.quake.jam + "|" + D.quake.wilayah : "");
document.getElementById("watch-quake-btn").addEventListener("click", async () => {
  watchingQuake = !watchingQuake;
  const btn = document.getElementById("watch-quake-btn"), st = document.getElementById("watch-quake-status"), al = document.getElementById("watch-quake-alert");
  if (watchingQuake) {
    prevQuakeKey = quakeKey();
    try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {}
    btn.textContent = "Berhenti memantau gempa";
    st.hidden = false;
    st.textContent = "Memantau aktif: gempa terbaru BMKG yang baru akan memunculkan peringatan di sini selama halaman ini terbuka.";
  } else {
    btn.textContent = "Mulai pantau gempa";
    st.hidden = true; al.hidden = true;
  }
});
function watchQuakeCheck() {
  if (!watchingQuake || !D || !D.quake) return;
  const k = quakeKey();
  if (k && prevQuakeKey && k !== prevQuakeKey) {
    const al = document.getElementById("watch-quake-alert"), q = D.quake;
    al.textContent = `Gempa baru: M ${q.magnitude}, ${q.wilayah} · ${q.tanggal} ${q.jam}.`;
    al.hidden = false;
    try { if ("Notification" in window && Notification.permission === "granted") new Notification("Gempa baru", { body: `M ${q.magnitude}, ${q.wilayah}` }); } catch {}
  }
  if (k) prevQuakeKey = k;
}
document.getElementById("wx-layer").addEventListener("click", () => {
  wxOn = !wxOn;
  const b = document.getElementById("wx-layer");
  b.classList.toggle("active", wxOn); b.setAttribute("aria-pressed", String(wxOn));
  b.textContent = wxOn ? "Cuaca di peta: Aktif" : "Cuaca di peta: Mati";
  updateWxLayers();
});
function activateTab(name) {
  const btn = document.querySelector(`.tab[data-tab="${name}"]`);
  if (!btn) return;
  document.querySelectorAll(".tab").forEach(b => { b.classList.remove("active"); b.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".tabpanel").forEach(p => p.classList.remove("active"));
  btn.classList.add("active"); btn.setAttribute("aria-selected", "true");
  document.getElementById("panel-" + name).classList.add("active");
  setTimeout(() => map.invalidateSize(), 50);
}
document.querySelectorAll(".tab").forEach(btn => btn.addEventListener("click", () => activateTab(btn.dataset.tab)));
load();
setInterval(load, 600000);
// Pulihkan tampilan dari tautan berbagi (#map=lat,lng,zoom&tab=nama).
// Nilai di luar batas peta diabaikan; tab tak dikenal diabaikan oleh
// activateTab (tombol tidak ditemukan = kembali diam).
try {
  const h = new URLSearchParams(location.hash.slice(1));
  const m = (h.get("map") || "").split(",");
  if (m.length === 3 && m.every(v => Number.isFinite(Number(v)))) {
    const la = Number(m[0]), ln = Number(m[1]), zz = Math.max(7, Math.min(18, Math.round(Number(m[2]))));
    if (la >= -6 && la <= 5 && ln >= 108 && ln <= 120) map.setView([la, ln], zz);
  }
  const tab = h.get("tab");
  if (tab) activateTab(tab);
} catch {}
