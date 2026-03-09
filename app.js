import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ===== 固定設定 =====
const SUPABASE_URL = "https://cwjxfwizoucgfaypiyas.supabase.co";
const BUCKET = "uploads";
const TABLE = "events";

let supabaseClient = null;
let runtimeEventName = "";
let cooldownUntil = 0;

const $ = (id) => document.getElementById(id);

// ===== クールダウン管理 =====
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
  el.className = `status ${kind}`;
}

function setTeacherStatus(text, kind = "warn") {
  const el = $("teacherStatus");
  el.textContent = text;
  el.className = `status ${kind}`;
}

function updatePreview(jsonObj) {
  $("jsonPreview").textContent = JSON.stringify(jsonObj, null, 2);
}

function initSupabase(anonKey) {
  if (!anonKey) {
    throw new Error("anon key がありません。");
  }
  supabaseClient = createClient(SUPABASE_URL, anonKey);
}

function parseRuntimeConfig() {
  const hash = location.hash ? location.hash.slice(1) : "";
  const query = location.search ? location.search.slice(1) : "";
  const raw = hash || query;
  const params = new URLSearchParams(raw);

  return {
    eventName: (params.get("event_name") || "").trim(),
    anonKey: (params.get("k") || "").trim()
  };
}

function buildChildUrl(eventName, anonKey) {
  const base = `${location.origin}${location.pathname}`;
  const params = new URLSearchParams();
  params.set("event_name", eventName);
  params.set("k", anonKey);
  return `${base}#${params.toString()}`;
}

function setModeTeacher() {
  $("teacherPanel").hidden = false;
  $("formPanel").hidden = true;
}

function setModeChild(eventName) {
  runtimeEventName = eventName;
  $("teacherPanel").hidden = true;
  $("formPanel").hidden = false;
  $("currentEventName").textContent = eventName || "未設定";
}

function valueOrNull(id) {
  const el = $(id);
  if (!el) return null;
  const value = (el.value || "").trim();
  return value || null;
}

function numberOrNull(id) {
  const el = $(id);
  if (!el) return null;
  if (el.value === "") return null;
  const n = Number(el.value);
  return Number.isFinite(n) ? n : null;
}

function resolveMapHint(lat, lon) {
  const manual = valueOrNull("mapHint");
  if (manual) return manual;
  if (lat !== null && lon !== null) {
    return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=18/${lat}/${lon}`;
  }
  return null;
}

// ===== JSON生成 =====
function buildJSON() {
  const lat = numberOrNull("lat");
  const lon = numberOrNull("lon");

  return {
    schema: "town-experience-proto-narrative-form@0.2",
    event_id: simpleId(),
    event_name: runtimeEventName || null,
    title: valueOrNull("title"),
    place: {
      name: valueOrNull("placeName"),
      lat,
      lon,
      map_hint: resolveMapHint(lat, lon)
    },
    time: {
      start_at: $("startAt").value || null,
      end_at: $("endAt").value || null
    },
    categorization: {
      event_type: valueOrNull("eventType"),
      mode: valueOrNull("mode")
    },
    what_happened: valueOrNull("whatHappened"),
    actors: {
      tags: getCheckedValues("actors"),
      note: valueOrNull("actorsNote")
    },
    actions: {
      tags: getCheckedValues("actions"),
      stay_minutes: numberOrNull("stayMin"),
      crowd: valueOrNull("crowd")
    },
    environment: {
      weather: valueOrNull("weather"),
      temperature_feel: valueOrNull("tempFeel"),
      light: valueOrNull("light"),
      mood: valueOrNull("mood"),
      sound_tags: getCheckedValues("soundTags"),
      smell_tags: getCheckedValues("smellTags"),
      note: valueOrNull("envNote")
    },
    narrative_seeds: {
      expectation: valueOrNull("expectation"),
      surprise: valueOrNull("surprise"),
      turning_point: valueOrNull("turningPoint"),
      after_feeling: valueOrNull("afterFeeling"),
      before_after_change: valueOrNull("beforeAfter"),
      comparison: valueOrNull("comparison"),
      want_return: valueOrNull("wantReturn"),
      keywords: parseKeywords($("keywords").value || "")
    },
    evidence: {
      photos: [],
      videos: [],
      audios: [],
      docs: [],
      note: valueOrNull("evidenceNote")
    },
    provenance: {
      source_type: valueOrNull("sourceType"),
      confidence: valueOrNull("confidence"),
      privacy: valueOrNull("privacy"),
      recorder: valueOrNull("nameOrId"),
      notes: valueOrNull("provNotes"),
      affiliation: valueOrNull("affiliation")
    },
    created_at: new Date().toISOString()
  };
}

// ===== ファイルアップロード =====
async function uploadFiles(inputId, prefix, eventId) {
  const files = Array.from($(inputId)?.files || []);
  const uploaded = [];

  for (const file of files) {
    const path = `${prefix}/${eventId}/${Date.now()}_${file.name}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file);

    if (error) {
      throw new Error(error.message);
    }

    uploaded.push({
      path,
      name: file.name,
      type: file.type,
      size: file.size,
      bucket: BUCKET
    });
  }

  return uploaded;
}

