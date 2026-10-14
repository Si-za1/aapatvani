// Removes location and camera metadata from an image *on its way to the model*, and only there.
//
// A phone photograph carries an EXIF block that usually includes GPS — often the reporter's home.
// The app is careful that coordinates never come *from* the model (§3 rule 3) and equally careful
// that it never stores a reporter's name, but until now it handed the raw bytes *to* the model,
// EXIF and all. The reporter consented to a machine reading their picture of a blocked road; they
// did not consent to their coordinates going to a third party as a side effect.
//
// This is deliberately lossless. Re-encoding the image would strip metadata too, but it would also
// change the pixels, and a photograph here is evidence — the app already discloses the one
// transform it performs on the device (see `photo-field.tsx`) and should not add a silent second.
// The stored original is untouched, so `readExif` has already captured what the contradiction
// rules need, and the file a reviewer is shown is byte-for-byte what arrived.

/** APP1 segments carrying EXIF or XMP, the two that can hold a position. */
const JPEG_DROP_HEADERS = ["Exif\0\0", "http://ns.adobe.com/xap/1.0/\0"];

function stripJpeg(buf: Buffer): Buffer {
  // SOI is 0xFFD8; anything else is not a JPEG we understand, so leave it alone.
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const out: Buffer[] = [buf.subarray(0, 2)];
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1];
    // Start-of-scan or end-of-image: the rest is entropy-coded image data, copy it as-is.
    if (marker === 0xda || marker === 0xd9) break;
    const length = buf.readUInt16BE(i + 2);
    const end = i + 2 + length;
    if (length < 2 || end > buf.length) break;
    if (marker === 0xe1) {
      const header = buf.toString("latin1", i + 4, Math.min(end, i + 4 + 32));
      if (JPEG_DROP_HEADERS.some((h) => header.startsWith(h))) {
        i = end;
        continue;
      }
    }
    out.push(buf.subarray(i, end));
    i = end;
  }
  if (i < buf.length) out.push(buf.subarray(i));
  return Buffer.concat(out);
}

/** Ancillary chunks that can carry a position, a device or a timestamp. */
const PNG_DROP_CHUNKS = new Set(["eXIf", "tEXt", "iTXt", "zTXt", "tIME"]);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function stripPng(buf: Buffer): Buffer {
  if (buf.length < 8 || !buf.subarray(0, 8).equals(PNG_SIGNATURE)) return buf;
  const out: Buffer[] = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 8 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const type = buf.toString("latin1", i + 4, i + 8);
    const end = i + 12 + length;
    if (end > buf.length) break;
    // IHDR, PLTE, IDAT and IEND are the image itself and always survive.
    if (!PNG_DROP_CHUNKS.has(type)) out.push(buf.subarray(i, end));
    i = end;
  }
  if (i < buf.length) out.push(buf.subarray(i));
  return Buffer.concat(out);
}

/**
 * Returns the bytes to send to the model, with position-bearing metadata removed.
 * Formats we do not parse (HEIC, WebP) pass through unchanged rather than being mangled —
 * they are already refused or passed through upstream, and a wrong guess here would corrupt
 * the image the model is supposed to read.
 */
export function stripMetadataForModel(data: Buffer, mimeType: string): Buffer {
  if (mimeType === "image/jpeg") return stripJpeg(data);
  if (mimeType === "image/png") return stripPng(data);
  return data;
}
