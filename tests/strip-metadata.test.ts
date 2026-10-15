import { describe, expect, it } from "vitest";
import { stripMetadataForModel } from "@/lib/evidence/strip-metadata";

// The bytes here are built by hand rather than loaded from a fixture file, so the test states
// exactly which segment it expects to disappear and cannot drift when a sample image is replaced.

/** A JPEG segment: marker, 16-bit length (which counts itself), payload. */
function segment(marker: number, payload: Buffer): Buffer {
  const length = Buffer.alloc(2);
  length.writeUInt16BE(payload.length + 2);
  return Buffer.concat([Buffer.from([0xff, marker]), length, payload]);
}

const JPEG_SCAN_DATA = Buffer.from([0x11, 0x22, 0x33, 0x44, 0xff, 0x00, 0x55]);

/** SOI · APP1(Exif, with a fake GPS payload) · APP0(JFIF) · SOS · scan data · EOI */
function jpegWithExif(): Buffer {
  const exif = segment(0xe1, Buffer.concat([Buffer.from("Exif\0\0", "latin1"), Buffer.from([0x00, 0x00, 0x00, 0x08, 0xde, 0xad, 0xbe, 0xef])]));
  const jfif = segment(0xe0, Buffer.from("JFIF\0\u0001\u0002", "latin1"));
  const sos = segment(0xda, Buffer.from([0x01, 0x02, 0x03]));
  return Buffer.concat([Buffer.from([0xff, 0xd8]), exif, jfif, sos, JPEG_SCAN_DATA, Buffer.from([0xff, 0xd9])]);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  return Buffer.concat([length, Buffer.from(type, "latin1"), data, Buffer.alloc(4)]); // CRC not verified here
}

function pngWithExif(): Buffer {
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk("IHDR", Buffer.alloc(13, 7)),
    chunk("eXIf", Buffer.from([0xde, 0xad, 0xbe, 0xef])),
    chunk("tEXt", Buffer.from("Comment\0taken at home", "latin1")),
    chunk("IDAT", Buffer.from([0x01, 0x02, 0x03, 0x04])),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

describe("stripMetadataForModel", () => {
  it("removes the EXIF segment from a JPEG and keeps the image intact", () => {
    const original = jpegWithExif();
    expect(original.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(true);

    const stripped = stripMetadataForModel(original, "image/jpeg");

    expect(stripped.includes(Buffer.from("Exif\0\0", "latin1"))).toBe(false);
    // The image itself must survive byte for byte: SOI, the JFIF segment, SOS and the scan.
    expect(stripped.subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]));
    expect(stripped.includes(Buffer.from("JFIF\0", "latin1"))).toBe(true);
    expect(stripped.includes(JPEG_SCAN_DATA)).toBe(true);
    expect(stripped.subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
    expect(stripped.length).toBeLessThan(original.length);
  });

  it("removes eXIf and text chunks from a PNG and keeps the image chunks", () => {
    const original = pngWithExif();
    const stripped = stripMetadataForModel(original, "image/png");

    expect(stripped.includes(Buffer.from("eXIf", "latin1"))).toBe(false);
    expect(stripped.includes(Buffer.from("taken at home", "latin1"))).toBe(false);
    expect(stripped.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(stripped.includes(Buffer.from("IHDR", "latin1"))).toBe(true);
    expect(stripped.includes(Buffer.from("IDAT", "latin1"))).toBe(true);
    expect(stripped.includes(Buffer.from("IEND", "latin1"))).toBe(true);
  });

  it("leaves formats it cannot parse exactly as they were", () => {
    // A wrong guess here would corrupt the image the model is supposed to read, so anything
    // unrecognised passes through untouched rather than being half-parsed.
    const heic = Buffer.from([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63]);
    expect(stripMetadataForModel(heic, "image/heic")).toEqual(heic);

    const truncated = Buffer.from([0xff, 0xd8]);
    expect(stripMetadataForModel(truncated, "image/jpeg")).toEqual(truncated);

    const notAnImage = Buffer.from("this is not an image at all", "utf8");
    expect(stripMetadataForModel(notAnImage, "image/jpeg")).toEqual(notAnImage);
  });
});
