// Mirrors the local data/db.json file to Supabase Postgres as an OFF-SERVER
// BACKUP. The local file (on a Railway Volume, see paths.js) is the primary
// store; Supabase is the safety net if the volume is ever lost.
//
// The whole app state is one JSONB row (app_state, id = 1). Every db.save()
// upserts it in the background after the local write has completed.
//
// SAFETY RULES (these exist because an earlier version could destroy good
// data - see the "pull failed" and "local is newer" cases below):
//
//   1. If the startup check FAILS (Supabase down, quota-restricted, bad
//      key...), we do NOT know what's in the cloud copy, so all pushes are
//      paused. Otherwise a freshly wiped container could later overwrite the
//      real cloud backup with an empty database. A background probe retries
//      every few minutes and resumes automatically if the cloud copy is not
//      newer than local; if it IS newer, a restart is required.
//
//   EGRESS: startup downloads only a timestamp unless the cloud copy is newer
//   than local. Pushes are debounced (5s), de-duplicated by content hash and
//   flushed on SIGTERM.
//
//   2. On startup, if the local file is NEWER than the cloud row (e.g. orders
//      were taken while Supabase was restricted), the local file wins and is
//      pushed up - it is NOT overwritten by the older cloud copy. A
//      brand-new default database (flagged _freshInstall, no orders yet)
//      never counts as "newer".
//
//   3. Whenever the cloud copy replaces an existing local file, the old
//      local file is first saved as data/db.local-backup.json.
//
// Requires SUPABASE_URL and SUPABASE_SERVICE_KEY (service_role key; server
// only). If either is missing, everything here is a no-op.
//
// Photos and receipts are NOT stored in Supabase Storage by default anymore
// (that is what exhausted the free egress quota). Set SUPABASE_STORAGE=true
// to opt back in - see getStorageClient().

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DATA_DIR } = require('./paths');

const DATA_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_FILE = path.join(DATA_DIR, 'db.local-backup.json');
const ROW_ID = 1;

let cachedClient; // undefined = not checked yet, null = checked and unavailable
function getClient() {
  if (cachedClient !== undefined) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    cachedClient = null;
    return cachedClient;
  }

  const { createClient } = require('@supabase/supabase-js');
  cachedClient = createClient(url, key);
  return cachedClient;
}

// Supabase Storage (photos/receipts) is OFF unless explicitly enabled. Photos
// live on the server volume instead, which has no per-GB quota like
// Supabase's free tier. Old receipts already stored as "supabase:<path>" are
// still readable via getClient() in the receipt route.
function getStorageClient() {
  if (process.env.SUPABASE_STORAGE !== 'true') return null;
  return getClient();
}

let syncPaused = false;
let lastPausedWarnAt = 0;
let probeTimer = null;
let lastPushedSavedAt = null; // _savedAt of the last state known to be in the cloud
let lastPushedHash = null;

const PUSH_DEBOUNCE_MS = 5000;        // coalesce bursts of saves into one upsert
const PROBE_INTERVAL_MS = 5 * 60000;  // how often a paused sync re-checks Supabase
const kb = n => (n / 1024).toFixed(1) + ' KB';

function pauseSync(reason) {
  syncPaused = true;
  console.warn('⚠️  Supabase check failed (' + reason + ').');
  console.warn('⚠️  Cloud sync is PAUSED so an unknown/empty state cannot overwrite the cloud backup.');
  console.warn('⚠️  Local data/db.json keeps working. Sync retries automatically every ' + (PROBE_INTERVAL_MS / 60000) + ' min.');
  scheduleProbe();
}

function readLocal() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    const data = JSON.parse(raw);
    const savedAt = data._savedAt ? Date.parse(data._savedAt) : fs.statSync(DATA_FILE).mtimeMs;
    return { data, savedAt: Number.isFinite(savedAt) ? savedAt : 0 };
  } catch {
    return null;
  }
}

// Tiny request (one timestamp, ~100 bytes). Decides whether the full row is
// worth downloading at all. Returns { error } | { remoteAt: number|null }.
async function fetchRemoteStamp(supabase) {
  const { data: row, error } = await supabase
    .from('app_state')
    .select('updated_at')
    .eq('id', ROW_ID)
    .maybeSingle();
  if (error) return { error };
  return { remoteAt: row ? (Date.parse(row.updated_at) || 0) : null };
}

async function pushNow(data) {
  const supabase = getClient();
  if (!supabase) return false;
  const bytes = Buffer.byteLength(JSON.stringify(data));
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: ROW_ID, data, updated_at: data._savedAt || new Date().toISOString() });
  if (error) {
    console.warn('⚠️  Supabase save failed (local data/db.json is still up to date):', error.message);
    return false;
  }
  lastPushedSavedAt = data._savedAt || null;
  console.log('☁️  Pushed state to Supabase (' + kb(bytes) + ').');
  return true;
}

