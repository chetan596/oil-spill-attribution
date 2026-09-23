/**
 * Manual Analysis File Upload & Security Validation Middleware
 *
 * Enforces:
 *   - Maximum upload file size (50 MB)
 *   - Extension whitelist (.tif, .tiff, .png, .jpg, .jpeg)
 *   - MIME type whitelist
 *   - Magic-byte file header validation (prevents extension spoofing)
 *   - Safe server-side generated UUID filenames (no path traversal)
 *   - SHA-256 checksum computation
 */

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const AppError = require("../errors/AppError");

// Allowed file extensions
const ALLOWED_EXTENSIONS = new Set([".tif", ".tiff", ".png", ".jpg", ".jpeg"]);

// Allowed MIME types
const ALLOWED_MIME_TYPES = new Set([
  "image/tiff",
  "image/geotiff",
  "image/png",
  "image/jpeg",
  "image/pjpeg",
  "application/octet-stream", // Frequently sent by browsers for raw .tif
]);

// Base storage directory for manual uploads (resolved to project data/uploads/manual)
const UPLOADS_BASE_DIR = path.resolve(__dirname, "../../../../data/uploads/manual");

// Ensure base directory exists
if (!fs.existsSync(UPLOADS_BASE_DIR)) {
  fs.mkdirSync(UPLOADS_BASE_DIR, { recursive: true });
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Unique subfolder per upload transaction
    const uploadId = crypto.randomUUID();
    req.uploadId = uploadId;
    const destDir = path.join(UPLOADS_BASE_DIR, uploadId);
    fs.mkdirSync(destDir, { recursive: true });
    cb(null, destDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `source_image${ext}`;
    cb(null, safeName);
  },
});

// Multer File Filter
const fileFilter = (req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(
      new AppError(
        400,
        "INVALID_FILE_EXTENSION",
        `Unsupported file extension '${ext}'. Allowed: .tif, .tiff, .png, .jpg, .jpeg`
      ),
      false
    );
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype.toLowerCase())) {
    return cb(
      new AppError(
        400,
        "INVALID_MIME_TYPE",
        `Unsupported MIME type '${file.mimetype}'. Allowed: TIFF, PNG, JPEG`
      ),
      false
    );
  }

  cb(null, true);
};

// Multer Instance (50 MB limit, 1 file)
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50 MB
    files: 1,
  },
});

/**
 * Validate Magic Bytes of the uploaded file on disk.
 * Detects corrupted files or renamed malicious binaries.
 */
function validateMagicBytes(filePath) {
  const buffer = Buffer.alloc(16);
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, 16, 0);
  } finally {
    fs.closeSync(fd);
  }

  // PNG Magic bytes: 89 50 4E 47 0D 0A 1A 0A
  const isPng = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;

  // JPEG Magic bytes: FF D8 FF
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;

  // TIFF Little-Endian (II*\0): 49 49 2A 00
  const isTiffLE = buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00;

  // TIFF Big-Endian (MM\0*): 4D 4D 00 2A
  const isTiffBE = buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a;

  if (isPng) return { valid: true, format: "PNG", mime: "image/png" };
  if (isJpeg) return { valid: true, format: "JPEG", mime: "image/jpeg" };
  if (isTiffLE || isTiffBE) return { valid: true, format: "TIFF", mime: "image/tiff" };

  return {
    valid: false,
    format: "UNKNOWN",
    error: "File header does not match a recognized TIFF, PNG, or JPEG raster format.",
  };
}

/**
 * Calculate SHA-256 hash of a file on disk.
 */
function calculateSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Parse structured image metadata directly from file buffer.
 * Supports PNG, JPEG, and TIFF (both Little-Endian and Big-Endian IFD parsing).
 * Strictly reports "NOT_AVAILABLE" when metadata tags are missing or cannot be safely parsed.
 */
