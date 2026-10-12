# AapatVani AI — Project Tracker

This is the working document: what we're building, how, and where we are. Update **§0 Status** and **§14 Progress log** whenever something changes state, and record decisions in **§13**.

- **Product brief:** [`docs/product-vision.md`](docs/product-vision.md), the source of truth for product intent
- **Hackathon:** Google Cloud AI Builder Cup 2026. Prototype deadline **Oct 18, 2026**; we target **Oct 17**.
- **Last updated:** 2026-10-12

---

## 0. Status

We build in chunks and commit at the end of each one.

| Chunk | What | Status |
|---|---|---|
| 1 | Foundation: scaffold, design system, region data (OSM extract) | ✅ Done |
| 2 | Backend core: data model, data/media stores, reviewer auth, evidence checks, gazetteer, Blast Radius engine, unit tests | ✅ Done |
| 3 | AI layer: Gemini extraction (text, photo, voice), embeddings, report comparison, alert drafting, impact explanation, validation | ✅ Done (unit-tested; live Gemini check waits for credentials) |
| 4 | Matching & incidents: clustering, copy detection, contradiction rules, services, API routes | ✅ Done (local store, end-to-end through the API) |
| 5 | Public side: welcoming landing page, mobile report form (Nepali/English, photo, voice, location, time) | ✅ Done (public pages live; phone hardware checks still to do) |
| 6 | Responder side: dashboard + map, review queue, report and incident workspaces | ✅ Done (reviewer can triage the seeded scenario) |
| 7 | Impact & alerts UI: blast radius on the map, confirm/dismiss, cited alert drafts with approval | ✅ Done (deterministic path runs live; the model-written steps need credentials) |
| 8 | Evaluation & demo data: labelled synthetic scenarios, eval script, results page, seed | ✅ Done (measured in oracle mode; Gemini-mode numbers wait for credentials) |
| 9 | Finish: Dockerfile, Cloud Run deploy, README, final checks | ✅ Done except the deploy itself (needs credentials) |
| — | Vision deck (PDF) + 3-minute demo video | ⬜ |

**Checks passing now:** `npm run typecheck`, `npm run lint`, `npm test` (181 tests), `npm run build`. Once credentials exist, `npm run check:models` verifies the model IDs, structured output and embeddings against the real key/project.

### Run locally

```bash
npm install
npm run seed           # the demo scenario: 6 synthetic reports, claims, matching
npm run dev            # http://localhost:3000
npm test               # unit tests
npm run eval           # measured results on the labelled scenarios
```

With no environment variables set, the app uses a local file store in `.data/` and passcode sign-in (local passcode: `demo-reviewer`). Reports are saved and marked "AI pending" until Gemini is configured. `npm run seed:reset` clears the local store. All settings are documented in [`.env.example`](.env.example).

**Credentials: deferred by decision (2026-10-12).** We build chunks 4–8 to completion against the local backends (file store, local media, passcode sign-in) and the scripted test model, then set up Gemini, Firestore, Storage and Cloud Run in one pass near the end and verify everything together. Three things cannot close without credentials, because they are cloud checks by definition: chunk 9's gate (a deployed URL), the `check:models` live smoke test, and the demo video — hard requirement 5 says the video must *show the AI working*. Plan the credential session before recording and deploying, not after.

Legend: ⬜ not started · 🟡 in progress · ✅ done · ⚠️ needs attention

---

## 1. The hackathon: rules and how we score

**Event:** Google Cloud AI Builder Cup 2026, JAPAC region. Hack2skill runs it and Google Cloud sponsors it.
**Timeline:** team formation closed Oct 11 · **prototype submission Oct 18** · evaluation Oct 19 – Nov 6 · finalists announced Nov 7 · Demo Day in Singapore on Dec 4.
**Theme:** *Sustainability & Social Impact*, the only theme that mentions resilience and supporting communities. **Category:** Social Good.

**Hard requirements** (every one must hold at submission):
1. Uses Gemini or Gemma models, or a Google agent platform. We use Gemini 3.8 Flash and Gemini embeddings through the Google Gen AI SDK.
2. Deployed on Google Cloud via Cloud Run or Firebase. We deploy on Cloud Run.
3. A working prototype, not a mockup.
4. A vision deck as a PDF covering impact, problem fit, community benefit, feasibility and scalability.
5. A demo video of about 3 minutes on a public link (YouTube, Vimeo or Drive) that shows the AI working.
6. Code, docs and slides in English.
7. Eligibility: age 21+, working professionals only (no students), teams of 2–4.

**Judging criteria:**

