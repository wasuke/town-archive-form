// ここを必ず自分の値に置き換える
const SUPABASE_URL = "https://xxxxx.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_PUBLIC_KEY";

// Supabase保存先（あなたの設定に合わせる）
const BUCKET = "uploads";   // Storageのバケット名
const TABLE = "events";     // DBのテーブル名

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (id) => document.getElementById(id);

function nowLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}

function parseKeywords(s) {
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function simpleId(prefix = "evt") {
  const t = Date.now().toString(36);
  const r = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${t}_${r}`;
}

function buildJSON() {
  const startAt = $("startAt").value || null;
  const endAt = $("endAt").value || null;

  const lat = $("lat").value !== "" ? Number($("lat").value) : null;
  const lon = $("lon").value !== "" ? Number($("lon").value) : null;

  return {
    schema: "town-experience-proto-narrative-form@0.1",
    event_id: simpleId("evt"),
    title: $("title").value.trim(),
    place: {
      name: $("placeName").value.trim(),
      lat,
      lon,
      map_hint: (lat !== null && lon !== null) ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}` : null
    },
    time: {
      start_at: startAt,
      end_at: endAt
    },
    categorization: {
      event_type: $("eventType").value || null,
      mode: $("mode").value || null
    },
    what_happened: $("whatHappened").value.trim(),
    actors: {
      tags: getCheckedValues("actors"),
      note: $("actorsNote").value.trim() || null
    },
    actions: {
      tags: getCheckedValues("actions"),
      stay_minutes: $("stayMin").value !== "" ? Number($("stayMin").value) : null,
      crowd: $("crowd").value || null
    },
    environment: {
      weather: $("weather").value || null,
      temperature_feel: $("tempFeel").value || null,
      light: $("light").value || null,
      mood: $("mood").value || null,
      sound_tags: getCheckedValues("soundTags"),
      smell_tags: getCheckedValues("smellTags"),
      note: $("envNote").value.trim() || null
    },
    narrative_seeds: {
      expectation: $("expectation").value.trim() || null,
      surprise: $("surprise").value.trim() || null,
      turning_point: $("turningPoint").value.trim() || null,
      after_feeling: $("afterFeeling").value.trim() || null,
      before_after_change: $("beforeAfter").value.trim() || null,
      comparison: $("comparison").value.trim() || null,
      want_return: $("wantReturn").value || null,
      keywords: parseKeywords($("keywords").value)
    },
    evidence: {
      photos: [],
      videos: [],
      audios: [],
      docs: [],
      note: $("evidenceNote").value.trim() || null
    },
    provenance: {
      source_type: $("sourceType").value || null,
      confidence: $("confidence").value || null,
      privacy: $("privacy").value || null,
      recorder: $("nameOrId").value.trim() || null,
      notes: $("notes").value.trim() || null
    },
    created_at: new Date().toISOString()
  };
}

function setStatus(text, kind = "warn") {
  const el = $("submitStatus");
  el.textContent = text;
  el.classList.remove("ok", "warn");
  el.classList.add(kind);
}

function updatePreview(jsonObj) {
  $("jsonPreview").textContent = JSON.stringify(jsonObj, null, 2);
}

function disableSubmit(disabled) {
  const btn = $("btnSubmit");
  if (btn) btn.disabled = disabled;
}

function sanitizeFilename(name) {
  return name.replace(/[^\w.\-()]+/g, "_");
}

async function uploadFiles(inputId, prefix, eventId) {
  const input = $(inputId);
  const files = Array.from(input.files || []);
  const uploaded = [];

  for (const file of files) {
    const safe = sanitizeFilename(file.name);
    const path = `${prefix}/${eventId}/${Date.now()}_${safe}`;

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false });

    if (error) {
      throw new Error(`Storage upload failed (${inputId}): ${error.message}`);
    }

    uploaded.push({ path, name: file.name, type: file.type || null, size: file.size });
  }

  return uploaded;
}

async function saveToDB(data) {
  const row = {
    title: data.title,
    start_at: data.time.start_at ? new Date(data.time.start_at).toISOString() : null,
    end_at: data.time.end_at ? new Date(data.time.end_at).toISOString() : null,
    place_name: data.place.name,
    lat: data.place.lat,
    lon: data.place.lon,
    payload: data,
    recorder: data.provenance.recorder,
    privacy: data.provenance.privacy
  };

  const { error } = await supabase.from(TABLE).insert(row);
  if (error) throw new Error(`DB insert failed: ${error.message}`);
}

