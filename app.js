// ===== Supabase接続 =====
const SUPABASE_URL = "https://cwjxfwizoucgfaypiyas.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3anhmd2l6b3VjZ2ZheXBpeWFzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEzMjc2NjAsImV4cCI6MjA4NjkwMzY2MH0.YvzznVStYbwdmP1J6ZCIq3I4qKCHrK_jQbCXu6fhlKI";

const BUCKET = "uploads";
const TABLE = "events";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const $ = (id) => document.getElementById(id);

// ===== クールダウン管理 =====
let cooldownUntil = 0;

function startCooldown(seconds = 10) {
  cooldownUntil = Date.now() + seconds * 1000;
  const btn = $("btnSubmit");

  const tick = () => {
    const remain = Math.max(0, Math.ceil((cooldownUntil - Date.now()) / 1000));
    if (remain <= 0) {
      btn.disabled = false;
      btn.textContent = "JSONを生成して保存";
      return;
    }
    btn.disabled = true;
    btn.textContent = `クールダウン中（${remain}秒）`;
    setTimeout(tick, 250);
  };
  tick();
}

// ===== 共通関数 =====
function nowLocalISO() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map((el) => el.value);
}

function parseKeywords(s) {
  if (!s) return [];
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

function simpleId(prefix = "evt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function setStatus(text, kind = "warn") {
  const el = $("submitStatus");
  el.textContent = text;
  el.className = "status " + kind;
}

function setGeoStatus(text, kind = "warn") {
  const el = $("geoStatus");
  el.textContent = text;
  el.classList.remove("ok", "warn");
  el.classList.add(kind);
}

function updatePreview(jsonObj) {
  $("jsonPreview").textContent = JSON.stringify(jsonObj, null, 2);
}

function toNumberOrNull(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v) {
  const s = (v ?? "").toString().trim();
  return s ? s : null;
}

function sanitizeFilename(name) {
  return name.replace(/[^\w.\-()]+/g, "_");
}

// ===== JSON生成（フォーム全項目反映） =====
function buildJSON() {
  const lat = toNumberOrNull($("lat").value);
  const lon = toNumberOrNull($("lon").value);

  return {
    schema: "town-experience-proto-narrative-form@0.2",
    event_id: simpleId(),
    affiliation: $("affiliation").value.trim(),
    title: $("title").value.trim(),
    time: {
      start_at: $("startAt").value || null,
      end_at: $("endAt").value || null
    },
    categorization: {
      event_type: $("eventType").value || null,
      mode: $("mode").value || null
    },
    place: {
      name: $("placeName").value.trim(),
      lat,
      lon,
      map_url: (lat !== null && lon !== null) ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}` : null
    },
    what_happened: $("whatHappened").value.trim(),
    actors: {
      tags: getCheckedValues("actors"),
      note: toStringOrNull($("actorsNote").value)
    },
    actions: {
      tags: getCheckedValues("actions"),
      stay_minutes: toNumberOrNull($("stayMin").value),
      crowd: $("crowd").value || null
    },
    environment: {
      weather: $("weather").value || null,
      temperature_feel: $("tempFeel").value || null,
      sound_tags: getCheckedValues("soundTags"),
      smell_tags: getCheckedValues("smellTags"),
      light: $("light").value || null,
      mood: $("mood").value || null,
      note: toStringOrNull($("envNote").value)
    },
    narrative_seeds: {
      expectation: toStringOrNull($("expectation").value),
      surprise: toStringOrNull($("surprise").value),
      turning_point: toStringOrNull($("turningPoint").value),
      after_feeling: toStringOrNull($("afterFeeling").value),
      before_after_change: toStringOrNull($("beforeAfter").value),
      comparison: toStringOrNull($("comparison").value),
      want_return: $("wantReturn").value || null,
      keywords: parseKeywords($("keywords").value)
    },
    evidence: {
      photos: [],
      videos: [],
      audios: [],
      docs: [],
      note: toStringOrNull($("evidenceNote").value)
    },
    provenance: {
      source_type: $("sourceType").value || null,
      confidence: $("confidence").value || null,
      privacy: $("privacy").value || null,
      recorder: toStringOrNull($("nameOrId").value),
      notes: toStringOrNull($("notes").value)
    },
    created_at: new Date().toISOString()
  };
}

// ===== Storageアップロード =====
async function uploadFiles(inputId, prefix, eventId) {
  const input = $(inputId);
  const files = Array.from(input.files || []);
  const uploaded = [];

  for (const file of files) {
    const safeName = sanitizeFilename(file.name);
    const path = `${prefix}/${eventId}/${Date.now()}_${safeName}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file, { upsert: false });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    uploaded.push({ bucket: BUCKET, path, name: file.name, type: file.type || null, size: file.size });
  }
  return uploaded;
}

// ===== DB保存 =====
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

  const { error } = await supabaseClient.from(TABLE).insert(row);
  if (error) throw new Error(`DB insert failed: ${error.message}`);
}

// ===== 位置情報ボタン（修正ポイント） =====
function initGeo() {
  const btnGeo = $("btnGeo");
  const btnMap = $("btnMap");

  btnGeo.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setGeoStatus("このブラウザは位置情報に対応していません。", "warn");
      return;
    }

    setGeoStatus("取得中…", "warn");

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        $("lat").value = Number(latitude).toFixed(6);
        $("lon").value = Number(longitude).toFixed(6);
        setGeoStatus(`取得しました（精度 約${Math.round(accuracy)}m）。`, "ok");
      },
      (err) => {
        setGeoStatus(`取得できませんでした（${err.message}）。`, "warn");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });

  btnMap.addEventListener("click", () => {
    const lat = toNumberOrNull($("lat").value);
    const lon = toNumberOrNull($("lon").value);
    if (lat === null || lon === null) {
      setGeoStatus("緯度・経度が空です。先に現在地を取得するか数値を入力してください。", "warn");
      return;
    }
    const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

// ===== 送信処理 =====
function initSubmit() {
  $("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (Date.now() < cooldownUntil) {
      setStatus("クールダウン中です。少し待ってください。", "warn");
      return;
    }

    if ($("affiliation").value.trim() !== "中部大学") {
      setStatus("所属大学が一致しません。「中部大学」と入力してください。", "warn");
      return;
    }

    const btn = $("btnSubmit");
    btn.disabled = true;
    setStatus("保存中…", "warn");

    try {
      const data = buildJSON();
      updatePreview(data);

      data.evidence.photos = await uploadFiles("photos", "photos", data.event_id);
      data.evidence.videos = await uploadFiles("videos", "videos", data.event_id);
      data.evidence.audios = await uploadFiles("audios", "audios", data.event_id);
      data.evidence.docs = await uploadFiles("docs", "docs", data.event_id);

      updatePreview(data);

      await saveToDB(data);

      setStatus("保存成功（Supabaseに保存しました）", "ok");
      startCooldown(10);
    } catch (err) {
      console.error(err);
      setStatus("保存失敗：" + err.message, "warn");
      btn.disabled = false;
    }
  });
}

// ===== 初期化 =====
document.addEventListener("DOMContentLoaded", () => {
  $("startAt").value = nowLocalISO();
  setGeoStatus("未取得", "warn");
  initGeo();
  initSubmit();
});
