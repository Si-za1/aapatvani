# AapatVani AI, Project Tracker

This is the working document: what we're building, how, and where we are. Update **§0 Status** and **§14 Progress log** whenever something changes state, and record decisions in **§13**.

- **Product brief:** [`docs/product-vision.md`](docs/product-vision.md), the source of truth for product intent
- **Hackathon:** Google Cloud AI Builder Cup 2026. Prototype deadline **Oct 18, 2026**; we target **Oct 17**.
- **Last updated:** 2026-10-14

---

## 0. Status

We build in chunks and commit at the end of each one.

| Chunk | What | Status |
|---|---|---|
| 1 | Foundation: scaffold, design system, region data (OSM extract) | ✅ Done |
| 2 | Backend core: data model, data/media stores, reviewer auth, evidence checks, gazetteer, Blast Radius engine, unit tests | ✅ Done |
| 3 | AI layer: Gemini extraction (text, photo, voice), embeddings, report comparison, alert drafting, impact explanation, validation | ✅ Done (unit-tested, and live-checked against a real Gemini key on 2026-10-14) |
| 4 | Matching & incidents: clustering, copy detection, contradiction rules, services, API routes | ✅ Done (local store, end-to-end through the API) |
| 5 | Public side: welcoming landing page, mobile report form (Nepali/English, photo, voice, location, time) | ✅ Done (public pages live; phone hardware checks still to do) |
| 6 | Responder side: dashboard + map, review queue, report and incident workspaces | ✅ Done (reviewer can triage the seeded scenario) |
| 7 | Impact & alerts UI: blast radius on the map, confirm/dismiss, cited alert drafts with approval | ✅ Done (deterministic path runs live; the model-written steps need credentials) |
| 8 | Evaluation & demo data: labelled synthetic scenarios, eval script, results page, seed | ✅ Done (measured in oracle mode; Gemini-mode numbers wait for credentials) |
| 9 | Finish: Dockerfile, Cloud Run deploy, README, final checks | ✅ Done except the deploy itself (needs credentials) |
| 10 | Design pass on the responder shell and dashboard (icon rail, top bar with the notification bell, settings and profile; dashboard rebuilt as four blocks) | ✅ Done |
| 11 | Timeline: the evidence chain drawn on a horizontal axis, filtered by hazard, cut by day, week or month | ✅ Done |
| 12 | Incident board: one tinted panel per hazard, with cards, filters and a board/list switch | ✅ Done |
| 13 | Charts, done properly: a validated chart palette, the activity record redrawn, and the blast radius drawn as before-and-after | ✅ Done |
| 14 | An incident overview, the findings as a deck, and the homepage's hazard panel | ✅ Done |
|, | Vision deck (PDF) + 3-minute demo video | ⬜ |

**Checks passing now:** `npm run typecheck`, `npm run lint`, `npm test` (209 tests), `npm run build`. `npm run check:models` has run against a real key (2026-10-14) and passes: model IDs, structured output and 768-d embeddings. `npm run test:multimodal` sends a photo and a voice note through the real extraction (3/3 cases). `npm run eval -- --mode oracle` is clean. Gemini-mode evaluation is **not yet run** — it needs ~40–55 requests and the free tier cannot fit that in one day. See §14.

### Run locally

```bash
npm install
npm run seed           # the demo scenario: 6 synthetic reports, claims, matching
npm run dev            # http://localhost:3000
npm test               # unit tests
npm run eval           # measured results on the labelled scenarios
```

With no environment variables set, the app uses a local file store in `.data/` and passcode sign-in (local passcode: `demo-reviewer`). Reports are saved and marked "AI pending" until Gemini is configured. `npm run seed:reset` clears the local store. All settings are documented in [`.env.example`](.env.example).

**Credentials: the Gemini half is in place (2026-10-14); the Google Cloud half is not.** The decision to defer (2026-10-12) held through the build. A free-tier AI Studio key now lives in `.env.local` and passes `npm run check:models` (§14). Still outstanding, because they are cloud checks by definition: chunk 9's gate (a deployed URL) and the judging-window `min-instances` setting, both of which need a GCP project with billing — an AI Studio key is not one. The demo video is **no longer blocked**: hard requirement 5 says it must *show the AI working*, and Gemini now runs locally. The Gemini-mode evaluation is measurable too, subject to the free tier's daily cap.

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

**Visual direction** (current palette, set 2026-10-12): near-white cards (`#fefefe`) on a warm page (`#f8f5f0`), a deep olive-green "ink" for the sidebar and primary buttons (`#415111`), and pastels that each carry exactly one meaning: coral for what a community reported, violet for what the model read, moss for what deterministic code computed, leaf for what a person confirmed, amber for what needs review, flame for a critical warning (always labelled), stone for rejected or dismissed. Large rounded corners, pill buttons, generous spacing. Type: **Plus Jakarta Sans** for Latin text with **Mukta** for Devanagari. Tokens live in `src/app/globals.css`, and their names say what they mean rather than what colour they are.

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
- **S4** Region selector with a Philippines config, marked "no geographic dataset loaded, not validated".
- **S5** Impact assessment history: re-run the analysis and compare versions.
- **S6** Evidence graph view (report → claim → incident → impact → alert). **Built 2026-10-13 as the timeline**, which is the same chain laid out in time rather than as a graph.
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
- **Swappable backends.** `DATA_BACKEND=local|firestore`, `STORAGE_BUCKET` (or `MEDIA_BACKEND`), `AUTH_MODE=passcode|firebase`, the app runs end-to-end on a laptop without cloud credentials, and switches to Google Cloud with environment variables only.
- **Server-only Gemini.** On Cloud Run we call Gemini through Agent Platform using the service account, so there's no API key to leak. Local development can use an AI Studio key in `.env.local`.
- **Deterministic geography.** The OSM extract is pre-processed offline into versioned JSON that ships with the app. The same inputs always give the same results (tested).
- **Save first, analyse second.** A report is stored before any AI call, so a Gemini failure never loses a submission.
- **Next.js 16 conventions.** Cache Components and Partial Prefetching are on (the 16.4 defaults): data reads sit inside `<Suspense>` boundaries; `src/proxy.ts` (the renamed middleware) does a cheap cookie gate, and every page and route handler verifies the session itself.

### Stack (versions checked on npm, 2026-10-11)

| Layer | Choice | Version |
|---|---|---|
| App | Next.js App Router · React · TypeScript | next 16.4.0 · react 19.3.0 |
| UI | Tailwind CSS · shadcn/ui (Radix base, "maia" style) · Lucide icons | tailwindcss 4.3 · shadcn CLI 4.21 · lucide-react 1.55 |
| Type | Plus Jakarta Sans + Mukta (Devanagari) via `next/font` |, |
| AI | Google Gen AI SDK | @google/genai 2.28.0 |
| Validation | Zod; `z.toJSONSchema()` feeds Gemini's `responseJsonSchema` | zod 4.6.5 |
| Data | Firestore and Cloud Storage via Firebase Admin; local JSON store for development | firebase-admin 14.5.0 |
| Auth | Firebase Authentication (client SDK) or signed passcode sessions | firebase 13.0.0 |
| Map | Leaflet · react-leaflet · OSM tiles | leaflet 1.9.4 · react-leaflet 5.0.0 |
| Geo | In-house geometry, road graph and Dijkstra (`src/lib/geo`) |, |
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