| Criterion | Weight | Our answer |
|---|---|---|
| Technical Merit & Gen AI Implementation | 40% | Gemini does real work at every stage: multimodal extraction from Nepali or English text, photos and voice; cross-lingual report matching; contradiction reasoning; cited alert drafts. Every model output is schema-validated and its citations are checked against stored records. Deterministic code does the geography. We publish measured evaluation results. |
| Problem Alignment & Impact | 25% | Monsoon landslides that cut road access to health services are a recurring problem in Nepal. The demo runs on a real OpenStreetMap road network. AapatVani works alongside existing systems (e.g. Nepal's BIPAD disaster portal), not in place of them. |
| Innovation & Creativity | 25% | The evidence → incident → network-impact chain. Blast radius uses road connectivity, not a circle. Every claim shows its provenance. Copied reports don't count as corroboration. |
| UX & Solution Design | 10% | Warm, calm, mobile-first reporting in Nepali or English. One reviewer workspace where each claim sits next to its evidence with a clear status label. |

---

## 2. What we're building

AapatVani AI turns fragmented community disaster reports (Nepali or English text, photos, voice notes, rough locations) into structured, traceable incident records. It suggests which reports describe the same event, flags contradictions and copies, and analyses which communities and services may lose road access. People confirm every fact and approve every alert.

**Differentiator:** *Community evidence → Incident intelligence → Potential impact analysis*, with provenance at every link. Most tools stop at pins on a map. AapatVani also shows where each claim came from, how the reports relate, and what a blocked road means for access to services, and it labels how we know each of those things.

**Out of scope:** publishing or broadcasting alerts automatically; predicting flood extents, landslide runout, casualties or damage; replacing emergency services.

---

## 3. Trust model (applies to every feature)

Every claim, finding and map feature carries an **origin** and a **review status** (see `src/lib/domain/schemas.ts`).

| Origin (UI label) | Meaning | What we store with it | Colour + icon |
|---|---|---|---|
| **Reported** | A community member said it | Report ID and the verbatim excerpt | Rose |
| **AI interpretation** | Gemini read it from text, a photo or audio | Model ID, prompt version, the cited excerpt or media item | Periwinkle |
| **Computed** | A deterministic calculation over our datasets | Dataset version, parameters, inputs | River teal |
| **Reviewer** | A person entered or corrected it | User ID, time, note | Ink |

Review status: `unreviewed` → `confirmed` · `edited` · `rejected` · `needs_info`. The word **Confirmed** (sage) appears only after a named reviewer acts; items awaiting review are butter yellow.

Rules:
1. Original submissions are immutable. AI outputs are stored separately and versioned.
2. Gemini never sees or returns real IDs. It cites short aliases (`R1`, `M1`, `C3`) that the server maps back to records, and the server rejects unknown aliases. Each quoted excerpt must appear in the original text; if it doesn't, the claim is downgraded to "AI interpretation" and flagged "excerpt not verified".
3. Coordinates never come from Gemini. They come only from GPS, a map pin, or a gazetteer match.
4. A similarity score never merges reports. Only a reviewer can.
5. The map keeps reported locations, impact candidates and confirmed information visually distinct. Every colour comes with an icon and a text label.
6. Being outside the analysis area never means "safe", and the UI says so.
7. Every record is labelled `synthetic`, `historical` or `operational`. The demo uses synthetic reports over real OSM geography.
8. An alert stays a draft until a reviewer approves it. The app never sends alerts.

**Visual direction** (from the team's reference): warm cream surfaces (`#faf4e8`), a deep pine-teal "ink" for the sidebar and primary buttons (`#16302e` — near-black, tied to the brief's teal), pastel cards in butter, rose, sage and periwinkle, river teal for computed findings, and terracotta reserved for labelled critical warnings. Large rounded corners, pill buttons, generous spacing. Type: **Plus Jakarta Sans** for Latin text with **Mukta** for Devanagari. Tokens live in `src/app/globals.css`.

---

## 4. Feature priorities

### Must-have (the demo depends on these)

| ID | Feature | Brief ref |
|---|---|---|
| M1 | Mobile report form: Nepali or English text, photo, GPS / map pin / place name, time. No personal data required. | F1 |
| M2 | Gemini extraction into Zod-validated claims with source references | F2 |
| M3 | Citation and excerpt validation; gazetteer lookup for place names | F2, F4 |
| M4 | Review queue and incident workspace: original next to extracted; confirm / edit / reject / needs-info per claim | F7 |
| M5 | Append-only audit trail that separates AI, system and human actions | F4, F7 |
| M6 | Candidate matching (time, distance, hazard, embedding similarity) with a score breakdown; reviewer merges or separates | F3 |
| M7 | Copy detection (same photo hash, near-identical text). Copies don't count as independent sources. | F3 |
| M8 | Contradiction flags from rules and from Gemini, each citing its claims | F3 |
| M9 | Blast radius: road access to health facilities before and after a candidate blockage, nearby assets, explanations, confirm/dismiss per candidate | F5 |
| M10 | Leaflet/OSM map with separate incident, impact-candidate and confirmed layers, plus a list view | F6 |
| M11 | Alert draft built only from confirmed claims; every sentence cited; human approval required | F8 |
| M12 | Reviewer sign-in (Firebase Auth in production, passcode fallback), server-side access checks, private media | §7 |
| M13 | Evaluation script over labelled synthetic scenarios, plus a results page with measured numbers | F10 |
| M14 | Deployed on Cloud Run | Hackathon |

### Should-have (planned into the chunks; cut only if time runs out)

- **S1** Voice notes: Gemini audio input; the transcript is labelled AI and the audio is kept.
- **S2** Alert drafts in both Nepali and English.
- **S3** Dashboard filters (hazard, time, status) and "awaiting review" counts.
- **S4** Region selector with a Philippines config, marked "no geographic dataset loaded — not validated".
- **S5** Impact assessment history: re-run the analysis and compare versions.
- **S6** Evidence graph view (report → claim → incident → impact → alert).
- **S7** Gemini plain-language explanation of computed impacts; it may only restate the computed result (numbers are checked).

### Future (explicitly out of scope for the hackathon)

- SMS, WhatsApp or IVR intake; an offline PWA
- Hazard models, satellite imagery, weather feeds
- A nationwide road network; PostGIS or pgRouting
- Multi-agency roles; BIPAD or CAP integration; alert broadcasting
- Grounding with Google Maps for resolving place names (check its display terms before mixing it with an OSM map)
- Multi-agent orchestration

---

## 5. Architecture

```
 Community reporter (phone browser)          Reviewer (signed in)
              │                                       │
              ▼                                       ▼
┌─ Next.js 16 app on Cloud Run ──────────────────────────────────────────
│  Pages:   / · /report · /report/[id] (public) · /dashboard · /reports · /incidents/[id] · /evaluation
│  Server:  route handlers: reports · extract · match · receipt · impact · alerts · review
│
│  lib/ai        Gemini calls, prompts, response schemas
│  lib/evidence  alias mapping, citation and excerpt checks
│  lib/matching  candidate scoring, copy detection, contradictions
│  lib/geo       gazetteer, road graph, shortest paths, blast radius
│  lib/db        Firestore or local file store, audit log
│  lib/storage   Cloud Storage or local media store
│  lib/auth      Firebase Auth or passcode sessions
└───────┬─────────────────────────┬──────────────────────────┬───────────
        ▼                         ▼                          ▼
 Gemini 3.8 Flash          Firestore                  Cloud Storage
 gemini-embedding-001      reports, claims,           private photos and
 (via Agent Platform)      incidents, reviews         audio (server-streamed)

 Also: data/regions/nepal/araniko-corridor/ (versioned OSM extract, shipped with the app)
```

**Principles**
- **One deployable.** A modular Next.js app on Cloud Run, with no microservices and no multi-agent system.
- **Server-only data access.** Route handlers reach Firestore and Storage through the Firebase Admin SDK. `firestore.rules` and `storage.rules` deny all client access, so access control lives in one place.
- **Swappable backends.** `DATA_BACKEND=local|firestore`, `STORAGE_BUCKET` (or `MEDIA_BACKEND`), `AUTH_MODE=passcode|firebase` — the app runs end-to-end on a laptop without cloud credentials, and switches to Google Cloud with environment variables only.
- **Server-only Gemini.** On Cloud Run we call Gemini through Agent Platform using the service account, so there's no API key to leak. Local development can use an AI Studio key in `.env.local`.
- **Deterministic geography.** The OSM extract is pre-processed offline into versioned JSON that ships with the app. The same inputs always give the same results (tested).
- **Save first, analyse second.** A report is stored before any AI call, so a Gemini failure never loses a submission.
- **Next.js 16 conventions.** Cache Components and Partial Prefetching are on (the 16.4 defaults): data reads sit inside `<Suspense>` boundaries; `src/proxy.ts` (the renamed middleware) does a cheap cookie gate, and every page and route handler verifies the session itself.

### Stack (versions checked on npm, 2026-10-11)

| Layer | Choice | Version |
|---|---|---|
| App | Next.js App Router · React · TypeScript | next 16.4.0 · react 19.3.0 |
| UI | Tailwind CSS · shadcn/ui (Radix base, "maia" style) · Lucide icons | tailwindcss 4.3 · shadcn CLI 4.21 · lucide-react 1.55 |
| Type | Plus Jakarta Sans + Mukta (Devanagari) via `next/font` | — |
| AI | Google Gen AI SDK | @google/genai 2.28.0 |
| Validation | Zod; `z.toJSONSchema()` feeds Gemini's `responseJsonSchema` | zod 4.6.5 |
| Data | Firestore and Cloud Storage via Firebase Admin; local JSON store for development | firebase-admin 14.5.0 |
| Auth | Firebase Authentication (client SDK) or signed passcode sessions | firebase 13.0.0 |
| Map | Leaflet · react-leaflet · OSM tiles | leaflet 1.9.4 · react-leaflet 5.0.0 |
| Geo | In-house geometry, road graph and Dijkstra (`src/lib/geo`) | — |
| Data prep | `scripts/prepare-region.ts` (Overpass → graph, assets, gazetteer) | tsx |
| Tests | Vitest | vitest 4.1 |
| Deploy | Cloud Run (Dockerfile, Next.js `standalone` output), built by Cloud Build | Node 24 LTS image |

### Models (checked 2026-10-11; confirm with `npm run check:models` once credentials exist)

| Use | Model ID | Status |
|---|---|---|
| Extraction (text, photo, audio), matching judgements, contradictions, alert drafts | `gemini-3.8-flash` | Stable |
| Cheaper, faster fallback | `gemini-3.5-flash-lite` | Stable |
| Text embeddings for matching (Nepali ↔ English) | `gemini-embedding-001` | GA |
| Optional, for hard cases | `gemini-3.1-pro-preview` | Preview, so don't depend on it |

All model IDs live in `src/config/models.ts` and can be overridden by environment variables. Thinking level: `LOW` for extraction, `MEDIUM` for comparisons. (3.8 Flash rejects `MINIMAL`.)

### Who does what: Gemini, code, people

| Stage | Gemini | Deterministic code | People |
|---|---|---|---|
| Intake | — | Store the original, hash media, read EXIF, record times | Reporter submits |
| Extraction | Reads text, photos and voice; proposes claims with cited excerpts | Schema validation, alias → ID mapping, excerpt check, gazetteer lookup | Confirm / edit / reject |
| Matching | Embeddings; "same incident?" judgement citing claims | Distance, time gap, hazard compatibility, copy detection, score breakdown | Merge / separate |
| Contradictions | Semantic conflicts ("road open" vs "road blocked") | Field conflicts (place, time, hazard, numbers, photo metadata) | Resolve |
| Impact | Flags claims that describe a road blockage; explains computed results | Snapping, candidate blocked segment, shortest paths, before/after comparison | Confirm / dismiss each candidate |
| Alert | Drafts text from confirmed facts only, citing each sentence | Rejects uncited sentences, unknown citations and unsupported numbers | Approve (never sent automatically) |

### Repo layout

```
aapatvani/
├── project.md                    ← this file
├── docs/product-vision.md        ← original product brief
├── src/
│   ├── app/                      ← pages and API route handlers
│   ├── components/ui/            ← shadcn components (more component folders arrive with the UI chunks)
│   ├── config/                   ← regions/ (nepal.ts, philippines.ts), models.ts
│   ├── lib/
│   │   ├── domain/schemas.ts     ← Zod schemas and types (the shared contract)
│   │   ├── geo/                  ← math, graph, blast-radius, gazetteer, dataset loader
│   │   ├── ai/                   ← Gemini client, schemas, extraction, compare, alerts, explain, guards
│   │   ├── evidence/             ← aliases, excerpt verification
│   │   ├── db/ storage/ auth/    ← swappable backends
│   │   └── env.ts ids.ts time.ts rate-limit.ts firebase-admin.ts
│   └── proxy.ts                  ← cookie gate for responder pages
├── data/regions/nepal/araniko-corridor/   ← dataset.json, network.json, assets.json, gazetteer.json, SOURCE.md
├── scripts/                      ← prepare-region.ts, check-models.ts, overpass/ query
├── tests/                        ← Vitest unit tests (+ helpers: toy dataset, fixtures, scripted test model)
├── firestore.rules · storage.rules · firebase.json   ← deny-all client rules
└── .env.example
```

---

## 6. Data flow

1. **Submit.** `POST /api/reports` (multipart). The server validates the request (Zod, file type, size), uploads media to private storage, computes SHA-256 hashes, reads EXIF and writes `reports/{id}`, then returns a reference code. The report is safe from this point. Cloud Run caps HTTP/1 requests at 32 MiB, so uploads are size-limited in the browser (with any resize disclosed to the reporter).
2. **Extract.** The client then calls `POST /api/reports/{id}/extract`, and reviewers can re-run it. Gemini returns structured JSON, which goes through Zod, alias mapping, the excerpt check and the gazetteer lookup, then into `extractions/{id}` and `claims/*`. If extraction fails, the status becomes `extraction_failed` (or `ai_unavailable` without credentials) and the original stays untouched.
3. **Match.** Embed the report, generate candidates (time, distance, hazard), check for copies, and ask Gemini to compare the top candidates. Results go to `suggestions/*` and `contradictions/*`, and the report joins a candidate incident.
4. **Review.** A reviewer confirms claims and confirms or separates incident membership. Every action writes to `auditEvents/*`.
5. **Analyse impact.** The reviewer runs blast radius, which writes `impactAssessments/{id}` (versioned, with its inputs), then confirms or dismisses each candidate.
6. **Draft alert.** Gemini sees only confirmed claims, confirmed impacts and open questions. After the citation and number checks, the result is saved as `alertDrafts/{id}` with status `draft`. The reviewer approves it (`approved`). Nothing is sent.

---

## 7. Data model (Firestore)

Defined and validated in `src/lib/domain/schemas.ts`. No nested arrays (Firestore limitation): polylines are flat `[lat, lng, …]` arrays.

| Collection | Main fields | Writes |
|---|---|---|
| `reports` | text, language, reporterHazard, media[] {storagePath, mime, sha256, exif}, location {source: gps · pin · place_name · none, lat, lng, accuracyM, placeText}, timeHint, reportedTimeText, submittedAt, regionId, dataLabel, reporterToken (random, anonymous), status | Created once; only status fields change |
| `extractions` | reportId, model, promptVersion, translation, transcript, hazard candidates, missing info, validation counts, raw output, embedding (768-d) | Append-only |
| `claims` | reportId, extractionId, type, statement (original language), statementEn, origin, basis, excerpt {text, verified, start, end}, place {text, romanized, resolved}, time, roadStatus, people, review | Status changes only through review actions |
| `incidents` | members[] {reportId, membership, copyOf}, reportIds, hazard, location, status (candidate · under_review · verified · dismissed), independentSources, openContradictions | System proposes; reviewer decides |
| `suggestions` | reportIds, features {distance, hours, hazardMatch, similarity, sharedMedia, sameReporter}, score, copySuspected, ai {verdict, agreements, conflicts}, status | System, then reviewer |
| `contradictions` | incidentId, reportIds, claimIds, kind, detectedBy (rule · ai), description, status | System, then reviewer |
| `impactAssessments` | incidentId, version, dataset, inputs, status, blockedRoads, candidates[] {finding, explanation, caveats, access before/after, review}, warnings, limitations, aiExplanation | Append-only versions |
| `auditEvents` | actor {kind: human · ai · system · public}, action, target, summary, before, after, note, at | Append-only |
| `alertDrafts` | incidentId, version, sections[] {sentences[] {text, textNe, citations}}, sources, validation, status, decision | Reviewer approves |

---

## 8. Core logic

### 8.1 Extraction and citation checks (built: `src/lib/ai/extraction.ts`)
- **Prompt context:** the original text, photos and audio; the submission time in Asia/Kathmandu (UTC+05:45); the region's hazard list; and aliases (`R1` for the report, `M1…` for photos, `A1` for the voice note).
- **Output** (Zod → JSON Schema): language; English translation; transcript; hazard candidates with rationale; claims (type, statement, source alias, verbatim excerpt); place mentions (verbatim + romanised); time mentions (verbatim plus an interpreted window); media notes; missing information; uncertainties.
- **Server checks:** Zod parse (one retry with the errors fed back); every alias must exist; every excerpt must appear in the original text (`src/lib/evidence/excerpt.ts`, tested with Nepali text); every hazard must be in the region's list; coordinates are never accepted from the model.
- **Places:** mentions are matched against the gazetteer (`src/lib/geo/gazetteer.ts`): exact English or Nepali names, aliases, small spelling differences, or the model's romanisation (labelled as such). Equally good matches more than 3 km apart are marked ambiguous instead of guessed.
- **Nepali details:** Devanagari digits, Bikram Sambat dates, relative times like "हिजो राति" (last night). Verbatim text is kept; interpreted times are labelled AI, and interpretations after the submission time are discarded.
- **Origin rules (enforced in code, tested):** a claim is *Reported* only when its excerpt is found in the reporter's text (or, for voice notes, in the AI transcript — labelled as such); otherwise it becomes an *AI interpretation*. Photo and inference claims are always AI. Claims citing unknown aliases or a mismatched source are dropped and counted. People counts survive only if the quoted words state them. The AI's hazard category becomes its own reviewable `hazard` claim. Every model output is validated by the same Zod schema it was generated from, with one corrective retry; failures produce a `failed` extraction record, never a silent patch.
- **Other Gemini uses (built):** `compare.ts` (pairwise verdict; conflicts must cite both reports), `alerts.ts` (sections of cited sentences; uncited, misplaced or number-unsupported sentences removed; system headline fallback), `explain.ts` (plain-language restatement; rejected if it adds numbers, calls anything safe, or mentions casualties/damage), `gemini.ts` (Agent Platform or API key, 90 s timeout, one retry on the fallback model, normalised 768-d embeddings).

### 8.2 Matching and copies (chunk 4)
- **Candidate pairs:** same region, at most 24 h apart, at most 5 km apart (plus both uncertainty radii), compatible hazards (`hazardRelation` in the region config). Starting thresholds, tuned on synthetic data and reported honestly.
- **Similarity:** cosine similarity of `gemini-embedding-001` vectors (multilingual).
- **Copy suspicion:** the same photo SHA-256, near-identical text (character 5-gram Jaccard ≥ 0.85), or the same anonymous reporter token. Copies are linked but don't count as independent sources.
- **Gemini comparison:** verdict (`likely_same | possibly_same | likely_different | insufficient_information`) with agreements and conflicts citing claim aliases. The UI shows every feature next to the verdict; only reviewers merge.

### 8.3 Contradictions (chunk 4)
- **Rules:** locations further apart than both uncertainty radii plus 1 km; reported times more than 6 h apart; incompatible hazards; conflicting road status or numbers; photo EXIF time much older than the report; photo EXIF location far from the reported location.
- **Gemini:** semantic conflicts ("road fully blocked" vs "one lane open"), each citing its claims. Each contradiction stays `open` until a reviewer resolves it.

### 8.4 Blast radius (built: `src/lib/geo/blast-radius.ts`)
1. **Candidate blocked segment:** only when a claim describes a road blockage. Search radius = location uncertainty, clamped to 150 m–1 km. Prefers the road named in the report (spelling-tolerant: "Araniko Rajmarg" ≈ "Arniko Highway (NH34)"), otherwise the most important road class, then the nearest. One segment is assumed blocked; other nearby roads are listed but not assumed blocked.
2. **Access check:** multi-source Dijkstra from all health facilities, and separately from hospitals, on the full network and with the segment removed. Each settlement gets `lost` (no route in our data), `longer` (> +50 % and > 2 km) or `unchanged`. Facilities whose catchment changes are flagged too.
3. **Nearby assets:** within 2 km (plus uncertainty), straight-line only, labelled "being nearby does not mean it is affected".
4. **Explanations** are deterministic sentences; caveats cover weak road links (> 500 m from a mapped road), unconfirmed claims and footpaths. Settlements already disconnected before the incident are reported as data gaps, not as affected.
5. **Always shown:** "Places outside this analysis are not necessarily safe." Outside the dataset → no analysis and a clear message.

No flood extents, runout estimates, or casualty or damage estimates. Runs in ~25 ms on the corridor graph.

### 8.5 Alert drafts (chunk 3 logic, chunk 7 UI)
- Gemini receives only confirmed claims, confirmed impact candidates, open contradictions and unknowns, all aliased.
- **Output sections:** headline · what is known · where and when · possible impacts · not yet confirmed. Every sentence cites aliases; sources are listed by the app, not the model.
- Sentences with no valid citation, an unknown alias, or a number not present in their sources are removed and counted.
- Status goes from `draft` to `approved` by a named reviewer. The app never broadcasts.

---

## 9. Build plan (chunks)

| Chunk | Deliverables | Done when |
|---|---|---|
| 1 Foundation ✅ | Next.js 16.4 + Tailwind 4 + shadcn/ui; theme tokens and fonts; OSM extract for the Araniko corridor | Build passes; dataset regenerates from the saved query |
| 2 Backend core ✅ | Schemas; local/Firestore store; local/GCS media; passcode/Firebase sessions; proxy gate; excerpt + alias checks; gazetteer; graph + blast radius; tests | 57 unit tests pass, incl. the real-data demo regression |
| 3 AI layer | Gemini client (Agent Platform or API key, fallback model, timeouts); Zod output schemas → JSON Schema; prompts; extraction (text/photo/voice) with origin assignment and place resolution; embeddings; pairwise comparison; alert drafting; impact explanation; `check:models` script; tests with a fake model | Unit tests cover every validation path; live smoke test once credentials exist |
| 4 Matching & incidents ✅ | Feature scoring, copy detection, contradiction rules, incident assignment, services, all API routes, audit events | End-to-end via API on the local store |
| 5 Public side ✅ | Landing page; report form (NE/EN UI, photo, voice recorder, GPS/pin/place, time); receipt with "what we understood" | Submitting on a phone works |
| 6 Responder side ✅ | Sign-in; dashboard (stats, map, incident list, incoming timeline, filters); review queue; report workspace with excerpt highlighting; incident workspace | A reviewer can triage the seeded scenario |
| 7 Impact & alerts ✅ | Blast radius panel + map layers; confirm/dismiss; history; AI explanation; alert drafting, citations, approval | The full demo scenario runs |
| 8 Evaluation & seed ✅ | Labelled scenarios, `npm run eval` (Gemini and oracle modes), results page, seed/reset scripts, demo images with attribution | Measured numbers on `/evaluation` |
| 9 Finish ✅ (deploy unverified) | Dockerfile, Cloud Run deploy script/docs, README, final QA | Deployed URL works in a private window and on a phone |

---

## 10. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Gemini invents IDs, quotes or coordinates | Aliases instead of IDs; server-side citation and excerpt checks; coordinates only from GPS, pin or gazetteer; Zod on every response |
| Weak Nepali extraction (Devanagari, Bikram Sambat dates, local place names) | Test realistic Nepali reports as soon as credentials exist; keep the verbatim text; reviewers can edit; measure it in eval |
| Model ID, quota or region problems | Model IDs in one config file; `check:models`; `global` location; flash-lite fallback; retry with backoff |
| Slow multimodal calls (seconds to tens of seconds) | Save first, extract second; show progress; pre-seed the demo data; `LOW` thinking for extraction |
| False merges | Never auto-merge; show the feature breakdown; measure false merges in eval |
| OSM gaps in rural Nepal | Show the snapshot date and snap warnings; "not necessarily safe" notice; data gaps reported separately (4 settlements are already disconnected in the extract) |
| Cache Components surprises (Next 16.4 default) | Keep data reads inside `<Suspense>`; read env at request time; `instant = false` where a route must block |
| Leaflet breaks server rendering | Load map components client-only (`next/dynamic` with `ssr: false`) |
| Deployment surprises late in the build | Dockerfile early in chunk 9; `standalone` output; the Firebase web config is read at runtime, not baked into the build |
| Leaked secrets | No API key in production (service account); Secret Manager if we need one; `.env*` is git-ignored; nothing secret behind `NEXT_PUBLIC_` |
| Sensitive media (faces, EXIF GPS) | Private storage; media streamed to signed-in reviewers only; EXIF never shown publicly |
| OSM tile usage policy | Attribution on the map and light use only (fine for a demo); `MAP_TILE_URL` to switch providers |
| Abuse of the public form | Size and type limits, a per-IP rate limit, demo data labelled synthetic |
| Judges can't reach the reviewer features | Demo reviewer login shown on the sign-in page (`DEMO_LOGIN_HINT`), seeded data, reset script |
| Cold starts during judging | `min-instances=1` from Oct 19 to Nov 6, with a budget alert |
| Scope creep | Chunk deliverables are the contract |

---

## 11. Smallest credible end-to-end demo

1. Seed synthetic landslide reports: a Nepali text with a photo, an English text naming a nearby place, and a forwarded copy of the first.
2. Gemini extracts claims with cited excerpts, and the server validates every citation.
3. The reports appear as one candidate incident with a score breakdown. The copy is flagged and not counted, and one contradiction is flagged.
4. A reviewer confirms the "road blocked" claim and the grouping.
5. Blast radius on the real OSM road graph shows on the map which settlements lose road access to their nearest health facility, with an explanation.
6. A cited alert draft is generated from the confirmed claims, and the reviewer approves it.

---

## 12. Demo scenario and evaluation

**Demo area (settled):** the Araniko Highway corridor in Sindhupalchok. The extract covers Dolalghat–Chautara–Bahrabise–Tatopani–Kodari inside Nepal's border. Verified with the engine:

| Blocked stretch of the Arniko Highway (NH34) | Result on the mapped network |
|---|---|
| Between Larcha and Tatopani (27.9385, 85.9418) | Tatopani, Namtan and Kodari lose every mapped road route to a health facility (nearest was Keystone Hospital, 23–30 km) |
| Near Ghumthang (27.86, 85.878) | 20 settlements' routes to care grow by 14–15 km |
| Near Khukundol (27.9175, 85.9297) | 4 settlements' routes grow by 12 km |

We use the Larcha–Tatopani stretch: a fictional landslide in real geography, labelled SYNTHETIC everywhere.

| Report | Content | The system should |
|---|---|---|
| R1 | Nepali text and photo: a landslide covering the highway near Larcha, in the morning | Extract the hazard, road blockage, place and time |
| R2 | English text: the road to Tatopani is blocked near another landmark | Suggest it's the same incident as R1 |
| R3 | A forwarded copy of R1's text | Flag it as a copy, not an independent source |
| R4 | "Road is open, only small debris" | Flag a contradiction with R1 and R2 |
| R5 | Flooding about 20 km away | Not merge it |
| R6 | Vague report, no location | Say "location unknown" rather than guess |

**Evaluation (`npm run eval`)** runs the real pipeline on labelled scenarios and reports extraction accuracy, matching precision/recall (false merges, missed matches), copy detection, contradiction recall, citation rejection rate, impact correctness (exact expectations on the toy graph + scenario expectations), missing/stale data handling and abstention. Results are saved with model ID, prompt version and date, and shown on `/evaluation`. It's a small synthetic set, and we say so. No real-world effectiveness claims.

---

## 13. Decisions

| Date | Decision | Reason |
|---|---|---|
| 2026-10-11 | Modular Next.js 16 app on Cloud Run | Meets the deployment rule; one deployable |
| 2026-10-11 | `gemini-3.8-flash` as the default model; `gemini-embedding-001` for matching | Stable, multimodal, structured output; no dependency on preview models |
| 2026-10-11 | Gemini runs server-side only; it cites aliases, never real IDs; no coordinates from Gemini | Keeps provenance intact |
| 2026-10-11 | All data access through the Admin SDK on the server; client rules deny everything | One place to enforce access |
| 2026-10-11 | Offline OSM extract plus in-app shortest paths; no PostGIS | Deterministic and quick to build |
| 2026-10-11 | Reviewer sign-in is a must-have (the brief said "if time permits") | Review and approval need real access control, and judges need a demo login |
| 2026-10-11 | Theme: Sustainability & Social Impact | Best fit for resilience and community work |
| 2026-10-11 | Warm palette from the team's reference; deep pine-teal ink instead of pure black; Plus Jakarta Sans + Mukta | Welcoming and trustworthy; keeps the brief's teal; Mukta renders Nepali well |
| 2026-10-11 | Local file store, local media and passcode sign-in as development fallbacks, switched by env vars | Build and test end-to-end before cloud credentials exist; no fake AI output |
| 2026-10-11 | Keep Next.js 16.4 defaults (Cache Components + Partial Prefetching) | Recommended defaults; data reads go inside Suspense |
| 2026-10-11 | Demo area: Araniko corridor, Larcha–Tatopani stretch | Real network shows a clear, verifiable loss of access |
| 2026-10-11 | Work in chunks, commit at the end of each chunk | Team request |
| Proposed | Gemini via Agent Platform (`enterprise: true`) on Cloud Run; an AI Studio key only for local dev | No API key in production. Confirm in §15. |
| 2026-10-12 | Defer all Google Cloud setup (Gemini, Firestore, Storage, Cloud Run) to one session near the end of the build; verify chunks 4–8 against the local backends and the scripted test model | Team decision — build the whole pipeline first, then set up and check the Google services in a single pass. Accepted cost: model-ID, quota, region and Nepali-extraction problems surface late, so keep the `Llm` interface and oracle/test-model modes working as the hedge |
| Proposed | GCP region `asia-south1` (Mumbai) for Cloud Run, Firestore and Storage; Gemini location `global` | Closest region to Nepal; regional availability of 3.8 Flash not yet confirmed |

---

## 14. Progress log

- **2026-10-11:** Created the repo, `.gitignore`, this tracker and `docs/product-vision.md`. Verified package versions, Gemini model IDs, SDK options and the hackathon rules (see Appendix).
- **2026-10-11 (chunks 1–2):** Scaffolded Next.js 16.4 with shadcn/ui and the warm theme. Pulled the Nepal-bounded OSM extract (snapshot 2026-10-11T11:22:51Z) and built the corridor dataset: 11,340 nodes, 11,613 edges, 2,525 km of road, 36 health facilities (4 hospitals), 408 schools, 187 settlements, 622 bilingual gazetteer entries. Wrote the domain schemas, swappable data/media/auth backends, evidence checks, gazetteer and the Blast Radius engine. Typecheck, lint, 57 unit tests and the production build pass. First commit.
- **2026-10-12 (chunk 9):** Finished the build. Added a three-stage `Dockerfile` (Node 24 LTS, `npm ci` from the lockfile, standalone output, unprivileged user, `dumb-init` so Cloud Run's SIGTERM reaches the app), a `.dockerignore` that keeps secrets and development data out while deliberately keeping `data/regions` and `data/eval` in, `docs/deploy.md` covering the whole path from enabling APIs to the judging-window `min-instances` and its budget alert, and a `README.md` carrying setup, architecture, the Gemini-versus-code split, limitations, data sources and licences, and the evaluation approach. Fixed the long-standing build warning properly: `data/regions` and `data/eval` are read with paths the bundler cannot follow, so they are now named in `outputFileTracingIncludes` and everything else excluded — without that they would simply be missing in the container. **Verified the standalone build by running it**: `node .next/standalone/server.js` serves the public form, refuses anonymous API calls with 401, and — the check that mattered — loads the road dataset from the traced output and runs a real Blast Radius ("Araniko Highway corridor, Sindhupalchok"). That failure would have appeared only in production, as an empty map. **Not verified:** the image itself has never been built (Docker is not installed; Cloud Build does it), and the deploy has not run, because both need credentials. I checked every path the Dockerfile copies exists in the build output, which is as far as this can go from here. 181 tests pass; typecheck, lint and build clean.
- **2026-10-12 (chunk 8):** Built the evaluation. Five labelled scenarios over the real corridor — the demo landslide with a forwarded copy, two different hazards close together, a pure copy pair, an event whose casualty counts disagree, and a report that cannot be placed — each carrying an answer key: what should be grouped, what must not be, which pairs are copies, which contradictions should be flagged, and what the road analysis should find. `npm run eval` runs them in two modes. **Oracle mode** feeds the answer key in as if extraction had produced it, so the deterministic half of the pipeline is measured exactly with no model involved; it runs today. **Gemini mode** runs the real extraction and is the only mode that can say anything about reading reports; it needs credentials. Results are saved with the mode, model and date, and `/evaluation` shows them with the caveat that this is a small hand-written set, not a benchmark. Current oracle numbers: grouping precision 100%, recall 100%, 0 false merges, copy precision and recall 100%, contradiction recall 2/2, correct abstentions 2/2, impact scenarios 1/1. **I checked the harness can fail** before trusting it: removing one copy expectation from the answer key moved copy precision to 50% and flagged a false positive, so the numbers are responsive rather than decorative. The seed script now draws on the same scenario file, so the demo and the measured results cannot drift apart, and it seeds the unplaceable sixth report too, which exercises abstention in the UI. 181 tests pass, including nine that check the answer key itself — that every quoted excerpt really appears in its report, that no pair is expected both grouped and apart, and that every behaviour the results page claims to measure has a scenario behind it. **Not done:** the "demo images with attribution" clause — the mechanism exists, but the choice of image is open question 3 and is yours.
- **2026-10-12 (chunk 7):** Built the impact and alert UI on the incident page. The Blast Radius panel runs the analysis, shows the assumed blocked segment and the findings grouped by what they claim, with each finding's own caveats beside it rather than in a footnote, and confirm/dismiss per finding. The impact map draws the blocked segment, the affected settlements, the facilities whose catchment changed and the nearby-but-not-assumed-affected assets, each with its own shape and a legend that names it. Version history lists every run. The alert panel drafts from confirmed facts, shows every sentence with chips naming the claims, findings and contradictions it rests on — attached by the app, not the model — and records an approval by name while stating that nothing is sent. Verified live on the seeded scenario: the analysis treats one 55 m segment of Arniko Highway (NH34) as blocked, 4 settlements lose every mapped route to care, 1 facility catchment changes, and 4 settlements already disconnected in the extract are reported as data gaps rather than as impact. Candidate confirm and alert approval both work end to end, and the approval writes "Nothing was sent" to the audit trail. The alert panel's rendering was checked against a temporary fixture and then removed, because drafting needs Gemini; the seed stays clean rather than shipping a draft that no model wrote. **What still needs credentials:** extraction, the model comparison, and drafting. Everything deterministic around them runs live. 172 tests pass; typecheck, lint and build clean.
- **2026-10-12 (chunk 6):** Built the responder side. Reviewer sign-in (passcode now, Firebase Auth when a project exists), an app shell that is a sidebar on a laptop and a strip on a phone, and four screens: the dashboard (counts, map with a legend, incident list, incoming timeline, URL-backed filters), the review queue, the report workspace (the original beside what was read from it, with hover-to-highlight excerpts and confirm/correct/needs-information/reject per claim), the incident workspace (membership, scored match suggestions with their feature breakdown, contradictions) and the append-only activity trail with people, AI and system kept visually apart. Reviewer pages read the store directly rather than through the API, since they are server components; the API routes stay for what only a client can do. Also added `scripts/seed-demo.ts` (`npm run seed`), a first version of chunk 8's seed: without Gemini, extraction produces no claims, so the reviewer screens would have had nothing to check against. Seeding immediately found a real bug: copy detection compared the *English translation*, so a forwarded Nepali report looked different from its original whenever only one of the two had been through extraction — the demo's copy was counted as an independent source. It now compares the reporter's verbatim words, which is what §8.2 describes, with a regression test. Verified end to end on the seeded scenario: 4 reports grouped with the copy excluded (3 independent sources), 3 rule-found contradictions, 6 scored suggestions, excerpts highlighting in the original, and a live suggestion acceptance confirming both memberships. 172 tests pass; typecheck, lint and build clean. **Known refinement:** one disagreement between four reports produces three pair-wise contradiction flags rather than one, which overstates the count on the dashboard; the flags are individually correct and resolvable, but the count should be grouped by the conflicting claims.
- **2026-10-12 (chunk 5):** Built the public side. A landing page that explains the tool in the reporter's own language (Nepali by default) and states plainly what the system does and does not do; the mobile report form with text, a hazard picker carrying the region's own local names, location by GPS or dropped pin or place name, a time hint, photo capture and a voice recorder; and a receipt showing the reference code and "what we understood". `lib/i18n.ts` holds the public strings in both languages, with a test asserting the two dictionaries define the same keys and the same `{placeholders}` — the failure it guards against is silent, since a missing Nepali string falls back to English on the one screen where the reader may not read English. The receipt is served by `GET /api/reports/[id]/receipt`, gated on the submit token the sending browser holds (in a header, not a URL, so it stays out of access logs); it is the reporter's own view rather than the reviewer's view with fields hidden, and a test asserts no incident grouping, reviewer note or token hash can appear in it. Three decisions worth recording: extraction is triggered from the receipt page rather than during submission, so a slow model call never stands between a reporter and confirmation that their report was saved; picking a location mode and then leaving it empty sends no location rather than a source claiming one (a bug found by testing, which had rejected the whole submission); and large photos are shrunk on the device with the change disclosed to the reporter. 169 tests pass; typecheck, lint and build clean. **Not yet done:** the form has been verified against the running app and its API, but not yet with a real phone camera, microphone or GPS — the "done when" clause is "submitting on a phone works", and that needs a device.
- **2026-10-12 (chunk 4):** Built matching and incidents, and the whole backend API. `lib/matching/` (candidate filter, lexical + embedding similarity, copy detection, feature scoring with a visible breakdown, rule contradictions), `lib/incidents/` (candidate incidents, membership, independent-source counting), `lib/review/` (claim, suggestion, contradiction and membership decisions), `lib/impact/` (versioned Blast Radius runs, candidate confirm/dismiss, guarded AI explanation), `lib/alerts/` (cited drafts, approval), `lib/reports/` (intake with EXIF and hashing, extraction runs), plus an append-only audit trail and 18 API routes covering reports, extraction, matching, review, impact, alerts, media and sign-in. Two design points worth recording: coordinates are taken only from GPS, a pin or a gazetteer match, so a report with no usable location is deliberately never compared rather than guessed at (§3 rule 3); and copies skip the Gemini comparison, because the copy link is already the finding. 156 tests pass, including the §12 demo scenario end to end on the local store and every route exercised through its handler. Two fixes came out of testing: accepting a suggestion now confirms both memberships (it previously left them "suggested" when the system had already grouped the pair), and `handle()` no longer swallows Next.js prerender signals. Known and deferred: the Turbopack build warns that `lib/geo/dataset.ts` reads the dataset with a dynamic path, which traces the whole project into the standalone output — a Docker image-size item for chunk 9, not a correctness problem.
- **2026-10-12 (status check):** Re-ran the full check set on a clean tree — typecheck, lint, 91 tests and the production build all pass. Chunk 3's code is complete and committed. The only unmet clause is its live smoke test: there is still no `.env.local`, so `npm run check:models` has never run against a real key or GCP project. Chunk 4 can start without credentials (the scripted test model covers it), so this is not blocking the build — but it is now the long-lead item on the critical path for the demo. The AI layer is library code only so far; nothing calls it from an API route yet (chunk 4 wires that up).
- **2026-10-11 (chunk 3):** Built the AI layer: Gemini client with Agent Platform/API-key backends and fallback, Zod → Gemini JSON Schema conversion (only supported keywords, tested), validated structured generation with one corrective retry, multimodal extraction with provenance rules and gazetteer resolution, embeddings, pairwise comparison, cited alert drafting with number checks, impact explanation guard, and `npm run check:models`. 91 unit tests pass (a scripted test model exercises every validation path). Live Gemini calls not yet run — waiting for credentials.

---

## 15. Open questions

1. Gemini access — **deferred to the end-of-build credential session** (see §0 and §13). The decision still needed then: Agent Platform (recommended, no key to leak) or an AI Studio key. The AI layer is built and unit-tested either way. Put it in `.env.local` (see `.env.example`).
2. GCP project ID with billing or hackathon credits — **deferred to the same session**; needed for Firestore, Cloud Storage, Firebase Auth and Cloud Run.
3. Demo images: **still open.** The schema carries an `attribution` field on every media item and the seed will write one, but no image is included, because the choice is yours: an openly licensed landslide photo (attributed, and labelled as not of this event) or images you provide. Nothing is blocked on it — the demo works with text-only reports, and §12's scenario needs no photo.

---

## 16. Submission checklist

- [ ] Theme (Sustainability & Social Impact) and category (Social Good) selected — **yours, in the submission form**
- [ ] Cloud Run URL works in a private window and on a phone — **needs credentials**; `docs/deploy.md` §4 has the checks
- [ ] Demo reviewer credentials in the submission notes — **yours**; locally the passcode is `demo-reviewer`, and the deployed one is whatever you set as `REVIEWER_PASSCODE`
- [ ] A ~3-minute demo video on a public link that shows Gemini working — **needs credentials**, and requirement 5 means it cannot be recorded without them
- [ ] Vision deck PDF: impact, problem fit, community benefit, feasibility, scalability — **yours**. `project.md` and the README carry the substance; §12 has the measured numbers
- [x] README: setup, architecture, Gemini vs code, limitations, data sources and licences, eval results
- [x] All synthetic data labelled; OSM attribution visible on the map
- [x] Code, docs and slides in English
- [ ] `min-instances=1` and a budget alert for the evaluation window (Oct 19 – Nov 6) — documented in `docs/deploy.md` §5; **set the alert before turning it on**
- [ ] Submitted by **Oct 17**

**The credential session is now the only thing between here and a submittable entry.** Everything else that can be built without Google Cloud access has been built and verified. §13 records the decision to defer it; this is the point where deferring stops being free, because the video and the deployed URL both depend on it.

---

## Appendix: verified facts (as of 2026-10-11)

**Hackathon** ([aibuildercup.com](https://aibuildercup.com/), [themes](https://aibuildercup.com/themes.html)): dates, judging weights, mandatory deliverables and eligibility as summarised in §1. The site says both "submit before October 18" and "deadline October 18", so we submit on Oct 17.

**Gemini models** ([models page](https://ai.google.dev/gemini-api/docs/models), updated 2026-10-09; [3.8 Flash page](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)):
- `gemini-3.8-flash`: stable. Input: text, image, video, audio, PDF. Limits: 1,048,576 input and 65,536 output tokens. Supports structured outputs, function calling, thinking (`low` / `medium` / `high`; `minimal` returns an error), Search and Maps grounding, batch and caching.
- Also listed: `gemini-3.5-flash-lite` (stable), `gemini-3.1-pro-preview` (preview), `gemini-embedding-001`, `gemini-embedding-2-preview` (multimodal) and `gemini-3.5-transcribe` (speech-to-text).
- `gemini-3-pro-preview` and `gemini-2.0-flash` are shut down, so don't copy model IDs from older tutorials.

**SDK** (type definitions in `@google/genai` 2.28.0, plus the [README](https://github.com/googleapis/js-genai)):
- Vertex AI is now **Gemini Enterprise Agent Platform** ([release notes](https://docs.cloud.google.com/gemini-enterprise-agent-platform/release-notes)). Initialise with `new GoogleGenAI({ enterprise: true, project, location })`, or set `GOOGLE_GENAI_USE_ENTERPRISE=true`, `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`. `vertexai: true` still works, but `enterprise` is recommended. The Vertex AI API still has to be enabled.
- Developer API: `new GoogleGenAI({ apiKey })`. The SDK also reads `GEMINI_API_KEY` or `GOOGLE_API_KEY`.
- The `generateContent` config supports `responseMimeType: 'application/json'` with `responseJsonSchema`, `thinkingConfig.thinkingLevel` and `abortSignal`. Embeddings use `models.embedContent` with `outputDimensionality` and `taskType`.
- The SDK needs Node ≥ 20. Version 3 will need Node ≥ 22, so we stay on 2.x.
- **Not yet confirmed:** whether `gemini-3.8-flash` is served from `asia-south1` on Agent Platform. We plan on `location: 'global'`.

**Next.js 16.4** (bundled docs in `node_modules/next/dist/docs/`): `create-next-app` enables Cache Components and Partial Prefetching by default; `middleware` is now `proxy` (Node.js runtime); request APIs (`cookies`, `headers`, `params`, `searchParams`) are async only; `next lint` is removed (use ESLint directly); Turbopack is the default bundler.

**OpenStreetMap data:** Overpass API (overpass-api.de), query in `scripts/overpass/np-araniko-corridor.overpassql`, limited to Nepal's national boundary; ODbL 1.0 — see `data/regions/nepal/araniko-corridor/SOURCE.md`.

**Local machine:**
- Installed: Node 25.2.1 · npm 11.6.2 · git 2.39.3 · Firebase CLI 14.4.0 · Python 3.12.4 · Homebrew 5.0.9
- Missing: the gcloud CLI (`brew install --cask gcloud-cli`)
- Docker isn't needed, because Cloud Build builds the image. The container uses a Node 24 LTS base image (Node 25 isn't an LTS release).