function extractImageMetadata(filePath) {
  const stats = fs.statSync(filePath);
  const sizeBytes = stats.size;
  const magic = validateMagicBytes(filePath);

  if (!magic.valid) {
    return {
      valid: false,
      format: "UNKNOWN",
      mimeType: "application/octet-stream",
      sizeBytes,
      width: "NOT_AVAILABLE",
      height: "NOT_AVAILABLE",
      isTiff: false,
      bands: "NOT_AVAILABLE",
      crs: "NOT_AVAILABLE",
      geospatialMetadataAvailable: false,
      error: magic.error,
    };
  }

  let width = "NOT_AVAILABLE";
  let height = "NOT_AVAILABLE";
  let isTiff = magic.format === "TIFF";
  let bands = isTiff ? 1 : "NOT_AVAILABLE";
  let crs = "NOT_AVAILABLE";
  let geospatialMetadataAvailable = false;
  let dateTimeTag = null;

  const buffer = Buffer.alloc(Math.min(sizeBytes, 256 * 1024)); // Read up to first 256KB for header
  const fd = fs.openSync(filePath, "r");
  try {
    fs.readSync(fd, buffer, 0, buffer.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  try {
    if (magic.format === "PNG") {
      if (buffer.length >= 24) {
        width = buffer.readUInt32BE(16);
        height = buffer.readUInt32BE(20);
        const colorType = buffer[25];
        bands = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 4 ? 2 : 1;
      }
    } else if (magic.format === "JPEG") {
      let offset = 2;
      while (offset < buffer.length - 8) {
        if (buffer[offset] === 0xff) {
          const marker = buffer[offset + 1];
          // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2), SOF3 (0xC3), SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
          if (
            (marker >= 0xc0 && marker <= 0xc3) ||
            (marker >= 0xc5 && marker <= 0xc7) ||
            (marker >= 0xc9 && marker <= 0xcb) ||
            (marker >= 0xcd && marker <= 0xcf)
          ) {
            height = buffer.readUInt16BE(offset + 5);
            width = buffer.readUInt16BE(offset + 7);
            bands = buffer[offset + 9] || 3;
            break;
          }
          if (marker === 0xd9 || marker === 0xda) {
            // SOS or EOI reached without SOF
            break;
          }
          const segmentLength = buffer.readUInt16BE(offset + 2);
          offset += 2 + segmentLength;
        } else {
          offset++;
        }
      }
    } else if (magic.format === "TIFF") {
      const isLE = buffer[0] === 0x49; // Little-Endian II vs Big-Endian MM
      const readU16 = (off) => (isLE ? buffer.readUInt16LE(off) : buffer.readUInt16BE(off));
      const readU32 = (off) => (isLE ? buffer.readUInt32LE(off) : buffer.readUInt32BE(off));

      const firstIfdOffset = readU32(4);
      if (firstIfdOffset > 0 && firstIfdOffset + 2 < buffer.length) {
        const numEntries = readU16(firstIfdOffset);
        let entryOffset = firstIfdOffset + 2;

        let hasGeoKeys = false;
        let hasModelTiepoints = false;
        let hasModelPixelScale = false;

        for (let i = 0; i < numEntries && entryOffset + 12 <= buffer.length; i++, entryOffset += 12) {
          const tag = readU16(entryOffset);
          const type = readU16(entryOffset + 2);
          const count = readU32(entryOffset + 4);
          
          const readVal = () => {
            if (type === 3) return readU16(entryOffset + 8); // SHORT
            if (type === 4) return readU32(entryOffset + 8); // LONG
            return readU32(entryOffset + 8);
          };

          if (tag === 256) {
            // ImageWidth
            width = readVal();
          } else if (tag === 257) {
            // ImageLength / Height
            height = readVal();
          } else if (tag === 277) {
            // SamplesPerPixel (Bands)
            bands = readVal();
          } else if (tag === 306) {
            // TIFFTAG_DATETIME (ASCII: "YYYY:MM:DD HH:MM:SS\0")
            const valOffset = readU32(entryOffset + 8);
            if (valOffset > 0 && valOffset + count <= buffer.length) {
              const dtAscii = buffer.toString("ascii", valOffset, valOffset + count).replace(/\0/g, "").trim();
              if (dtAscii.length > 0) {
                dateTimeTag = dtAscii;
              }
            }
          } else if (tag === 33550) {
            // ModelPixelScaleTag
            hasModelPixelScale = true;
          } else if (tag === 33922) {
            // ModelTiepointTag
            hasModelTiepoints = true;
          } else if (tag === 34735) {
            // GeoKeyDirectoryTag
            hasGeoKeys = true;
          } else if (tag === 34737) {
            // GeoAsciiParamsTag
            const valOffset = readU32(entryOffset + 8);
            if (valOffset > 0 && valOffset + count <= buffer.length) {
              const ascii = buffer.toString("ascii", valOffset, valOffset + count).replace(/\0/g, " ").trim();
              if (ascii.length > 0) {
                crs = ascii;
              }
            }
          }
        }

        if (hasGeoKeys || hasModelTiepoints || hasModelPixelScale) {
          geospatialMetadataAvailable = true;
          if (crs === "NOT_AVAILABLE") {
            crs = "GeoTIFF Metadata Present";
          }
        }
      }
    }
  } catch (err) {
    // Graceful fallback on binary parsing failure without crashing
  }

  const inputFormat = isTiff
    ? (geospatialMetadataAvailable ? "GEOTIFF_RASTER" : "TIFF_RASTER")
    : (magic.format === "PNG" || magic.format === "JPEG" ? "RGB_RASTER" : "UNSUPPORTED");
  const channelCount = typeof bands === "number" ? bands : (magic.format === "PNG" || magic.format === "JPEG" ? 3 : 1);
  const bandStructure = channelCount === 1
    ? "GRAYSCALE_OR_MASK"
    : channelCount === 2
    ? "TWO_CHANNEL_UNCLASSIFIED"
    : channelCount === 3
    ? "RGB"
    : channelCount === 6
    ? "SENTINEL2_B4_B3_B2_B8_B11_B12"
    : "OTHER";


  return {
    valid: true,
    format: magic.format,
    inputFormat,
    channelCount,
    bandStructure,
    mimeType: magic.mime,
    sizeBytes,
    width,
    height,
    isTiff,
    bands: bands !== undefined && bands !== null ? bands : "NOT_AVAILABLE",
    crs: crs || "NOT_AVAILABLE",
    geospatialMetadataAvailable,
    geolocationStatus: geospatialMetadataAvailable ? "ESTABLISHED" : "NOT_ESTABLISHED",
    dateTimeTag,
  };
}

module.exports = {
  upload,
  validateMagicBytes,
  calculateSha256,
  extractImageMetadata,
  UPLOADS_BASE_DIR,
};
