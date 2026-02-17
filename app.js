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
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function getCheckedValues(name) {
  return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}

function parseKeywords(s) {
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

function simpleId(prefix = "evt") {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
}

function setStatus(text, kind="warn") {
  const el = $("submitStatus");
  el.textContent = text;
  el.className = "status " + kind;
}

function updatePreview(jsonObj) {
  $("jsonPreview").textContent = JSON.stringify(jsonObj, null, 2);
}

// ===== JSON生成 =====
function buildJSON() {
  return {
    event_id: simpleId(),
    title: $("title").value.trim(),
    place: {
      name: $("placeName").value.trim(),
      lat: $("lat").value ? Number($("lat").value) : null,
      lon: $("lon").value ? Number($("lon").value) : null
    },
    time: {
      start_at: $("startAt").value || null,
      end_at: $("endAt").value || null
    },
    what_happened: $("whatHappened").value.trim(),
    actors: { tags: getCheckedValues("actors") },
    actions: { tags: getCheckedValues("actions") },
    narrative_seeds: {
      expectation: $("expectation").value || null,
      surprise: $("surprise").value || null
    },
    evidence: { photos:[], videos:[], audios:[], docs:[] },
    provenance: {
      recorder: $("nameOrId").value || null,
      privacy: $("privacy").value || null,
      affiliation: $("affiliation").value.trim()
    },
    created_at: new Date().toISOString()
  };
}

// ===== Storageアップロード =====
async function uploadFiles(inputId, prefix, eventId) {
  const files = Array.from($(inputId).files || []);
  const uploaded = [];

  for (const file of files) {
    const path = `${prefix}/${eventId}/${Date.now()}_${file.name}`;
    const { error } = await supabaseClient.storage.from(BUCKET).upload(path, file);

    if (error) throw new Error(error.message);

    uploaded.push({ path, name:file.name, type:file.type, size:file.size });
  }
  return uploaded;
}

// ===== DB保存 =====
async function saveToDB(data) {
  const { error } = await supabaseClient.from(TABLE).insert({
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
  if (error) throw new Error(error.message);
}

// ===== 送信処理 =====
$("eventForm").addEventListener("submit", async (e) => {
  e.preventDefault();

  // クールダウンチェック
  if (Date.now() < cooldownUntil) {
    setStatus("クールダウン中です。少し待ってください。");
    return;
  }

  // 所属大学チェック
  if ($("affiliation").value.trim() !== "中部大学") {
    setStatus("所属大学が一致しません。「中部大学」と入力してください。");
    return;
  }

  setStatus("保存中…");

  try {
    const data = buildJSON();
    updatePreview(data);

    data.evidence.photos = await uploadFiles("photos","photos",data.event_id);
    data.evidence.videos = await uploadFiles("videos","videos",data.event_id);
    data.evidence.audios = await uploadFiles("audios","audios",data.event_id);
    data.evidence.docs   = await uploadFiles("docs","docs",data.event_id);

    await saveToDB(data);

    setStatus("保存成功", "ok");
    startCooldown(10);

  } catch(err) {
    console.error(err);
    setStatus("保存失敗：" + err.message);
  }
});

// 初期値
$("startAt").value = nowLocalISO();
