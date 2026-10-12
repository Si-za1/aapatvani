# AapatVani AI · आपतवाणी

Community disaster reports — in Nepali, English, or a voice note — turned into structured, traceable
incident records, with a road-access analysis of what a blockage would mean for the communities
around it. Every claim shows where it came from, and a person confirms every fact.

Built for the **Google Cloud AI Builder Cup 2026** (theme: Sustainability & Social Impact, category:
Social Good).

---

## The problem

During the monsoon, landslides cut road access to health services across Nepal's hill districts.
Information arrives as fragments: a Nepali text message, a photo, a forwarded message, a voice note
from someone who saw it from a bus window. Someone has to work out which fragments describe the same
event, which contradict each other, which are copies of one original, and what it all means for the
villages on that road.

AapatVani takes that work seriously as *infrastructure* rather than as a chat interface. The chain is
**community evidence → incident intelligence → potential impact**, and every link carries its
provenance.

## What it does not do

Stated plainly, because the trustworthiness of the rest depends on it:

- It does **not** predict casualties, damage, or where a hazard will spread.
- It does **not** publish or send alerts. It drafts them for a person to approve; nothing leaves the
  system on its own.
- It does **not** treat a similarity score or a model's opinion as a decision. Only a named reviewer
  merges reports, confirms claims, or approves a draft.
- Being outside the analysis area never means "safe", and the interface says so wherever it applies.

---

## Quick start

```bash
npm install
npm run seed        # the demo scenario: 6 synthetic reports over real road geography
npm run dev         # http://localhost:3000
```

Open http://localhost:3000 for the public report form. Reviewers sign in at `/login` with the
passcode `demo-reviewer` (local development only).

No credentials are needed for any of this. Without a Gemini key the app stores reports and marks
them "awaiting a person"; the review, grouping, contradiction and road-impact features all work,
because they are deterministic code rather than model calls.

```bash
npm test            # unit tests
npm run typecheck   # types (regenerates route types first)
npm run lint
npm run build
npm run eval        # measured results on the labelled scenarios
npm run seed:reset  # clear the local store
```

---

## Architecture

One deployable: a modular Next.js 16 app on Cloud Run. No microservices, no multi-agent system.

```
 Community reporter (phone browser)          Reviewer (signed in)
              │                                       │
              ▼                                       ▼
┌─ Next.js app on Cloud Run ─────────────────────────────────────────────
│  Public:  / · /report · /report/[id]
│  Reviewer: /dashboard · /reports · /incidents · /activity · /evaluation
│
│  lib/ai         Gemini calls, prompts, response schemas
│  lib/evidence   alias mapping, citation and excerpt verification
│  lib/matching   candidate scoring, copy detection, contradictions
│  lib/incidents  grouping lifecycle
│  lib/review     every human decision, and its audit event
│  lib/impact     road-access analysis
│  lib/alerts     cited draft construction and approval
│  lib/geo        gazetteer, road graph, shortest paths, blast radius
│  lib/db         Firestore or local file store
│  lib/storage    Cloud Storage or local media store
│  lib/auth       Firebase Auth or passcode sessions
└──────┬────────────────────┬──────────────────────┬─────────────────────
       ▼                    ▼                      ▼
  Gemini 3.8 Flash      Firestore            Cloud Storage
  gemini-embedding-001  reports, claims,     private photos and
  (Agent Platform)      incidents, reviews   audio (server-streamed)
```

**Swappable backends.** `DATA_BACKEND=local|firestore`, `MEDIA_BACKEND`, `AUTH_MODE=passcode|firebase`.
The whole app runs on a laptop with no cloud credentials and switches to Google Cloud with
environment variables only.

**Server-only data access.** Route handlers reach Firestore and Storage through the Admin SDK.
`firestore.rules` and `storage.rules` deny all client access, so access control lives in one place.
Report photos are streamed through `/api/media/[reportId]/[mediaId]`, which checks the session first.

**Save first, analyse second.** A report is stored and given a reference code before any model call,
so a Gemini failure never loses a submission.

---

## What Gemini does, and what code does

This split is the design, not an implementation detail.