// Called once at startup, before db.load(). Never throws.
// Egress cost on a normal restart: one timestamp. The full row is downloaded
// ONLY when the cloud copy is genuinely newer than the local file, or when
// there is no real local data (wiped volume / first run).
async function pullLatestIntoLocalFile() {
  const supabase = getClient();
  if (!supabase) return;

  try {
    const stamp = await fetchRemoteStamp(supabase);
    if (stamp.error) return pauseSync(stamp.error.message);

    const local = readLocal();
    const localIsReal = local && local.data._freshInstall !== true;
    const remoteAt = stamp.remoteAt;

    if (remoteAt === null) {
      console.log('ℹ️  No saved state in Supabase yet.');
      if (localIsReal) {
        console.log('ℹ️  Uploading the existing local data/db.json as the first cloud backup.');
        await pushNow(local.data);
      }
      return;
    }

    if (localIsReal && local.savedAt === remoteAt) {
      lastPushedSavedAt = local.data._savedAt || null;
      console.log('✅ Local data/db.json matches Supabase - no download needed.');
      return;
    }

    if (localIsReal && local.savedAt > remoteAt) {
      console.log('✅ Local data/db.json is newer than the Supabase copy - keeping local and syncing it up.');
      await pushNow(local.data);
      return;
    }

    // Cloud is newer, or local is missing/fresh: now (and only now) download.
    const { data: row, error } = await supabase
      .from('app_state')
      .select('data, updated_at')
      .eq('id', ROW_ID)
      .maybeSingle();
    if (error) return pauseSync(error.message);
    if (!row || !row.data) return pauseSync('cloud row vanished between checks');

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      try { fs.copyFileSync(DATA_FILE, BACKUP_FILE); } catch {}
    }
    const text = JSON.stringify(row.data, null, 2);
    fs.writeFileSync(DATA_FILE, text);
    lastPushedSavedAt = row.data._savedAt || null;
    console.log('✅ Restored data/db.json from Supabase (' + kb(Buffer.byteLength(text)) + ' downloaded).');
  } catch (err) {
    pauseSync(err.message);
  }
}

// While paused, periodically re-check with the tiny timestamp query. Resumes
// automatically if the cloud copy is not newer than what this process has.
// If the cloud is newer, a restart is still required: replacing the live
// in-memory state from here would be unsafe.
function scheduleProbe() {
  if (probeTimer) return;
  probeTimer = setTimeout(async () => {
    probeTimer = null;
    const supabase = getClient();
    if (!supabase || !syncPaused) return;
    try {
      const stamp = await fetchRemoteStamp(supabase);
      if (stamp.error) {
        console.warn('⚠️  Supabase still unavailable (' + stamp.error.message + ').');
        return scheduleProbe();
      }
      const local = readLocal();
      if (stamp.remoteAt !== null && (!local || local.savedAt < stamp.remoteAt)) {
        console.warn('⚠️  Supabase is back but its copy is NEWER than this server\'s. Sync stays paused; restart the service to restore safely.');
        return;
      }
      if (local && local.data._freshInstall !== true) {
        if (!(await pushNow(local.data))) return scheduleProbe();
      }
      syncPaused = false;
      console.log('✅ Supabase is healthy again - cloud sync resumed automatically.');
    } catch (err) {
      console.warn('⚠️  Supabase probe failed:', err.message);
      scheduleProbe();
    }
  }, PROBE_INTERVAL_MS);
  if (probeTimer.unref) probeTimer.unref();
}

// Debounced, de-duplicated background push. db.save() can fire many times a
// second during busy periods; only the latest state is sent, once, and only
// if it actually changed.
let pendingData = null;
let pushTimer = null;
let pushing = false;

async function flushPush() {
  pushTimer = null;
  if (!pendingData || syncPaused || pushing) {
    if (pendingData && pushing) schedulePush();
    return;
  }
  const data = pendingData;
  pendingData = null;
  pushing = true;
  try {
    const hash = crypto.createHash('sha1')
      .update(JSON.stringify({ ...data, _savedAt: undefined }))
      .digest('hex');
    if (hash === lastPushedHash) return;
    if (await pushNow(data)) lastPushedHash = hash;
    else { pendingData = pendingData || data; schedulePush(60000); } // retry later, not instantly
  } catch (err) {
    console.warn('⚠️  Supabase save failed (local data/db.json is still up to date):', err.message);
    pendingData = pendingData || data;
    schedulePush(60000);
  } finally {
    pushing = false;
  }
}

function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (pushTimer) return;
  pushTimer = setTimeout(flushPush, delay);
  if (pushTimer.unref) pushTimer.unref();
}

// Fire-and-forget, called from db.save() after the local write completed.
function pushToSupabaseInBackground(data) {
  const supabase = getClient();
  if (!supabase) return;

  if (syncPaused) {
    const now = Date.now();
    if (now - lastPausedWarnAt > 10 * 60 * 1000) {
      lastPausedWarnAt = now;
      console.warn('⚠️  Cloud sync is paused. Saves are local only; auto-retrying.');
    }
    return;
  }
  pendingData = data;
  schedulePush();
}

// Push any debounced state before the process exits (Railway sends SIGTERM on
// every deploy/restart).
async function flushOnExit() {
  if (pushTimer) { clearTimeout(pushTimer); pushTimer = null; }
  if (pendingData && !syncPaused) {
    try { await pushNow(pendingData); } catch {}
    pendingData = null;
  }
}
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.once(sig, () => { flushOnExit().finally(() => process.exit(0)); });
}

module.exports = { pullLatestIntoLocalFile, pushToSupabaseInBackground, getClient, getStorageClient };
