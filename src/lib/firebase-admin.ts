import "server-only";
import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getEnv } from "@/lib/env";

// One Admin SDK app per process. On Cloud Run it authenticates as the service account
// (Application Default Credentials); locally, run `gcloud auth application-default login`.

let app: App | undefined;

export function getAdminApp(): App {
  if (app) return app;
  const existing = getApps()[0];
  if (existing) {
    app = existing;
    return app;
  }
  const env = getEnv();
  app = initializeApp({
    projectId: env.gcpProject,
    ...(env.storageBucket ? { storageBucket: env.storageBucket } : {}),
  });
  return app;
}