| Stage | Gemini | Deterministic code | People |
|---|---|---|---|
| Intake | — | Store the original, hash media, read EXIF | Reporter submits |
| Extraction | Reads text, photos and voice; proposes claims with cited excerpts | Schema validation, alias→ID mapping, excerpt verification, gazetteer lookup | Confirm / correct / reject |
| Matching | Embeddings; "same incident?" judgement citing claims | Distance, time gap, hazard compatibility, copy detection, score breakdown | Merge / separate |
| Contradictions | Semantic conflicts ("road open" vs "road blocked") | Field conflicts (place, time, hazard, counts, photo metadata) | Resolve |
| Impact | Restates the computed result in plain language | Snapping, blocked segment, shortest paths, before/after access | Confirm / dismiss each finding |
| Alerts | Drafts text from confirmed facts only, citing each sentence | Rejects uncited sentences, unknown citations, unsupported numbers | Approve |

Three rules are enforced in code rather than trusted to the model:

1. **Gemini never sees or returns real record IDs.** It cites short aliases (`R1`, `M1`, `C1`) that the
   server maps back, and the server rejects anything it does not recognise.
2. **Every quoted excerpt must appear in the original text.** If it does not, the claim is downgraded
   to "AI interpretation" and flagged.
3. **Coordinates never come from Gemini.** They come only from GPS, a map pin, or a gazetteer match.
   A report with no usable location is deliberately never compared with others, rather than guessed at.

---

## Evaluation

```bash
npm run eval                      # every mode that can run here
npm run eval -- --mode oracle     # no model needed
npm run eval -- --mode gemini     # needs credentials
```

Five labelled scenarios over the real corridor, each carrying an answer key: what should be grouped,
what must not be, which pairs are copies, which contradictions should be flagged, and what the road
analysis should find.

**Oracle mode** feeds the answer key in as if extraction had produced it, so the deterministic half of
the pipeline is measured exactly with no model involved. **Gemini mode** runs real extraction and is
the only mode that can say anything about reading reports.

Results are saved with the mode, model and date, and shown at `/evaluation`.

> **A small, hand-written set of scenarios over real road geography.** It shows the pipeline behaves
> as designed on cases we chose; it is not a measure of real-world effectiveness, and no such claim
> should be read from it.

The road-impact engine additionally has exact expectations on a hand-built toy graph, checked in
`tests/blast-radius.test.ts` — that is where the routing arithmetic is pinned down.

---

## Data sources and licences

| Source | Use | Licence |
|---|---|---|
| **OpenStreetMap** via the Overpass API | The road network, health facilities, schools and settlements for the Araniko corridor | ODbL 1.0 — see `data/regions/nepal/araniko-corridor/SOURCE.md`. Attribution is shown on every map. |
| OpenStreetMap standard tiles | Basemap in the interface | © OpenStreetMap contributors. Light demo use; `MAP_TILE_URL` switches provider. |

The demo area covers Dolalghat–Chautara–Bahrabise–Tatopani–Kodari inside Nepal's border: 11,340 nodes,
11,613 edges, 2,525 km of road, 36 health facilities (4 hospitals), 408 schools and 187 settlements,
prepared offline by `scripts/prepare-region.ts` and shipped with the app.

**The reports are synthetic.** They are written by us and labelled `synthetic` everywhere they appear.
No real report, and no real person's data, is in this repository.

---

## Limitations

- **A small, hand-written evaluation set.** See above; it is evidence of designed behaviour, not of
  field effectiveness.
- **The road data is an extract, not the country.** The analysis area is the Araniko corridor. Outside
  it, the app declines to analyse and says so rather than implying safety.
- **OSM coverage in rural Nepal is uneven.** Roads a settlement depends on may be missing or
  approximate; the analysis reports weak map links as caveats and lists already-disconnected places as
  data gaps rather than as impact.
- **One blocked segment at a time.** The analysis assumes a single segment is blocked; it does not
  model multiple simultaneous blockages.
- **Copies are judged on wording and media.** A paraphrase of someone else's report is not a copy by
  this definition.
- **The demo area has a Philippines configuration** marked "no geographic dataset loaded — not
  validated": the region switch works, the geography does not.

---

## Deploying

See [`docs/deploy.md`](docs/deploy.md).

---

## Repository layout

```
project.md                    the living tracker: status, decisions, progress
docs/product-vision.md        the original brief
docs/deploy.md                Cloud Run deployment
src/app/                      pages and API route handlers
src/components/               UI, grouped by area (av, report, review, impact, alerts, dashboard)
src/config/                   regions, model IDs in one place
src/lib/                      domain schemas, ai, evidence, matching, incidents, review,
                              impact, alerts, geo, db, storage, auth, eval
data/regions/                 versioned OSM extract shipped with the app
data/eval/                    saved evaluation results
scripts/                      prepare-region, check-models, seed-demo, eval
tests/                        Vitest unit and end-to-end tests
```