**Since 2026-10-14** the local `.env.local` overrides the three primary slots to `gemini-3.6-flash`, because 3.8 Flash is oversubscribed on the free-tier key (§14). **In practice this has not helped:** 3.6 Flash hangs or 503s as well, and every measured extraction has been answered by the `gemini-3.5-flash-lite` fallback, at two requests per call. The documented model above is unchanged. Re-run `npm run check:models` before submission and drop the overrides if capacity recovers.

**Model calls are metered.** On a free-tier key, run anything that calls the model through `lib/ai/quota.ts` (`npm run test:multimodal` does; see §14). It paces, counts and refuses to exceed `GEMINI_DAILY_BUDGET` (default 15 per model per day). A full Gemini-mode evaluation needs 40–55 requests and will not fit in one free-tier day.

### Who does what: Gemini, code, people

| Stage | Gemini | Deterministic code | People |
|---|---|---|---|
| Intake |, | Store the original, hash media, read EXIF, record times | Reporter submits |
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
- **Origin rules (enforced in code, tested):** a claim is *Reported* only when its excerpt is found in the reporter's text (or, for voice notes, in the AI transcript, labelled as such); otherwise it becomes an *AI interpretation*. Photo and inference claims are always AI. Claims citing unknown aliases or a mismatched source are dropped and counted. People counts survive only if the quoted words state them. The AI's hazard category becomes its own reviewable `hazard` claim. Every model output is validated by the same Zod schema it was generated from, with one corrective retry; failures produce a `failed` extraction record, never a silent patch.
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

No flood extents, runout estimates, or casualty or damage estimates. Runs in **10.6 ms warm, 12.4 ms p95** on the corridor graph (`npm run bench`, 30 runs, 185 settlements analysed). The earlier "~25 ms" was a hand measurement; this is a harness.

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
| 2026-10-12 | Defer all Google Cloud setup (Gemini, Firestore, Storage, Cloud Run) to one session near the end of the build; verify chunks 4–8 against the local backends and the scripted test model | Team decision, build the whole pipeline first, then set up and check the Google services in a single pass. Accepted cost: model-ID, quota, region and Nepali-extraction problems surface late, so keep the `Llm` interface and oracle/test-model modes working as the hedge |
| 2026-10-13 | Responder shell rebuilt: an **icon rail**, and one top bar carrying the region, the data label, the notification bell, settings and the reviewer's own menu. Dashboard rebuilt around four blocks (numbers → where → incidents → latest) with the "Coming in" table replaced by tiles | The five-section page read as a wall of chrome. Everything that is not a destination moved out of the page and into the shell, and the bell reads the audit trail rather than creating a second notification record. **Revised the same day:** a labelled sidebar was tried and rejected by the team in favour of the narrow rail, which keeps the map and the lists wider; every icon carries its name as a tooltip and to screen readers |
| Proposed | GCP region `asia-south1` (Mumbai) for Cloud Run, Firestore and Storage; Gemini location `global` | Closest region to Nepal; regional availability of 3.8 Flash not yet confirmed |
| 2026-10-14 | Every metered model run goes through `lib/ai/quota.ts`: calls paced 12 s apart, counted per model per Pacific day, hard-stopped at `GEMINI_DAILY_BUDGET` | The free tier's daily figure is unpublished and invisible from the client, and a full Gemini-mode evaluation needs 40–55 requests. Discovering the ceiling with a 429 halfway through produces a partial result that looks like a real one, which is worse than not running it. A fallback counts as a second request because it is one |
| 2026-10-14 | The photo and voice paths are tested by `npm run test:multimodal` against synthesised fixtures in `data/eval/media/`, not by the evaluation | `lib/eval/run.ts` sends `media: []`, so the multimodal provenance rules had never run against a real model. Fixtures are generated on this machine from a template recorded in `data/eval/media/README.md`, so nothing is licensed in and no real person's image or voice is in the repository |
| 2026-10-14 | Local development runs on a free-tier AI Studio key in `.env.local`, with the three primary model slots pinned to `gemini-3.6-flash` | `gemini-3.8-flash` is oversubscribed on that key: measured at roughly 1 success in 8 attempts, the rest 503s or hangs. The key can call it, so this is capacity, not access, and the error text calls the spike temporary. The app's existing 503/429/timeout fallback already covers it, but a demo should not pay a failed round-trip per call. Production still uses Agent Platform on the service account, per the decision above, so no key ships in the image |

---

## 14. Progress log

- **2026-10-15 (deployed):** **Chunk 9's gate is met.** The app is live at `https://aapatvani-423501028794.asia-south1.run.app` on Cloud Run in `asia-south1`, serving 100% of traffic, and every check in `docs/deploy.md` §4 passes: `/` and `/report` return 200, `/dashboard` redirects an anonymous visitor, `/api/incidents` returns 401, reviewer sign-in works, and **the road dataset loaded** — the failure that would otherwise have shown up as an empty map in production.

  Project `aapatvani-511617`, region `asia-south1`, Firestore + a private bucket (`aapatvani-511617-media`), `AUTH_MODE=passcode`, `SESSION_SECRET` and `REVIEWER_PASSCODE` in Secret Manager rather than in plain environment variables. The service account was granted `secretmanager.secretAccessor` **on the two secrets individually**, not project-wide.

  **Three things went wrong on the way, all worth recording.** First, the account situation: `gcloud` authenticates as `suruchishrestha333@gmail.com` while the Firebase project `apatvani` belongs to a *different* Google account entirely, so the Firebase project was never reachable from the CLI. **Firebase turned out not to be needed at all** — Firestore, Cloud Storage and passcode auth are plain Google Cloud, and `docs/deploy.md` had described the non-Firebase path all along. The Firebase work was not wasted (the storage bucket naming and the web config are correct for a later `AUTH_MODE=firebase`), but it delayed the deploy by a day.

  Second, `npm ci` failed in the Linux build with `EUSAGE` and five missing `@emnapi/*` entries. The cause is not this project's: **a lockfile generated on macOS omits the transitive dependencies of the optional wasm32 fallback packages**, because the macOS resolver prunes those branches entirely, and Linux `npm ci` then validates a tree it cannot satisfy. Regenerating the lockfile on macOS does not fix it — it only changes *which* entries are missing. The Dockerfile now runs `npm install`, which resolves those gaps for the platform it is actually on, with the reason written down so it does not read as a mistake. No application dependency changed.

  Third, `docs/deploy.md` §3 was missing a step: the Artifact Registry **repository** has to be created before `gcloud builds submit --tag` can push to it, unlike the old `gcr.io`. Added to the doc.

  **What is still open:** the deployed Firestore is empty. The demo scenario needs seeding against Firestore rather than the local file store, and the Gemini-mode evaluation still needs a fresh quota day. Both are content, not deployment.