// ===== DB保存 =====
async function saveToDB(data) {
  const { error } = await supabaseClient.from(TABLE).insert({
    event_name: data.event_name,
    title: data.title,
    start_at: data.time.start_at,
    end_at: data.time.end_at,
    place_name: data.place.name,
    lat: data.place.lat,
    lon: data.place.lon,
    payload: data,
    recorder: data.provenance.recorder,
    privacy: data.provenance.privacy
  });

  if (error) {
    throw new Error(error.message);
  }
}

// ===== JSONダウンロード =====
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

// ===== 先生用URL生成 =====
function setupTeacherPanel() {
  $("btnGenerateChildUrl").addEventListener("click", () => {
    const eventName = $("teacherEventName").value.trim();
    const anonKey = $("teacherAnonKey").value.trim();

    if (!eventName) {
      setTeacherStatus("event_name を入力してください。");
      return;
    }

    if (!anonKey) {
      setTeacherStatus("anon key を入力してください。");
      return;
    }

    const url = buildChildUrl(eventName, anonKey);
    $("childUrl").value = url;
    setTeacherStatus("子ども用URLを生成しました。", "ok");
  });

  $("btnCopyChildUrl").addEventListener("click", async () => {
    const url = $("childUrl").value.trim();
    if (!url) {
      setTeacherStatus("先にURLを生成してください。");
      return;
    }

    try {
      await navigator.clipboard.writeText(url);
      setTeacherStatus("URLをコピーしました。", "ok");
    } catch {
      setTeacherStatus("コピーに失敗しました。手動でコピーしてください。");
    }
  });

  $("btnBackToTeacher").addEventListener("click", () => {
    history.replaceState(null, "", location.pathname);
    setModeTeacher();
  });
}

