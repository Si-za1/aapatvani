# Deploying to Cloud Run

Everything the app needs is set at runtime, so one image runs against the local file store or
against Firestore without being rebuilt. This document is the order of operations; the reasons are
in `project.md` §13.

**Nothing here has been executed yet.** The commands are written from the documented behaviour of
each service, and the sections marked *verify* are the parts that must be checked against the real
project, they are assumptions until then.

---

## 0. Before you start

```bash
brew install --cask gcloud-cli     # not installed on the development machine
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
gcloud services enable run.googleapis.com firestore.googleapis.com storage.googleapis.com \
  aiplatform.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
```

---

## 1. Confirm model access first

Do this before anything else. It is the cheapest step and the one most likely to surprise us, a
model ID that does not exist in this project's region, or a structured-output rejection, is far
better found now than on demo day.

```bash
# Either an AI Studio key (simplest):
echo 'GEMINI_API_KEY=...' > .env.local

# Or Agent Platform with a service account, which is what Cloud Run will use:
export GOOGLE_GENAI_USE_ENTERPRISE=true
export GOOGLE_CLOUD_PROJECT=YOUR_PROJECT_ID
export GOOGLE_CLOUD_LOCATION=global

npm run check:models
npm run eval -- --mode gemini     # produces the real extraction numbers
```

`npm run eval -- --mode gemini` writes a new result into `data/eval/`. **Commit it**, the deployed
`/evaluation` page reads from that directory, and a Gemini-mode result is the one the judging
criteria are about.

*Verify:* that `gemini-3.8-flash` is served from `location: global` for this project, and that
`gemini-embedding-001` returns 768 dimensions. `project.md` §15 lists both as unconfirmed.

---

## 2. Firestore and Storage

```bash
gcloud firestore databases create --location=asia-south1 --type=firestore-native
gcloud storage buckets create gs://YOUR_PROJECT_ID-aapatvani-media --location=asia-south1 --uniform-bucket-level-access
```

Both are private. The app reaches them only through the Admin SDK on the server, and
`firestore.rules` / `storage.rules` deny all client access, so those rules can be deployed as they
stand:

```bash
firebase deploy --only firestore:rules,storage:rules
```

---

## 3. Build and deploy

Cloud Build builds the image, so Docker is not needed locally.

```bash
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/aapatvani/app

gcloud run deploy aapatvani \
  --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/aapatvani/app \
  --region asia-south1 \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --set-env-vars DATA_BACKEND=firestore,MEDIA_BACKEND=gcs,STORAGE_BUCKET=YOUR_PROJECT_ID-aapatvani-media,AUTH_MODE=passcode,DEFAULT_REGION=np,DEFAULT_DATA_LABEL=synthetic
```

`--allow-unauthenticated` is required: the report form is public by design, and reviewers sign in
inside the app rather than at the Cloud Run edge.

Environment variables:

| Variable | Value | Why |
|---|---|---|
| `DATA_BACKEND` | `firestore` | otherwise records live on a filesystem that is wiped on restart |
| `MEDIA_BACKEND` | `gcs` | private bucket for photos and voice notes |
| `STORAGE_BUCKET` | the bucket from step 2 | |
| `AUTH_MODE` | `passcode` or `firebase` | `firebase` needs the four `FIREBASE_WEB_*` values too |
| `DEFAULT_REGION` | `np` | |
| `DEFAULT_DATA_LABEL` | `synthetic` | the demo runs on synthetic reports; the label shows in the UI |
| `GOOGLE_GENAI_USE_ENTERPRISE` | `true` | lets Gemini run as the service account, so there is no API key to leak |
| `GOOGLE_CLOUD_PROJECT` | your project | |

Secrets go in Secret Manager, never in `--set-env-vars`:

```bash
printf '%s' 'a-long-random-string' | gcloud secrets create aapatvani-session-secret --data-file=-
printf '%s' 'the-reviewer-passcode' | gcloud secrets create aapatvani-reviewer-passcode --data-file=-

gcloud run services update aapatvani --region asia-south1 \
  --set-secrets SESSION_SECRET=aapatvani-session-secret:latest,REVIEWER_PASSCODE=aapatvani-reviewer-passcode:latest
```

The container runs as an unprivileged user and the service account needs `roles/datastore.user` and
`roles/storage.objectAdmin` on the bucket, nothing wider.

---

## 4. Verify

The gate for this chunk is *the deployed URL works in a private window and on a phone*. That means:

```bash
URL=$(gcloud run services describe aapatvani --region asia-south1 --format='value(status.url)')

# The public form loads and the API refuses anonymous access.
curl -s -o /dev/null -w '%{http_code}\n' "$URL/report"     # 200
curl -s -o /dev/null -w '%{http_code}\n' "$URL/api/incidents"  # 401

# The dataset made it into the image, the failure this would otherwise hide.
# Sign in, submit a report from the phone, then:
#   /dashboard   → the map draws tiles and the incident appears
#   /evaluation  → measured numbers, not an empty page
```

Then, by hand:

1. Open the URL in a **private window**, nothing cached, no session.
2. Submit a report **from a phone**: photo from the camera, a voice note, location from GPS.
3. Sign in as a reviewer and confirm the report appears with its claims.
4. Run the impact analysis on the incident and see the blast radius on the map.

---

## 5. The judging window (Oct 19 – Nov 6)

Cold starts are the one thing that will make the app feel broken to a judge opening it once.

```bash
gcloud run services update aapatvani --region asia-south1 --min-instances=1
```

**Set a budget alert before doing this**, `min-instances=1` bills for an idle instance around the
clock. In the Google Cloud console: Billing → Budgets & alerts → create a budget on this project with
an alert at a low threshold. Turn `min-instances` back to 0 after Nov 6.

---

## 6. Re-deploying

```bash
gcloud builds submit --tag asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/aapatvani/app
gcloud run deploy aapatvani --image asia-south1-docker.pkg.dev/YOUR_PROJECT_ID/aapatvani/app --region asia-south1
```

Environment variables and secrets set on the service persist across deploys. The image is
self-contained, so a deploy is one build plus one service update.

---

## Troubleshooting

**The map is empty or 500s on the dashboard.** The road dataset did not make it into the image. The
`RUN test -f data/regions/...` line in the Dockerfile exists to fail the build instead of failing at
runtime; if it passed and the map is still empty, check that `data/regions` is not listed in
`.dockerignore`.

**`/evaluation` shows "No results yet".** No eval result was committed, or `data/eval` was excluded
from the image.

**Reports vanish after a while.** `DATA_BACKEND` is not `firestore`. The container's filesystem is
per-instance and is wiped when the instance is recycled.

**Reviewer sign-in says the passcode is wrong.** `SESSION_SECRET` and `REVIEWER_PASSCODE` are read at
request time; if only one secret is set, sign-in fails with a 500 rather than a wrong-passcode error.