- **2026-10-14 (a Firebase project exists, and EXIF no longer goes to Google):** Two things, one of them a hard blocker that is now named.

  **The Firebase project is created — `apatvani` — and it does not solve the deployment problem.** A new Firebase project starts on the Spark plan, and Spark cannot run Cloud Run, Cloud Functions, Cloud Build or Artifact Registry: Firebase's own error is *"Your project must be on the Blaze (pay-as-you-go) plan to complete this command."* The public form, the API routes and the Admin SDK all need a server, so there is no Spark-shaped version of this app short of a static export, which would break hard requirement 3. **Blaze requires a payment method, and there is no card.** So the Gemini key and the Firebase project are both in place and the deploy is still blocked on the same single thing. Recorded here because it is now the critical path and the submission is on Oct 17.

  **EXIF no longer goes to the model.** The app was scrupulous that coordinates never come *from* Gemini (§3 rule 3) and equally careful never to store a reporter's identity, and it was handing the raw bytes *to* the model with the EXIF block intact — which on a phone photograph usually carries GPS, often the reporter's home. `lib/evidence/strip-metadata.ts` removes the EXIF and XMP segments from a JPEG and the `eXIf`/text chunks from a PNG before the bytes are encoded for the model, losslessly, so the pixels the model reads are identical and the stored original is untouched. `readExif` has already captured what the contradiction rules need, so nothing downstream loses anything. Formats we do not parse pass through unmodified rather than being half-stripped. Four tests build the byte structures by hand, so they state exactly which segment must vanish rather than trusting a sample image. 220 tests pass; typecheck, lint and build clean.

  **Also verified, because "make it safe" deserves evidence:** no secret appears in any tracked file; `.gitignore` covers `.env*`, `*.pem`, `service-account*.json` and `.data/`; `firestore.rules` and `storage.rules` both deny all client access; and `session.ts` refuses to start in production without a 32-character `SESSION_SECRET` and will not fall back to the demo passcode. The old AI Studio key was rotated after appearing in a transcript.

- **2026-10-14 (the map was painting over every menu in the app):** The profile menu looked like a styling problem — a name cut to "the revie", "Your activity" missing its second word. It was not styling. **The Leaflet map was rendering on top of the menu**, and the giveaway was that both labels were cut at *exactly* the same x, which is where the first map tile begins. Leaflet's panes run to `z-index: 700` and its zoom control to 800, all inside the page's stacking context; every overlay in this app — dropdowns, popovers, dialogs, sheets, tooltips, selects — used Tailwind's `z-50`. So the map won every time, and the menu's right half simply vanished behind the tiles.

  It was caught on the profile menu only because that menu opens near the bottom of the rail, over the dashboard map. **Every overlay in the app had the same defect**, waiting for a map to open underneath it — the notification bell, the filter popovers, the settings gear.

  Fixed with one utility, `z-overlay` (1100), used by all thirteen overlay call sites, sitting above Leaflet's 800. **A second thing worth recording: `@utility` did not take effect until the dev server was restarted.** The class was applied in the DOM and computed to `z-index: auto` — present in the markup, absent from the stylesheet. The fix looked like it had failed when it had not, and the diagnostics that settled it were reading the computed style and then grepping the served CSS for `z-index: 1100`, rather than looking at the screen and guessing again.

  **The pattern in all three of this session's UI defects is the same and worth saying out loud:** the information was present, the code was correct, and the *rendering stack* decided the outcome — a flex item's `min-width: auto`, a fieldset that will not shrink, and now a third-party library's z-index. None were caught by 217 tests, and none would have been. They are visible in about two seconds to anyone who opens the page and looks.