// ===== 位置情報と地図 =====
function setupGeoAndMap() {
  $("btnGeo").addEventListener("click", () => {
    const status = $("geoStatus");

    if (!navigator.geolocation) {
      status.textContent = "このブラウザは位置情報に対応していません。";
      status.className = "status warn";
      return;
    }

    status.textContent = "取得中…";
    status.className = "status warn";

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        $("lat").value = latitude.toFixed(6);
        $("lon").value = longitude.toFixed(6);
        $("mapHint").value = `https://www.openstreetmap.org/?mlat=${latitude.toFixed(6)}&mlon=${longitude.toFixed(6)}#map=18/${latitude.toFixed(6)}/${longitude.toFixed(6)}`;
        status.textContent = `取得しました（精度 約${Math.round(accuracy)}m）。`;
        status.className = "status ok";
      },
      (err) => {
        status.textContent = `取得できませんでした（${err.message}）。`;
        status.className = "status warn";
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  });

  $("btnMap").addEventListener("click", () => {
    const lat = $("lat").value;
    const lon = $("lon").value;
    const mapHint = $("mapHint").value.trim();

    if (mapHint) {
      window.open(mapHint, "_blank", "noopener,noreferrer");
      return;
    }

    if (!lat || !lon) {
      $("geoStatus").textContent = "緯度・経度が空です。先に入力するか現在地を取得してください。";
      $("geoStatus").className = "status warn";
      return;
    }

    const url = `https://www.openstreetmap.org/?mlat=${encodeURIComponent(lat)}&mlon=${encodeURIComponent(lon)}#map=18/${encodeURIComponent(lat)}/${encodeURIComponent(lon)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  });
}

// ===== ダウンロードとクリア =====
function setupLocalButtons() {
  $("btnDownload").addEventListener("click", () => {
    const text = $("jsonPreview").textContent.trim();
    if (!text || text === "{}") {
      setStatus("先にJSONを生成してください。");
      return;
    }
    const obj = JSON.parse(text);
    downloadJSON(obj);
  });

  $("btnClear").addEventListener("click", () => {
    if (!confirm("入力をクリアします。よろしいですか？")) return;
    $("eventForm").reset();
    $("startAt").value = nowLocalISO();
    $("affiliation").value = "中部大学";
    $("jsonPreview").textContent = "{}";
    $("submitStatus").textContent = "まだ生成していません。ここにJSONが表示されます。";
    $("submitStatus").className = "status warn";
    $("geoStatus").textContent = "未取得";
    $("geoStatus").className = "status warn";
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      const requiredOk =
        $("title").value.trim() &&
        $("placeName").value.trim() &&
        $("whatHappened").value.trim() &&
        $("startAt").value;
      if (!requiredOk) return;
      const obj = buildJSON();
      updatePreview(obj);
      try {
        localStorage.setItem("town_experience_last_json", JSON.stringify(obj));
      } catch (_) {}
    }
  });
}

// ===== 送信処理 =====
function setupSubmit() {
  $("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    if (Date.now() < cooldownUntil) {
      setStatus("クールダウン中です。少し待ってください。");
      return;
    }

    if (!supabaseClient) {
      setStatus("Supabaseの初期化に失敗しています。先生用URLを作り直してください。");
      return;
    }

    if (!runtimeEventName) {
      setStatus("event_name が未設定です。先生用URLを確認してください。");
      return;
    }

    if ($("affiliation").value.trim() !== "中部大学") {
      setStatus("所属大学が一致しません。「中部大学」と入力してください。");
      return;
    }

    setStatus("保存中…");

    try {
      const data = buildJSON();
      updatePreview(data);

      data.evidence.photos = await uploadFiles("photos", "photos", data.event_id);
      data.evidence.videos = await uploadFiles("videos", "videos", data.event_id);
      data.evidence.audios = await uploadFiles("audios", "audios", data.event_id);
      data.evidence.docs = await uploadFiles("docs", "docs", data.event_id);

      updatePreview(data);
      await saveToDB(data);

      try {
        localStorage.setItem("town_experience_last_json", JSON.stringify(data));
      } catch (_) {}

      setStatus("保存成功", "ok");
      startCooldown(10);

      $("eventForm").reset();
      $("startAt").value = nowLocalISO();
      $("affiliation").value = "中部大学";
      $("jsonPreview").textContent = "{}";
      $("geoStatus").textContent = "未取得";
      $("geoStatus").className = "status warn";
    } catch (err) {
      console.error(err);
      setStatus(`保存失敗：${err.message}`);
    }
  });
}

// ===== 起動 =====
window.addEventListener("DOMContentLoaded", () => {
  $("startAt").value = nowLocalISO();
  $("affiliation").value = "中部大学";

  setupTeacherPanel();
  setupGeoAndMap();
  setupLocalButtons();
  setupSubmit();

  try {
    const last = localStorage.getItem("town_experience_last_json");
    if (last) {
      $("jsonPreview").textContent = JSON.stringify(JSON.parse(last), null, 2);
      $("submitStatus").textContent = "前回生成したJSONをプレビューに表示しています。新規生成で上書きされます。";
      $("submitStatus").className = "status ok";
    }
  } catch (_) {}

  const conf = parseRuntimeConfig();

  if (conf.eventName && conf.anonKey) {
    try {
      initSupabase(conf.anonKey);
      setModeChild(conf.eventName);
    } catch (err) {
      console.error(err);
      setModeTeacher();
      setTeacherStatus(`初期化失敗：${err.message}`);
    }
  } else {
    setModeTeacher();
  }
});
