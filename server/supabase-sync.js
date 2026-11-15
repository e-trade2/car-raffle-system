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
//   1. If the startup pull FAILS (Supabase down, quota-restricted, bad
//      key...), we do NOT know what's in the cloud copy, so all pushes are
//      paused for this process. Otherwise a freshly wiped container could
//      later overwrite the real cloud backup with an empty database.
//      Restart the service after Supabase is healthy to resume syncing.
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

function pauseSync(reason) {
  syncPaused = true;
  console.warn('⚠️  Supabase pull failed (' + reason + ').');
  console.warn('⚠️  Cloud sync is PAUSED for this run so an unknown/empty state cannot overwrite the cloud backup.');
  console.warn('⚠️  Local data/db.json keeps working. Restart the service once Supabase is healthy to resume syncing.');
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

async function pushNow(data) {
  const supabase = getClient();
  if (!supabase) return;
  const { error } = await supabase
    .from('app_state')
    .upsert({ id: ROW_ID, data, updated_at: data._savedAt || new Date().toISOString() });
  if (error) console.warn('⚠️  Supabase save failed (local data/db.json is still up to date):', error.message);
}

// Called once at startup, before db.load(). Never throws.
async function pullLatestIntoLocalFile() {
  const supabase = getClient();
  if (!supabase) return;

  try {
    const { data: row, error } = await supabase
      .from('app_state')
      .select('data, updated_at')
      .eq('id', ROW_ID)
      .maybeSingle();

    if (error) return pauseSync(error.message);

    const local = readLocal();
    const localIsReal = local && local.data._freshInstall !== true;

    if (!row || !row.data) {
      console.log('ℹ️  No saved state in Supabase yet.');
      if (localIsReal) {
        console.log('ℹ️  Uploading the existing local data/db.json as the first cloud backup.');
        await pushNow(local.data);
      }
      return;
    }

    const remoteAt = Date.parse(row.updated_at) || 0;
    if (localIsReal && local.savedAt > remoteAt) {
      console.log('✅ Local data/db.json is newer than the Supabase copy - keeping local and syncing it up.');
      await pushNow(local.data);
      return;
    }

    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(DATA_FILE)) {
      try { fs.copyFileSync(DATA_FILE, BACKUP_FILE); } catch {}
    }
    fs.writeFileSync(DATA_FILE, JSON.stringify(row.data, null, 2));
    console.log('✅ Restored data/db.json from Supabase.');
  } catch (err) {
    pauseSync(err.message);
  }
}

// Fire-and-forget, called from db.save() after the local write completed.
function pushToSupabaseInBackground(data) {
  const supabase = getClient();
  if (!supabase) return;

  if (syncPaused) {
    const now = Date.now();
    if (now - lastPausedWarnAt > 10 * 60 * 1000) {
      lastPausedWarnAt = now;
      console.warn('⚠️  Cloud sync is paused (startup pull failed). Saves are local only. Restart after Supabase is healthy.');
    }
    return;
  }

  supabase
    .from('app_state')
    .upsert({ id: ROW_ID, data, updated_at: data._savedAt || new Date().toISOString() })
    .then(({ error }) => {
      if (error) console.warn('⚠️  Supabase save failed (local data/db.json is still up to date):', error.message);
    })
    .catch(err => {
      console.warn('⚠️  Supabase save failed (local data/db.json is still up to date):', err.message);
    });
}

module.exports = { pullLatestIntoLocalFile, pushToSupabaseInBackground, getClient, getStorageClient };
