/**
 * Clears the store the current configuration points at.
 *
 *   npm run seed:reset                        # local: removes .data/db and .data/media
 *   npm run seed:reset -- --cloud             # Firestore + the configured Storage bucket
 *
 * The local reset is a directory removal; this does the same job for a deployed store, which had
 * no equivalent until the demo was seeded onto Cloud Run and the seeded timestamps turned out to be
 * three months old. Re-seeding over the top is not an option — the seed mints fresh ids, so the old
 * records would stay and the dashboard would show every incident twice.
 *
 * It refuses to run without `--cloud` when a remote backend is configured, because the failure mode
 * of getting this wrong is deleting the wrong database.
 */

import { getEnv } from "@/lib/env";

const COLLECTIONS = [
  "reports",
  "extractions",
  "claims",
  "incidents",
  "suggestions",
  "contradictions",
  "impactAssessments",
  "alertDrafts",
  "auditEvents",
];

async function main(): Promise<void> {
  const env = getEnv();
  const cloud = process.argv.includes("--cloud");

  if (env.dataBackend !== "firestore") {
    console.error(`DATA_BACKEND is "${env.dataBackend}", not firestore. Run \`npm run seed:reset\` for the local store.`);
    process.exit(1);
  }
  if (!cloud) {
    console.error(
      `Refusing to delete every document in project "${env.gcpProject}".\n` +
        `This is the deployed store. Re-run with --cloud if that is what you mean:\n` +
        `  npm run seed:reset -- --cloud`,
    );
    process.exit(1);
  }
  console.log(`Clearing Firestore in project "${env.gcpProject}"…`);

  const { getAdminApp } = await import("@/lib/firebase-admin");
  const { getFirestore } = await import("firebase-admin/firestore");
  const db = getFirestore(getAdminApp());

  let total = 0;
  for (const name of COLLECTIONS) {
    const before = await db.collection(name).count().get();
    const n = before.data().count;
    if (n > 0) {
      // The Admin SDK deletes a collection and everything under it, in batches.
      await db.recursiveDelete(db.collection(name));
      console.log(`  ${name}: ${n} document(s) deleted`);
    }
    total += n;
  }

  console.log(`\nDone. ${total} document(s) removed from ${COLLECTIONS.length} collections.`);
  console.log("Now run `npm run seed` to write the demo scenario back in.");
}

main().catch((error) => {
  console.error("Reset failed:", error);
  process.exit(1);
});