function downloadJSON(jsonObj) {
  const blob = new Blob([JSON.stringify(jsonObj, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${jsonObj.event_id}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function initGeoButtons() {
  $("btnGeo").addEventListener("click", () => {
    const status = $("geoStatus");
    if (!navigator.geolocation) {
      status.textContent = "このブラウザは位置情報に対応していません。";
      status.classList.remove("ok");
      status.classList.add("warn");
      return;
    }
    status.textContent = "取得中…";
    status.classList.remove("ok");
    status.classList.add("warn");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        $("lat").value = latitude.toFixed(6);
        $("lon").value = longitude.toFixed(6);
        status.textContent = `取得しました（精度 約${Math.round(accuracy)}m）。`;
        status.classList.remove("warn");
        status.classList.add("ok");
      },
      (err) => {
        status.textContent = `取得できませんでした（${err.message}）。`;
        status.classList.remove("ok");
        status.classList.add("warn");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });

  $("btnMap").addEventListener("click", () => {
    const lat = $("lat").value;
    const lon = $("lon").value;
    if (!lat || !lon) {
      const status = $("geoStatus");
      status.textContent = "緯度・経度が空です。先に入力するか現在地を取得してください。";
      status.classList.remove("ok");
      status.classList.add("warn");
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

function initFormButtons() {
  $("btnDownload").addEventListener("click", () => {
    const text = $("jsonPreview").textContent.trim();
    if (!text || text === "{}") {
      setStatus("先にJSONを生成して保存してください。", "warn");
      return;
    }
    downloadJSON(JSON.parse(text));
  });

  $("btnClear").addEventListener("click", () => {
    if (!confirm("入力をクリアします。よろしいですか？")) return;
    $("eventForm").reset();
    $("startAt").value = nowLocalISO();
    $("jsonPreview").textContent = "{}";
    setStatus("まだ生成していません。ここにJSONが表示されます。", "warn");
    const geo = $("geoStatus");
    geo.textContent = "未取得";
    geo.classList.remove("ok");
    geo.classList.add("warn");
  });
}

function initShortcut() {
  document.addEventListener("keydown", async (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const requiredOk =
        $("title").value.trim() &&
        $("placeName").value.trim() &&
        $("whatHappened").value.trim() &&
        $("startAt").value;

      if (!requiredOk) return;
      $("eventForm").requestSubmit();
    }
  });
}

function initSubmit() {
  $("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    disableSubmit(true);
    setStatus("保存中…（ファイル→DBの順で処理します）", "warn");

    try {
      const data = buildJSON();
      updatePreview(data);

      // 1) Storageへアップロード（失敗したらDBへ入れない）
      data.evidence.photos = await uploadFiles("photos", "photos", data.event_id);
      data.evidence.videos = await uploadFiles("videos", "videos", data.event_id);
      data.evidence.audios = await uploadFiles("audios", "audios", data.event_id);
      data.evidence.docs   = await uploadFiles("docs",   "docs",   data.event_id);

      updatePreview(data);

      // 2) DBへ保存
      await saveToDB(data);

      setStatus("保存成功（Supabaseに保存しました）", "ok");

      try { localStorage.setItem("town_experience_last_json", JSON.stringify(data)); } catch (_) {}
    } catch (err) {
      setStatus(`保存失敗：${err.message}`, "warn");
      console.error(err);
    } finally {
      disableSubmit(false);
    }
  });
}

function restoreLastPreview() {
  try {
    const last = localStorage.getItem("town_experience_last_json");
    if (last) {
      $("jsonPreview").textContent = JSON.stringify(JSON.parse(last), null, 2);
      setStatus("前回生成したJSONをプレビューに表示しています。新規保存で上書きされます。", "ok");
    }
  } catch (_) {}
}

function main() {
  $("startAt").value = nowLocalISO();
  initGeoButtons();
  initFormButtons();
  initShortcut();
  initSubmit();
  restoreLastPreview();
}

main();
