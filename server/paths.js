// Single source of truth for where persistent files live (db.json, session
// secret, uploaded photos/receipts).
//
// Resolution order:
//   1. DATA_ROOT=/some/path  -> data in <root>/data, uploads in <root>/uploads
//   2. A Railway Volume (RAILWAY_VOLUME_MOUNT_PATH is set automatically):
//        a. mounted exactly on the project's own data/ folder (e.g. /app/data)
//           -> keep using data/ as-is and put uploads INSIDE it (data/uploads),
//              so photos/receipts live on the volume too
//        b. mounted anywhere else (e.g. /data)
//           -> data in <mount>/data, uploads in <mount>/uploads
//   3. No volume: the project folder, exactly like before (ephemeral on Railway).
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const PROJECT_DATA_DIR = path.join(PROJECT_ROOT, 'data');
const volume = process.env.RAILWAY_VOLUME_MOUNT_PATH
  ? path.resolve(process.env.RAILWAY_VOLUME_MOUNT_PATH)
  : null;

let DATA_DIR, UPLOADS_DIR, usingPersistentRoot;

if (process.env.DATA_ROOT) {
  const root = path.resolve(process.env.DATA_ROOT);
  DATA_DIR = path.join(root, 'data');
  UPLOADS_DIR = path.join(root, 'uploads');
  usingPersistentRoot = true;
} else if (volume && volume === PROJECT_DATA_DIR) {
  DATA_DIR = PROJECT_DATA_DIR;
  UPLOADS_DIR = path.join(PROJECT_DATA_DIR, 'uploads');
  usingPersistentRoot = true;
} else if (volume) {
  DATA_DIR = path.join(volume, 'data');
  UPLOADS_DIR = path.join(volume, 'uploads');
  usingPersistentRoot = true;
} else {
  DATA_DIR = PROJECT_DATA_DIR;
  UPLOADS_DIR = path.join(PROJECT_ROOT, 'uploads');
  usingPersistentRoot = false;
}

module.exports = { DATA_DIR, UPLOADS_DIR, usingPersistentRoot };