- **2026-10-14 (two defects found by looking at the screen, both in the "we already had the information" family):** Neither was caught by 209 tests, and neither was a missing feature. Both were cases where the system knew something and did not say it.

  **The report form's two columns overlapped.** A reporter attached a photo whose camera filename was long and the photo card grew straight through the voice recorder beside it. The cause is the same one §14 recorded for the record cards, in a different costume: a flex item defaults to `min-width: auto`, so the *filename* set the column's minimum width, and `<fieldset>` will not shrink below its content either. `truncate` was already on the filename and did nothing, because no ancestor was allowed to shrink. The `<audio>` element has the same shape of problem — roughly 300 px of intrinsic width — and would have done the same thing to the other column the moment a recording existed. Fixed with `min-w-0` down both chains, with a comment saying why, because deleting it later would look like tidying. Verified by attaching a deliberately long-named file through CDP and screenshotting the result.

  **An incident whose place came from a typed name said it had no location.** A report located by `place_name` for "devighat bidhhur" produced an incident titled *"Flood near devighat bidhhur"* whose Where strip read **"No location established"** — the page contradicting its own heading, two lines apart. The gazetteer covers the Araniko corridor and does not contain Devighat, so `reportPoint()` correctly returned null, and every screen then collapsed *two different situations* into one sentence: "we have a name we cannot place" and "the reporter told us nothing" are not the same fact, and only one of them is the reporter's fault.

  `lib/location-view.ts` now keeps four states apart — **mapped** (a measured GPS or pin position), **approximate** (matched to a known place by name, with the gazetteer's own uncertainty), **named** (the reporter named it, our map data does not have it, so it cannot be drawn and was never distance-compared), and **not given** — and every screen words them the same way. The `named` note says the last part out loud, because "this report was never compared with others by distance" is the fact a reviewer acts on. The incident page and the overview card both use it; 8 new tests pin the states, including that an *ambiguous* gazetteer match is treated as named rather than picked. 217 tests pass, typecheck, lint and build clean.

- **2026-10-14 (media the evaluation never sent, and a quota that had to be fenced):** Three things, and the first is a bug that had been sitting in the voice path since chunk 3.

  **The evaluation has never sent media.** `lib/eval/run.ts` calls `runExtraction` with `media: []` — a literal empty array — so the photo path, the voice path, the `M1`/`A1` alias registry, the transcript check and the `basis: "photo"` / `"voice_note"` provenance rules had never run against a real model, in any mode. `npm run test:multimodal` now sends fixtures through the same `runExtraction` the app uses, over three cases: text with a photo, a voice note with no text at all, and everything the form can send at once. Both fixtures are synthesised here and labelled so (`data/eval/media/README.md` records the exact commands), so there is no licence question and no real person's photograph or voice in the repository. **All three passed.** The photo claim came back `origin=ai, basis=photo` as the rules require, and it read the illustration correctly — down to "a red car nearby", which is genuinely in the drawing. Place and time mentions resolved, excerpts verified against both the text and the transcript, and the model's own hazard category stayed a separate `origin=ai` claim.

  **The voice transcript has errors worth knowing about.** It heard "हेर्दा" for "हिजो" (yesterday) and "अरनीको" for "अरनिको". The claims built on it are internally consistent, so the excerpt check passes against a transcript that is itself slightly wrong. That is the honest limit of verifying citations against a model's own transcription, and it belongs in the deck's limitations rather than being discovered by a judge.

  **A real bug, found because a voice-only report was in the set.** `runExtraction` embedded `translationEn ?? report.text`. A report that arrives as speech and nothing else has no text to translate, so `translationEn` is empty and the fallback is empty too: **no embedding at all**, and that report could only ever be matched on distance and time (§8.2). The transcript was sitting right there, unused. Fixed, with a regression test. 208 tests had passed over it, because nothing had ever put a voice-only report through extraction while asserting on the embedding.

  **Quota had to be fenced before the evaluation could be trusted.** A full Gemini-mode evaluation needs roughly **40–55 requests** (15 reports × extraction + embedding, plus a model call per candidate pair), and the free tier allows only a handful per model per day. `lib/ai/quota.ts` wraps the model client and does three things: spaces calls 12 s apart, because a burst is what trips the per-minute limit; counts every call per model per Pacific day in `.data/quota-ledger.json`; and refuses the call that would exceed `GEMINI_DAILY_BUDGET` rather than discovering the ceiling through a 429 mid-run. A fallback is counted as a second request, because it is one.

  **What the guard revealed immediately: nothing is running on the model we chose.** Every extraction in the multimodal run was answered by `gemini-3.5-flash-lite` — the ledger showed the primary reserved and then the fallback reserved, three times over. `gemini-3.6-flash` and `gemini-3.8-flash` both hang or return 503, and probing showed the identical request returning 404 and then 200 thirty seconds later. Some of it is transient edge noise, and 404 sits in `RETRYABLE_STATUS`, which is precisely what pushes a call onto the fallback. Practically: the app runs on flash-lite today, and the results above are what flash-lite produces. **The Gemini-mode evaluation was deliberately not run** — at 13 of 15 requests already spent on flash-lite it would have blown the budget partway through and produced a partial result, which is the exact thing the guard exists to prevent. Oracle mode ran clean: 100% grouping, copies, contradictions, abstentions and impact.

- **2026-10-14 (the Gemini key works, and one model does not):** A free-tier AI Studio key was configured and then checked against the live API rather than assumed to work. `npm run check:models` passes end to end: the key authenticates, lists 63 models including all four this project names, returns Zod-validated structured output, and embeds Nepali text at 768 dimensions. That closes the live-smoke-test clause chunk 3 has carried since 2026-10-11.

  **`gemini-3.8-flash` is the exception, and it is worth being precise about why.** Over about eight measured attempts it answered roughly once; the rest were `503 UNAVAILABLE` ("high demand… spikes in demand are usually temporary") or hung past 45 seconds. The key *can* call it — a 200 was observed — so this is capacity, not permissions. Separately, burst-testing tripped the free tier's rate limit: back-to-back requests fail, spaced-out ones succeed, which is why the first measurements looked worse than the model does. `gemini-3.6-flash` and `gemini-3.5-flash-lite` answered reliably throughout, and 3.6 is a full Flash rather than flash-lite, so extraction quality on Nepali should hold. `.env.local` pins extraction, reasoning and drafting to `gemini-3.6-flash`; the app's own fallback (`src/lib/ai/gemini.ts`, which retries on 503/429/500/504 *and* on timeouts) covers the case where it degrades too. Re-test 3.8 Flash before Oct 17 and drop the overrides if it recovers.

  **What this unblocks, and what it does not.** It unblocks the live model check, the Gemini-mode evaluation, the model-written alert drafts and impact explanations, and recording the demo video that hard requirement 5 asks for. It does **not** unblock the deploy: Cloud Run, Firestore, Cloud Storage and Firebase Auth all need a GCP project with billing, and an AI Studio key is not one. §16's Cloud Run URL and `min-instances` items stay open, and a GCP project is now the single remaining long-lead item.

  **One thing to watch.** The free tier has a daily request cap, and `npm run eval` in Gemini mode runs the real extraction over five scenarios plus embeddings. Nobody has run it yet on a metered key; do that before the demo video, not during it.

- **2026-10-13 (homepage order, a bigger headline, and finding the deck):** The hazard panel moved to the **bottom of the left column**, after the button and after the two reassurances — a person deciding whether to trust this reads "we do not predict" and "no name needed" before they read a list of hazards, and "what you can report" is the last thing before the steps. The headline is larger (`clamp(1.7rem, 4.1vh, 3.25rem)`) and the page still fits one screen at 1920×1080, 1440×900, 1366×700 and 1280×660. **One self-inflicted scare worth recording:** the first attempt at moving that block inserted it *after* the left column's closing `</div>`, which put it in the right column beside the headline and pushed the page 100px over. The fit check caught it in the same minute, which is the whole reason that check exists.

  **"I did not see the swipe-card style"** had a real cause, and it was not the browser. The Impact findings were **all decided already**, from my own testing, and **review decisions carry across versions** — re-running the analysis deliberately does not lose a reviewer's work, so every version of that incident came back with nothing left to decide and the deck rendered its "every finding has been reviewed" state instead. The demo store was reset and re-seeded and one analysis run on the landslide, so the deck is now the first thing that tab shows: **1 of 12**.

  208 tests pass, typecheck, lint and build clean; verified on a production build.
- **2026-10-13 (overview, a deck, and the hazard panel):** Three things, all of them about reading rather than deciding.

  **The incident page opens on an Overview.** Four facts in a strip are not an overview, so the first tab is now a real one, built entirely from records that already exist and read in the order a responder reads them: **What is reported** (the status and what it means, the hazard and where it came from, the location, the first and latest report), **Why we think so** (the independent-source count, every report labelled *a witness* or *a copy*, and what the claims say about the road), **What disagrees** (open contradictions, and how many claims nobody has read), **What the roads say** (the analysis in a responder's words, with three counts), and **What needs a person** — the part every other screen leaves you to assemble, as a list of jumps in the order it should be done.

  **Findings are a deck.** A dozen of them in a column, each with the same two buttons, hides how much is left and makes the last one look like the first. Now: one finding in front of you, a bar with one segment per finding still waiting, *1 of 12*, the two decisions, and backwards/forwards. Deciding advances by itself — a reviewer who has read a finding and pressed Confirm has told us everything we need about it, and a second press for the same thought is a tax. The cards stacked behind are the finding after this one and the one after that, so the depth on screen is the work remaining. The dumbbell chart moved out of the per-group lists and above the deck, where it now summarises every access finding rather than only the undecided ones.

  **The homepage's hazard list is a panel.** A soft surface with four hazards carrying a line each — *"A hillside has given way and the road is covered"* — because the name alone asks a frightened person to already know the right word, and the rest listed by name underneath, since the form offers every one of them and leaving them out would say they are not reportable. Four blurbs written in both languages; a region whose hazards are not in that map shows the name alone rather than a missing key. The page still fits one screen at 1920×1080, 1440×900, 1366×700 and 1280×660.

  208 tests pass, typecheck, lint and build clean; verified on a production build.
- **2026-10-13 (the record cards were never the same width):** Reported as "some are big, some are small", and the first fix missed it because it measured the wrong thing: **heights were already uniform to the pixel**, and I checked heights, found them equal, and moved on. The widths were not. Each cell was a `flex` box, so the card inside it was a flex item and sized itself **to its own text** — one-line entries drew a narrow card, two-line entries a wide one, inside columns that were all `456px`. Measured across six consecutive cards: 360, 317, 303, 456, 456, 456. A plain block cell fixes it, and all forty-one cards are now **456 × 182, one width and one height**. The lesson is in which measurement I trusted: "are they the same height" was the easy question and the wrong one.

  The link chips are visible now. **The report** is a solid coral chip and **The incident** a solid olive one, both with white text and an icon, and the technical action code (`impact.confirmed`) sits on a white chip instead of 8%-ink, which was closer to a smudge than a label. They were always links; they just did not look like anything, which is why "how do I get to the report from here" was a fair question to ask.

  208 tests pass, typecheck, lint and build clean; verified on a production build.
- **2026-10-13 (a shorter incident page, a chart for the blast radius, and two real bugs):** Four things, and the last two are the ones that matter.

  **The incident workspace is four panels behind a switch and a strip of facts.** It ran to **6,069 px**: membership, fourteen suggested matches, three contradictions, a road analysis and an alert draft, one under the other, with the road analysis two thousand pixels down. It is now **1,070 px** — a facts strip answering what/why/where (**Where · Why we think so · Road analysis · Alert**), then **Evidence · Grouping · Impact · Alert draft**. Nothing was removed; every action is still on the page, in the panel it belongs to. The switch carries each part's state, so a reviewer can see the road analysis has been run, or has not, without opening it, and the open panel lives in the URL like every other view in this app.

  **The blast radius has a chart.** Alongside the map, a **rose**: the incident at the middle, distance rings, and every place the analysis flagged plotted at its true bearing and true distance — how far out this reaches and in which directions, which a road map makes you trace with a finger. Severity is **one hue in three shades**, because the findings are ordered (loses its route > route grows > affected another way) and an ordered scale is a sequential ramp, not a categorical one; shape carries the other axis so nothing rests on shade alone. The radial spacing is the **square root of distance**, so a single place 20 km out does not crush the eleven within three into a knot at the middle — and the rings are labelled with their real distances, so the compression is declared rather than hidden.

  **Two real bugs, both found by looking rather than by testing.** (1) A **hydration mismatch** on the incident page: `relativeTime` reads the clock, and it was being called inside a Client Component, so the server said "2 h ago" and the browser said it a few milliseconds later — React threw the tree away and rebuilt it on every load. The render time is now passed down from the page. (2) The rose then mismatched again on **floating-point drift**: `Math.sin` of the same bearing came out as `131.82159610371366` on the server and `…363` in the browser. Coordinates are rounded to two decimals, which a 320-unit drawing does not miss. Both were invisible in tests and in the server log; they showed as a "1 Issue" badge in the corner of the page. **All eight pages now render with an empty console.**

  **The landing page fits one screen.** Type, gaps and padding are tied to the viewport height, so a short laptop window gets the same page, smaller, rather than the same page with its last third cut off. Verified at 1920×1080, 1440×900, 1366×700 and 1280×660: **no scrolling at any of them**, and below 600 px of viewport height the step cards drop their explanations rather than the page dropping its content. Phones and small tablets still scroll, which is correct for them.

  208 tests pass, typecheck, lint and build clean.
- **2026-10-13 (uniform record cards, and finding the blast radius):** The activity cards are one size. Rows stretch to a common height and the body is clipped to two lines, measured on a production build as **a single distinct card height across all 24 entries**; a record is read by scanning across, and cards that stop wherever their sentence stops turn every row into an edge the eye has to find again. What an entry is about is now a chip rather than an underlined word: **The report** in the reported colour, **The incident** in the computed one, both on white so they stay legible on any of the four tinted surfaces including their own. The hues are not new — they are the meanings those two records already carry — and each chip has an icon as well as a word. The right column keeps what the record is made of and drops the rest.

  **"How do I see the blast radius?" was asked twice, which is the answer.** It is on an incident's detail page, and it is the panel called **Impact analysis**, and it does nothing until somebody presses **Run the analysis**. Two changes follow from being asked twice. The board card now always says which state that analysis is in — **Blast radius run** or **Blast radius not run** — because a chip that only appears once you have run it is a chip that never tells you it is there. And the jump chip at the top of an incident now carries the same state: **Impact analysis · not run yet**, or **· run · v1**.

  208 tests pass, typecheck, lint and build clean.
- **2026-10-13 (charts, and the palette that had to change for them):** Two visualisations, both built by the book rather than by taste, and one finding that matters beyond this commit.

  **The trust palette cannot be a chart palette, and that is measurable.** The four tints are *surfaces*: pale, low-chroma, and moss and leaf are the same hue at two lightnesses, which is fine behind a badge and unusable as two slices. Run through a palette validator they fail three checks: two of them read as gray, and moss against leaf lands at ΔE 14 for normal vision, so even a reader with full colour vision cannot tell those apart. `--chart-1…4` are now the four families **stepped for marks** instead — `#d9612f`, `#6a5cb8`, `#8aa03c`, `#527013` — which pass the lightness band, the chroma floor, colour-vision separation and contrast. Fixed order, never cycled: reported, AI, computed, reviewer. The reviewer slot is the deep green the trust table already assigns to a person, so the chart and the UI agree.

  **The activity trail is now a record rather than a log.** Grouped by day with a count, each entry on a surface tinted by whoever produced it, two to a row, with the actor's badge on every card so identity is never the colour alone. Down the side: **what the record is made of** as a hero total over one stacked bar with the counts and shares under it, **decisions in their own words** (honestly empty here, and it says why: nobody has decided anything, which is why nothing on this deployment says Confirmed), and **how to read this page**. Sign-ins are excluded from the decisions card — a person signing in is not a person deciding — but they stay in the trail, because an audit trail that hides them is not an audit trail.

  **The blast radius is drawn, per category.** Each affected category now leads with the shape of its finding before the sentences about it, as a **dumbbell**: one row per place, the road to care as it was in a pale dot and as it would be in a solid one, the length of the line between them being the harm. Where nothing is left, the line breaks into a dashed stub ending in a marked ✕, and the row says "no mapped route" in words rather than leaving anyone to infer it from a position on a scale. One hue in two shades, as that form calls for; the numbers are printed at the end of every row so nothing depends on reading a position.

  **Verified rather than assumed:** the demo scenario only ever produces lost access, so the two-dot branch was rendered against a temporary fixture (longer route, unchanged, and no-route-before) and the fixture deleted before this commit. The demo store was also reset and re-seeded, because a day of screenshot sign-ins had filled the trail with fourteen copies of the same `session.started` event — the fix for that is the reset script, not a filter, since the trail is append-only and nothing may be deleted from it.

  208 tests pass, typecheck, lint and build clean; the activity page, the timeline and the incident board re-checked on a production build.
- **2026-10-13 (incident board, and two fixes it turned up):** The incident list is now a **board**: one panel per hazard, tinted, with the incidents inside as cards. The tint is not decoration — a panel takes the colour of the most attention-needing incident in it, using the same four colours as the status pills inside, so the loudest panel on the page is the one that most needs a person, and the header says which in words. Panels are ordered unresolved-first and then by how much evidence each group rests on. Two ways to read it, **Board** and **List**, plus a **Filters** popover (status and last-reported window) with the count of what is shown; all of it in the URL like every other filter here, so a view can be handed over in a message.

  **A question worth answering honestly: "I did not see the blast radius feature anywhere."** It is there, and it works: it is the **Impact analysis** panel on an incident's detail page (chunk 7), and running it on the demo incident produced one 55 m segment of Arniko Highway treated as possibly blocked, four settlements losing every mapped route to care, and one facility whose catchment changes. What it was, was buried — 2,000 px down a page that runs to 5,800 px, past membership, suggestions and contradictions. Two things came out of that: a card now says **"Blast radius run"** when an assessment exists and **"Alert drafted"** when one does, so progress is visible from the board rather than only from the bottom of a workspace; and the workspace gained three jumps at the top (**Membership · Impact analysis · Alert draft**), which are jumps rather than tabs because an incident is one thing and its membership, its road analysis and its alert are not three screens.

  **Timeline gaps, both real.** A stretch where nothing was reported by the community reserved the full 118 px lane above the line and drew an empty dashed thread through it, so a group with no reports in it read as a wall of nothing; the lane now collapses to the height of its time labels when no marker in that stretch has anything above it. And the gap between the line and the first card below it was the sum of two paddings that were each reasonable alone; it is tighter now.

  Checks: 208 tests pass, typecheck, lint and build clean.
- **2026-10-13 (the timeline):** New screen at `/timeline`, drawn as a **horizontal axis** rather than a list. Every other page in the app answers a question about one thing; this one answers "how do we know any of this, and in what order did we come to know it?" It adds no facts: `lib/timeline/service.ts` reads the same reports, extractions, claims, incidents, impact assessments and alert drafts the other pages read and lays them out in time. **The split is the design: above the line, what a community reported; below it, what the system and reviewers did about it.** A reader can then see at a glance where the human voices are and where the machine took over, which is the difference this product is selling. Reports are coral pills carrying their reference code, on a dashed thread that starts at a coral dot and meets the line at a node; the work done about each one hangs below, each card led by its producer's badge. Six kinds of entry (report received · read by the model · a claim decided by a person · incident opened or verified · blast radius run · alert drafted or approved). A card at the foot spells out what each of the four producers means and how many entries in the current view each accounts for.

  **One honesty rule shapes all of it: the axis is when a piece of evidence entered the record, never when the event happened.** That is the only thing the system actually knows, so the reporter's own words about when it happened sit beside the entry, attributed, rather than being turned into a timestamp the app made up. The line carries no scale and no ticks for the same reason: the spacing says order and rough distance, and a measured axis would invite reading precision the data does not have.

  **Placement** (`lib/timeline/layout.ts`, pure and tested) gives each moment its share of the span with a floor underneath it, so two events a minute apart never draw on top of one another, and it buckets to the minute so that a report and the model that read it four hundred milliseconds later are one marker rather than two. **Grouping** (`lib/timeline/group.ts`) cuts the same events by day, week or month in the region's own time zone, and weeks start on Monday. Hazard chips carry their counts, so choosing one is not a guess about what is behind it.

  **A real bug, found by looking at the screen and then pinned by a test.** The first version placed every marker of the second group thousands of pixels off to the right, and the group rendered as an empty line. The cause: marker positions were computed from real ISO timestamps, but the bucket key is the same instant cut to the minute, and `"2026-07-14T07:15"` has no time zone in it, so feeding that key to `Date.parse` reads it as the *machine's* local time, a different instant from the same clock reading in Kathmandu. Two clocks, one subtraction. Fixed by keeping the key and the timestamp apart. The first tests written for it **passed on the broken code**, because they asserted order rather than position and order survives a constant offset; the suite now pins the time zone and asserts exact pixel positions across a span long enough that the floor never binds, and it was checked against the broken version in UTC, Auckland and Los Angeles before being trusted. 208 tests pass (21 new), typecheck, lint and build clean.

- **2026-10-13 (dashboard and shell redesign):** The dashboard was overwhelming and the shell was an icon rail, so both were rebuilt. **The shell** is now a labelled sidebar in the deep ink with the reviewer's own card at its foot, and a single top bar holding what is not a destination: which area this deployment covers and that the data is synthetic, the **notification bell**, settings, and the reviewer menu (settings, your activity, sign out). The bell is a *view* of the audit trail, not a second record of it: `lib/notifications.ts` reads the same append-only events the Activity page renders, latest first, and the unread count is a cookie holding the moment the bell was last opened, a reading position rather than data. Opening it marks it read through `POST /api/notifications/seen`. **The dashboard** went from five stacked sections to four blocks in the order a shift actually runs: four stat cards (white, with the colour in the icon's tile rather than washing the whole card, so four of them read as a set), then the map and the incident list side by side, then the latest reports as tiles instead of the five-column table that was the densest thing on the page. The filters became three controls, the four status buttons folded into one popover that says how many are on. Everything verified by driving headless Chrome over CDP against a production build: the map draws 9/9 tiles and 2 markers, the bell popover lists the events, the profile menu opens, the phone layout puts the numbers two-up, and the log and console are both empty. **Also added:** a real **Settings page** (`/settings`) with two preferences that are actually wired (the overview's default time window, and where the review queue opens — both cookies, read by the pages themselves through `lib/pref-choices.ts`), the deployment's own facts (area covered, map snapshot, store, media, sign-in mode), and the map dataset's statistics and **known limitations** stated plainly; plus `/settings` added to the proxy's cookie gate. Sign-out moved into a shared `useSignOut` hook; `sign-out-button.tsx` is gone. 187 tests pass (six new ones cover the preference reader and the time-zone greeting), typecheck, lint and build clean. Two notes on the verification itself, because most of the time here went on them. **Stray headless Chrome processes must be killed between runs**: a leftover instance keeps its debugging port and its page, the next run can attach to the wrong target, and the symptom is a blank screenshot that looks like a broken page. And a **long-running `next dev` began reloading its pages in a loop** under the browser (measured at ~4 document loads a second on `/`, `/dashboard` and `/activity` alike, including pages this work never touched); a **freshly started dev server loads each page exactly once**, verified on `/` and on `/dashboard`, so it was the session and not the code. Every claim above was checked against both: the screenshots come from `npm run build` output, and the pages were then re-checked in a clean `next dev`.
- **2026-10-11:** Created the repo, `.gitignore`, this tracker and `docs/product-vision.md`. Verified package versions, Gemini model IDs, SDK options and the hackathon rules (see Appendix).
- **2026-10-11 (chunks 1–2):** Scaffolded Next.js 16.4 with shadcn/ui and the warm theme. Pulled the Nepal-bounded OSM extract (snapshot 2026-10-11T11:22:51Z) and built the corridor dataset: 11,340 nodes, 11,613 edges, 2,525 km of road, 36 health facilities (4 hospitals), 408 schools, 187 settlements, 622 bilingual gazetteer entries. Wrote the domain schemas, swappable data/media/auth backends, evidence checks, gazetteer and the Blast Radius engine. Typecheck, lint, 57 unit tests and the production build pass. First commit.
- **2026-10-12 (design pass):** Reworked the interface to the direction the team chose. New palette from their two references, deep green `#415111` ink, near-white cards on a warm `#f8f5f0` page, pastels carrying meaning, with the tokens *renamed* to match what they now mean (`rose`→`coral` reported, `sky`→`violet` AI, `sage`→`leaf` confirmed, `river`→`moss` computed, `butter`→`amber` needs-review, `clay`→`flame` critical), because the old names described the old colours and would have gone on lying. The trust model keeps its semantics and the icon-plus-label rule; computed (moss) and confirmed (leaf) are the closest pair in this palette, which is what the never-colour-alone rule is for. **Dashboard** rebuilt to the reference: a narrow icon-only rail with a leaf-tinted mark and a white active square, a large quiet title, four pastel stat tiles, the map and incident list side by side, and arrivals as a real table with column headers. **Homepage** rebuilt: the app's own column on the left (headline, one pill button with a circular arrow, hazards as small icon chips, then what we will not do), staggered step cards on the right ending on a dark card carrying the provenance promise, and a footer with the responder link, attribution and the synthetic-data label. Incidents list aligned into columns; the reports list re-themed. **Language is now one at a time**, the bilingual subtexts are gone from the hazard chips and the report form's hazard picker, the brand shows only the reader's script, and the reviewer shell carries no Nepali at all. Also removed a `new Date()` from the footer, the same prerender-error class as the session-clock bug. Every step verified by screenshot through headless Chrome; the server log and browser console are both empty. 181 tests pass.
- **2026-10-12 (fixes after running the app, continued):** The first map fix did not work, and the errors the team saw in the browser overlay showed why. react-leaflet's `MapContainer` cleans up with `context?.map.remove()`, but `context` is set by a state update that has not committed when the first effect runs, so under React's development double-mount the cleanup runs with `context` still null, does nothing, and leaves Leaflet's `_leaflet_id` on the container. The remount then throws "Map container is being reused by another instance". No guard around the component could fix that, because the double-claim happens inside the library. Replaced with our own `LeafletMap` (`components/av/leaflet-map.tsx`), where the map reference is a closure variable the cleanup always sees, so `map.remove()` always runs. **Verified by driving headless Chrome over CDP**: the dashboard map renders with 9/9 tiles loaded, 3 features drawn and no page errors, and a screenshot confirms it visually. Also fixed the language complaint properly: the hazard chips led with Devanagari even in English (`पहिरो Landslide`), and the brand always showed both scripts. The reader's language now leads and the other script follows smaller; on reviewer screens, which are English, the Nepali name is gone. A screenshot of the English landing page confirms it. **A tool worth keeping:** headless Chrome via CDP over Node's built-in WebSocket can sign in with a cookie, screenshot a page and run assertions in it, that is how these two were verified, and it is the only way any of this was ever seen rather than assumed.
- **2026-10-12 (fixes after running the app):** Opening the app in a browser surfaced two real defects that no test had caught. (1) Every reviewer page logged "Next.js encountered the unstable value `Date.now()` while prerendering" and then threw `ERR_STREAM_DESTROYED`: session validation compares the token's expiry against the clock, and Next was attempting to prerender pages containing it. Fixed by declaring the read request-time in `getReviewer` with `await connection()`, the fix Next's own error message names. Verified: `/dashboard`, `/incidents`, `/activity` and `/reports` now load with nothing in the log. (2) The maps failed in the browser with "Map container is being reused by another instance" and "appendChild of undefined": Leaflet claims a DOM node for the life of a map and refuses to let a second one claim the same node, which is what happens when a map renders during hydration or React's development double-mount. Fixed with a `ClientOnlyMap` guard so the map is created once, on the client, into an untouched node, applied to all three maps. The first attempt at that guard used a state update inside an effect and was rejected by the React Compiler lint rule; it now uses `useSyncExternalStore`, which is the honest description of the question being asked. The server half is verified; the browser half needs a reload to confirm. **Worth recording:** both of these were found by running the app, not by the 181 tests, which is the case for opening every screen by hand before the demo.
- **2026-10-12 (chunk 9):** Finished the build. Added a three-stage `Dockerfile` (Node 24 LTS, `npm ci` from the lockfile, standalone output, unprivileged user, `dumb-init` so Cloud Run's SIGTERM reaches the app), a `.dockerignore` that keeps secrets and development data out while deliberately keeping `data/regions` and `data/eval` in, `docs/deploy.md` covering the whole path from enabling APIs to the judging-window `min-instances` and its budget alert, and a `README.md` carrying setup, architecture, the Gemini-versus-code split, limitations, data sources and licences, and the evaluation approach. Fixed the long-standing build warning properly: `data/regions` and `data/eval` are read with paths the bundler cannot follow, so they are now named in `outputFileTracingIncludes` and everything else excluded, without that they would simply be missing in the container. **Verified the standalone build by running it**: `node .next/standalone/server.js` serves the public form, refuses anonymous API calls with 401, and, the check that mattered, loads the road dataset from the traced output and runs a real Blast Radius ("Araniko Highway corridor, Sindhupalchok"). That failure would have appeared only in production, as an empty map. **Not verified:** the image itself has never been built (Docker is not installed; Cloud Build does it), and the deploy has not run, because both need credentials. I checked every path the Dockerfile copies exists in the build output, which is as far as this can go from here. 181 tests pass; typecheck, lint and build clean.
- **2026-10-12 (chunk 8):** Built the evaluation. Five labelled scenarios over the real corridor, the demo landslide with a forwarded copy, two different hazards close together, a pure copy pair, an event whose casualty counts disagree, and a report that cannot be placed, each carrying an answer key: what should be grouped, what must not be, which pairs are copies, which contradictions should be flagged, and what the road analysis should find. `npm run eval` runs them in two modes. **Oracle mode** feeds the answer key in as if extraction had produced it, so the deterministic half of the pipeline is measured exactly with no model involved; it runs today. **Gemini mode** runs the real extraction and is the only mode that can say anything about reading reports; it needs credentials. Results are saved with the mode, model and date, and `/evaluation` shows them with the caveat that this is a small hand-written set, not a benchmark. Current oracle numbers: grouping precision 100%, recall 100%, 0 false merges, copy precision and recall 100%, contradiction recall 2/2, correct abstentions 2/2, impact scenarios 1/1. **I checked the harness can fail** before trusting it: removing one copy expectation from the answer key moved copy precision to 50% and flagged a false positive, so the numbers are responsive rather than decorative. The seed script now draws on the same scenario file, so the demo and the measured results cannot drift apart, and it seeds the unplaceable sixth report too, which exercises abstention in the UI. 181 tests pass, including nine that check the answer key itself, that every quoted excerpt really appears in its report, that no pair is expected both grouped and apart, and that every behaviour the results page claims to measure has a scenario behind it. **Not done:** the "demo images with attribution" clause, the mechanism exists, but the choice of image is open question 3 and is yours.
- **2026-10-12 (chunk 7):** Built the impact and alert UI on the incident page. The Blast Radius panel runs the analysis, shows the assumed blocked segment and the findings grouped by what they claim, with each finding's own caveats beside it rather than in a footnote, and confirm/dismiss per finding. The impact map draws the blocked segment, the affected settlements, the facilities whose catchment changed and the nearby-but-not-assumed-affected assets, each with its own shape and a legend that names it. Version history lists every run. The alert panel drafts from confirmed facts, shows every sentence with chips naming the claims, findings and contradictions it rests on, attached by the app, not the model, and records an approval by name while stating that nothing is sent. Verified live on the seeded scenario: the analysis treats one 55 m segment of Arniko Highway (NH34) as blocked, 4 settlements lose every mapped route to care, 1 facility catchment changes, and 4 settlements already disconnected in the extract are reported as data gaps rather than as impact. Candidate confirm and alert approval both work end to end, and the approval writes "Nothing was sent" to the audit trail. The alert panel's rendering was checked against a temporary fixture and then removed, because drafting needs Gemini; the seed stays clean rather than shipping a draft that no model wrote. **What still needs credentials:** extraction, the model comparison, and drafting. Everything deterministic around them runs live. 172 tests pass; typecheck, lint and build clean.
- **2026-10-12 (chunk 6):** Built the responder side. Reviewer sign-in (passcode now, Firebase Auth when a project exists), an app shell that is a sidebar on a laptop and a strip on a phone, and four screens: the dashboard (counts, map with a legend, incident list, incoming timeline, URL-backed filters), the review queue, the report workspace (the original beside what was read from it, with hover-to-highlight excerpts and confirm/correct/needs-information/reject per claim), the incident workspace (membership, scored match suggestions with their feature breakdown, contradictions) and the append-only activity trail with people, AI and system kept visually apart. Reviewer pages read the store directly rather than through the API, since they are server components; the API routes stay for what only a client can do. Also added `scripts/seed-demo.ts` (`npm run seed`), a first version of chunk 8's seed: without Gemini, extraction produces no claims, so the reviewer screens would have had nothing to check against. Seeding immediately found a real bug: copy detection compared the *English translation*, so a forwarded Nepali report looked different from its original whenever only one of the two had been through extraction, the demo's copy was counted as an independent source. It now compares the reporter's verbatim words, which is what §8.2 describes, with a regression test. Verified end to end on the seeded scenario: 4 reports grouped with the copy excluded (3 independent sources), 3 rule-found contradictions, 6 scored suggestions, excerpts highlighting in the original, and a live suggestion acceptance confirming both memberships. 172 tests pass; typecheck, lint and build clean. **Known refinement:** one disagreement between four reports produces three pair-wise contradiction flags rather than one, which overstates the count on the dashboard; the flags are individually correct and resolvable, but the count should be grouped by the conflicting claims.
- **2026-10-12 (chunk 5):** Built the public side. A landing page that explains the tool in the reporter's own language (Nepali by default) and states plainly what the system does and does not do; the mobile report form with text, a hazard picker carrying the region's own local names, location by GPS or dropped pin or place name, a time hint, photo capture and a voice recorder; and a receipt showing the reference code and "what we understood". `lib/i18n.ts` holds the public strings in both languages, with a test asserting the two dictionaries define the same keys and the same `{placeholders}`, the failure it guards against is silent, since a missing Nepali string falls back to English on the one screen where the reader may not read English. The receipt is served by `GET /api/reports/[id]/receipt`, gated on the submit token the sending browser holds (in a header, not a URL, so it stays out of access logs); it is the reporter's own view rather than the reviewer's view with fields hidden, and a test asserts no incident grouping, reviewer note or token hash can appear in it. Three decisions worth recording: extraction is triggered from the receipt page rather than during submission, so a slow model call never stands between a reporter and confirmation that their report was saved; picking a location mode and then leaving it empty sends no location rather than a source claiming one (a bug found by testing, which had rejected the whole submission); and large photos are shrunk on the device with the change disclosed to the reporter. 169 tests pass; typecheck, lint and build clean. **Not yet done:** the form has been verified against the running app and its API, but not yet with a real phone camera, microphone or GPS, the "done when" clause is "submitting on a phone works", and that needs a device.
- **2026-10-12 (chunk 4):** Built matching and incidents, and the whole backend API. `lib/matching/` (candidate filter, lexical + embedding similarity, copy detection, feature scoring with a visible breakdown, rule contradictions), `lib/incidents/` (candidate incidents, membership, independent-source counting), `lib/review/` (claim, suggestion, contradiction and membership decisions), `lib/impact/` (versioned Blast Radius runs, candidate confirm/dismiss, guarded AI explanation), `lib/alerts/` (cited drafts, approval), `lib/reports/` (intake with EXIF and hashing, extraction runs), plus an append-only audit trail and 18 API routes covering reports, extraction, matching, review, impact, alerts, media and sign-in. Two design points worth recording: coordinates are taken only from GPS, a pin or a gazetteer match, so a report with no usable location is deliberately never compared rather than guessed at (§3 rule 3); and copies skip the Gemini comparison, because the copy link is already the finding. 156 tests pass, including the §12 demo scenario end to end on the local store and every route exercised through its handler. Two fixes came out of testing: accepting a suggestion now confirms both memberships (it previously left them "suggested" when the system had already grouped the pair), and `handle()` no longer swallows Next.js prerender signals. Known and deferred: the Turbopack build warns that `lib/geo/dataset.ts` reads the dataset with a dynamic path, which traces the whole project into the standalone output, a Docker image-size item for chunk 9, not a correctness problem.
- **2026-10-12 (status check):** Re-ran the full check set on a clean tree, typecheck, lint, 91 tests and the production build all pass. Chunk 3's code is complete and committed. The only unmet clause is its live smoke test: there is still no `.env.local`, so `npm run check:models` has never run against a real key or GCP project. Chunk 4 can start without credentials (the scripted test model covers it), so this is not blocking the build, but it is now the long-lead item on the critical path for the demo. The AI layer is library code only so far; nothing calls it from an API route yet (chunk 4 wires that up).
- **2026-10-11 (chunk 3):** Built the AI layer: Gemini client with Agent Platform/API-key backends and fallback, Zod → Gemini JSON Schema conversion (only supported keywords, tested), validated structured generation with one corrective retry, multimodal extraction with provenance rules and gazetteer resolution, embeddings, pairwise comparison, cited alert drafting with number checks, impact explanation guard, and `npm run check:models`. 91 unit tests pass (a scripted test model exercises every validation path). Live Gemini calls not yet run, waiting for credentials.

---

## 15. Open questions

1. Gemini access, **answered for local work on 2026-10-14**: a free-tier AI Studio key in `.env.local`, with the primary models pinned to `gemini-3.6-flash` while 3.8 Flash is oversubscribed (§13, §14). The *production* half is still open, and it is the recommendation from §5: Cloud Run should reach Gemini through Agent Platform on the service account so no key ships in the image. That needs the project in question 2.
2. GCP project ID with billing or hackathon credits, **deferred to the same session**; needed for Firestore, Cloud Storage, Firebase Auth and Cloud Run.
3. Demo images: **mechanism done, choice still open (2026-10-14).** `data/eval/media/` now carries a working image and voice-note fixture, both synthesised here, both labelled, and both exercised by `npm run test:multimodal` (§14). The illustration is good enough to prove the pipeline and explicitly not good enough to ship: it carries a visible "NOT A REAL PHOTOGRAPH" label. What the **demo** should use is still yours — an openly licensed landslide photo (attributed, and labelled as not of this event) or images you provide. Nothing is blocked on it; §12's scenario needs no photo.

---

## 16. Submission checklist

- [ ] Theme (Sustainability & Social Impact) and category (Social Good) selected, **yours, in the submission form**
- [ ] Cloud Run URL works in a private window and on a phone, **needs a GCP project with billing** (the AI Studio key in `.env.local` does not cover Cloud Run); `docs/deploy.md` §4 has the checks
- [ ] Demo reviewer credentials in the submission notes, **yours**; locally the passcode is `demo-reviewer`, and the deployed one is whatever you set as `REVIEWER_PASSCODE`
- [ ] A ~3-minute demo video on a public link that shows Gemini working, **unblocked 2026-10-14** (Gemini runs locally on the AI Studio key); record it once `npm run eval` in Gemini mode has been run against the free tier's daily cap
- [ ] Vision deck PDF: impact, problem fit, community benefit, feasibility, scalability, **yours**. `project.md` and the README carry the substance; §12 has the measured numbers
- [x] README: setup, architecture, Gemini vs code, limitations, data sources and licences, eval results
- [x] All synthetic data labelled; OSM attribution visible on the map
- [x] Code, docs and slides in English
- [ ] `min-instances=1` and a budget alert for the evaluation window (Oct 19 – Nov 6), documented in `docs/deploy.md` §5; **set the alert before turning it on**
- [ ] Submitted by **Oct 17**

**The credential session is now half done: Gemini is configured (2026-10-14), Google Cloud is not.** The video can be recorded — Gemini runs locally and the checks pass. Submission still needs the deployed URL, which needs a GCP project with billing for Cloud Run, Firestore, Cloud Storage and Firebase Auth. That project is the single remaining long-lead item, and §13's deferral stops being free the moment it is the only thing left.

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

**OpenStreetMap data:** Overpass API (overpass-api.de), query in `scripts/overpass/np-araniko-corridor.overpassql`, limited to Nepal's national boundary; ODbL 1.0, see `data/regions/nepal/araniko-corridor/SOURCE.md`.

**Local machine:**
- Installed: Node 25.2.1 · npm 11.6.2 · git 2.39.3 · Firebase CLI 14.4.0 · Python 3.12.4 · Homebrew 5.0.9
- Missing: the gcloud CLI (`brew install --cask gcloud-cli`)
- Docker isn't needed, because Cloud Build builds the image. The container uses a Node 24 LTS base image (Node 25 isn't an LTS release).
