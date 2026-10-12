"use client";

// Photo attachment (feature M1). A phone photo is routinely 4–8 MB, which is most of the upload
// budget, so large images are shrunk on the device before they are sent. That is disclosed to the
// reporter (project.md §6: "with any resize disclosed"), because a photograph is evidence and the
// person should know it was altered.

import { useRef, useState } from "react";
import { Camera, LoaderCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { translator, type Locale } from "@/lib/i18n";

/** Must match MAX_PHOTO_BYTES in lib/reports/service.ts. */
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.82;

export interface PreparedPhoto {
  file: File;
  previewUrl: string;
  /** Set when the browser altered the image; shown to the reporter. */
  transform: string | null;
  originalBytes: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Shrinks a photo to fit the upload limit, or returns it untouched. Formats the browser cannot
 * decode (HEIC on some platforms) are passed through unmodified rather than being re-encoded into
 * something worse; the server rejects them if they are over the limit.
 */
async function prepare(file: File): Promise<{ file: File; resized: boolean }> {
  const decodable = /^image\/(jpeg|png|webp)$/.test(file.type);
  if (!decodable) return { file, resized: false };

  let image: HTMLImageElement;
  try {
    image = await loadImage(file);
  } catch {
    return { file, resized: false };
  }

  const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
  if (longestSide <= MAX_DIMENSION && file.size <= MAX_BYTES) return { file, resized: false };

  const scale = Math.min(1, MAX_DIMENSION / longestSide);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return { file, resized: false };
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  let quality = JPEG_QUALITY;
  let blob = await toBlob(canvas, quality);
  // One more pass at lower quality if the first attempt is still too big.
  while (blob && blob.size > MAX_BYTES && quality > 0.4) {
    quality -= 0.15;
    blob = await toBlob(canvas, quality);
  }
  if (!blob || blob.size >= file.size) return { file, resized: false };

  const name = file.name.replace(/\.[a-z0-9]+$/i, "") || "photo";
  return { file: new File([blob], `${name}.jpg`, { type: "image/jpeg" }), resized: true };
}

export function PhotoField({
  locale,
  photo,
  onPhoto,
  onRemove,
}: {
  locale: Locale;
  photo: PreparedPhoto | null;
  onPhoto: (photo: PreparedPhoto | null) => void;
  onRemove: () => void;
}) {
  const t = translator(locale);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function pick(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setBusy(true);
    try {
      const { file: prepared, resized } = await prepare(file);
      onPhoto({
        file: prepared,
        previewUrl: URL.createObjectURL(prepared),
        transform: resized ? t("form.photoResized") : null,
        originalBytes: file.size,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {photo ? (
        <div className="flex gap-3 rounded-2xl border border-border bg-card p-3">
          {/* A local blob URL, never sent anywhere. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={photo.previewUrl} alt="" className="size-20 shrink-0 rounded-xl object-cover" />
          <div className="flex min-w-0 flex-col gap-1">
            <p className="truncate text-sm font-medium">{photo.file.name}</p>
            <p className="text-xs text-muted-foreground">{(photo.file.size / 1024 / 1024).toFixed(1)} MB</p>
            {photo.transform ? <p className="text-xs text-amber-strong">{photo.transform}</p> : null}
            <Button type="button" variant="ghost" size="sm" onClick={onRemove} className="mt-auto h-7 w-fit rounded-full px-2">
              <X className="size-3.5" aria-hidden />
              {t("form.photoRemove")}
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="h-12 justify-start rounded-xl border-dashed text-base"
        >
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {t("form.photoAdd")}
        </Button>
      )}
      <p className="text-xs text-muted-foreground">{t("form.photoHint")}</p>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" onChange={pick} className="sr-only" tabIndex={-1} />
    </div>
  );
}
