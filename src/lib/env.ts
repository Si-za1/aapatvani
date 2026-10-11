import "server-only";
import path from "node:path";
import type { DataLabel } from "@/lib/domain/schemas";

// Server configuration, read from environment variables at call time (never baked in at build).

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
}

export function getEnv() {
  const e = process.env;
  const gcpProject = e.GOOGLE_CLOUD_PROJECT ?? e.GCLOUD_PROJECT ?? e.FIREBASE_PROJECT_ID;
  return {
    isProduction: e.NODE_ENV === "production",
    dataBackend: (e.DATA_BACKEND === "firestore" ? "firestore" : "local") as "firestore" | "local",
    localDataDir: e.LOCAL_DATA_DIR ?? path.join(process.cwd(), ".data"),
    firestoreDatabaseId: e.FIRESTORE_DATABASE_ID,
    mediaBackend: (e.MEDIA_BACKEND === "gcs" || (e.MEDIA_BACKEND === undefined && e.STORAGE_BUCKET) ? "gcs" : "local") as "gcs" | "local",
    storageBucket: e.STORAGE_BUCKET,
    gcpProject,
    authMode: (e.AUTH_MODE === "firebase" ? "firebase" : "passcode") as "firebase" | "passcode",
    sessionSecret: e.SESSION_SECRET,
    reviewerPasscode: e.REVIEWER_PASSCODE,
    reviewerEmails: list(e.REVIEWER_EMAILS),
    demoLoginHint: e.DEMO_LOGIN_HINT,
    firebaseWeb: {
      apiKey: e.FIREBASE_WEB_API_KEY,
      authDomain: e.FIREBASE_AUTH_DOMAIN ?? (gcpProject ? `${gcpProject}.firebaseapp.com` : undefined),
      projectId: e.FIREBASE_PROJECT_ID ?? gcpProject,
      appId: e.FIREBASE_APP_ID,
    },
    defaultRegionId: e.DEFAULT_REGION ?? "np",
    defaultDataLabel: (["synthetic", "historical", "operational"].includes(e.DEFAULT_DATA_LABEL ?? "")
      ? e.DEFAULT_DATA_LABEL
      : "synthetic") as DataLabel,
    map: {
      tileUrl: e.MAP_TILE_URL ?? "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
      attribution:
        e.MAP_TILE_ATTRIBUTION ??
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    },
    rateLimitPerTenMinutes: Number(e.REPORT_RATE_LIMIT ?? 20),
  };
}

export type AppEnv = ReturnType<typeof getEnv>;
