import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { getStorage } from "firebase-admin/storage";
import { getEnv } from "@/lib/env";
import { getAdminApp } from "@/lib/firebase-admin";

// Private media storage. Files are never public: reviewers fetch them through
// /api/media/[reportId]/[mediaId], which checks the session first.

export interface MediaStore {
  readonly backend: "local" | "gcs";
  put(objectPath: string, data: Buffer, contentType: string): Promise<void>;
  get(objectPath: string): Promise<Buffer | null>;
  remove(objectPath: string): Promise<void>;
}

function safeJoin(root: string, objectPath: string): string {
  const full = path.resolve(root, objectPath);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error("Invalid media path");
  return full;
}

class LocalMediaStore implements MediaStore {
  readonly backend = "local" as const;
  constructor(private readonly root: string) {}

  async put(objectPath: string, data: Buffer): Promise<void> {
    const file = safeJoin(this.root, objectPath);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async get(objectPath: string): Promise<Buffer | null> {
    try {
      return await readFile(safeJoin(this.root, objectPath));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw err;
    }
  }

  async remove(objectPath: string): Promise<void> {
    await rm(safeJoin(this.root, objectPath), { force: true });
  }
}

class GcsMediaStore implements MediaStore {
  readonly backend = "gcs" as const;
  constructor(private readonly bucketName: string) {}

  private bucket() {
    return getStorage(getAdminApp()).bucket(this.bucketName);
  }

  async put(objectPath: string, data: Buffer, contentType: string): Promise<void> {
    await this.bucket().file(objectPath).save(data, {
      contentType,
      resumable: false,
      metadata: { cacheControl: "private, max-age=0" },
    });
  }

  async get(objectPath: string): Promise<Buffer | null> {
    const file = this.bucket().file(objectPath);
    const [exists] = await file.exists();
    if (!exists) return null;
    const [data] = await file.download();
    return data;
  }

  async remove(objectPath: string): Promise<void> {
    await this.bucket().file(objectPath).delete({ ignoreNotFound: true });
  }
}

let store: MediaStore | undefined;

export function getMediaStore(): MediaStore {
  if (store) return store;
  const env = getEnv();
  if (env.mediaBackend === "gcs") {
    if (!env.storageBucket) throw new Error("STORAGE_BUCKET must be set when MEDIA_BACKEND=gcs");
    store = new GcsMediaStore(env.storageBucket);
  } else {
    store = new LocalMediaStore(path.join(env.localDataDir, "media"));
  }
  return store;
}
