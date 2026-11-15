// Shrinks an uploaded image before it is stored/served. Phone photos are
// routinely 3-8 MB; every visitor downloading those is what burned through
// the bandwidth quota. Resizing to max 1600px and re-encoding as JPEG
// (~150-400 KB) cuts that by ~95% with no visible loss on a phone screen.
//
// Never throws: if sharp is missing or can't decode the file (e.g. HEIC on
// a sharp build without HEIF support), the original file is kept as-is so an
// upload never fails just because compression did.
const fs = require('fs');
const path = require('path');

let sharp = null;
try { sharp = require('sharp'); } catch { sharp = null; }

async function optimizeImage(filePath, mimetype, opts = {}) {
  const maxDim = opts.maxDim || 1600;
  const quality = opts.quality || 80;
  const unchanged = { path: filePath, filename: path.basename(filePath), mimetype };
  if (!sharp) return unchanged;

  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}.jpg`);
  const tmpPath = path.join(dir, `${base}.opt.tmp`);

  try {
    await sharp(filePath, { failOn: 'none' })
      .rotate() // honor EXIF orientation, since metadata is dropped below
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' }) // PNG transparency -> white, JPEG has no alpha
      .jpeg({ quality, mozjpeg: true })
      .toFile(tmpPath);

    const before = fs.statSync(filePath).size;
    const after = fs.statSync(tmpPath).size;
    // Already small/efficient (e.g. a tiny PNG screenshot): keep whichever is smaller.
    if (after >= before && path.extname(filePath).toLowerCase() === '.jpg') {
      fs.unlinkSync(tmpPath);
      return unchanged;
    }
    if (outPath !== filePath) fs.unlinkSync(filePath);
    fs.renameSync(tmpPath, outPath);
    return { path: outPath, filename: path.basename(outPath), mimetype: 'image/jpeg' };
  } catch (err) {
    console.warn('⚠️  Image optimization skipped:', err.message);
    try { fs.unlinkSync(tmpPath); } catch {}
    return unchanged;
  }
}

module.exports = { optimizeImage };
