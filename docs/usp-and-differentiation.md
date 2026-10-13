# USP, problem fit, and how this differs

Answering three questions the submission asks: what the unique selling point is, how the solution
solves the problem, and how it differs from what already exists.

---

## 1. The USP, in one sentence

**Most tools stop at pins on a map. AapatVani shows where each claim came from, how the reports
relate to one another, and what a blocked road means for who can still reach care — and it labels
how it knows each of those three things.**

The product is a chain, and the chain is the point:

> **Community evidence → incident intelligence → potential impact analysis, with provenance at every link.**

Each arrow in that chain is a thing that exists in the code today, not an aspiration:

| Link | What it does | Why it is not trivial |
|---|---|---|
| Community evidence | Reports by text, photo or voice, in Nepali or English, with no account and no personal data | Nepali-first by default: Devanagari, Bikram Sambat dates, relative time ("हिजो राति"), voice notes |
| Incident intelligence | Reports that describe the same event are grouped; copies and contradictions are flagged | A **copy never counts as a second witness** — the failure mode where one forwarded message reads as fifty confirmations |
| Impact analysis | If the road a report describes as blocked really were blocked, which settlements lose their route to a health facility | **Road connectivity, not a radius.** Multi-source Dijkstra over a real OpenStreetMap extract: 11,340 junctions, 36 health facilities, 187 settlements |
| Provenance | Every claim carries who produced it and what a person decided about it | Four origins — Reported, AI interpretation, Computed, Reviewer — each with its own colour, icon and word |

**The three things that are genuinely hard to copy:**

1. **The impact is a network calculation, not a circle.** A radius tells a responder how far the
   landslide is. It does not tell them that Tatopani, Namtan and Kodari have just lost *every
   mapped route* to a hospital whose nearest alternative is 30 km away. That is the sentence a
   district officer needs, and it is computed, reproducible, and caveated.

2. **The system is built to be disbelieved in the right places.** Gemini never sees or returns a real
   ID — it cites aliases (`R1`, `M1`, `C3`) that the server maps back, and unknown aliases are
   rejected. Coordinates never come from the model; only GPS, a map pin or a gazetteer match. Every
   quoted excerpt is checked against the reporter's own words, and a claim whose quote cannot be
   found is **downgraded** to "interpretation, excerpt not verified" rather than quietly kept.

3. **Nothing decides itself.** A similarity score never merges two reports — only a reviewer does.
   An alert stays a draft until a named person approves it, and the app never broadcasts. The word
   *Confirmed* appears in exactly one situation: after a human being has acted.

---

## 2. How it solves the problem

**The bottleneck in a landslide response is not a shortage of reports.** During a monsoon event a
district receives dozens: phone calls, Facebook posts, forwarded Viber messages, a photo with no
place attached. What a responder cannot do quickly is answer four questions:

- Which of these are the *same* event?
- Which are *copies* of one another, so fifty messages are really one witness?
- Which of them *contradict* each other, and about what?
- And what does it *mean* — for the people downstream who need a road to reach a health facility?

AapatVani answers those four, in that order, and keeps a person in the loop at every step that
matters.

**The flow, end to end:**

1. **A resident reports.** Nepali or English, text, photo or voice, a rough location. No account, no
   name, no phone number. The report is stored *before* any model reads it, so a Gemini failure
   never loses a submission.
2. **The model reads it into claims.** Each claim carries the words it came from. Anything the model
   inferred rather than quoted is labelled an interpretation.
3. **The server checks it before anything believes it.** Schema validation, alias mapping, excerpt
   verification against the original text, and gazetteer resolution for place names. Equally good
   matches more than 3 km apart are reported as *ambiguous* rather than guessed.
4. **Reports are grouped.** Distance, time gap, hazard compatibility and embedding similarity
   produce candidate groupings with a visible score breakdown. Copies are detected by photo hash,
   near-identical wording, and reporter token.
5. **A reviewer decides.** Confirm, correct, reject or ask for more — per claim, and per grouping.
   Every action lands in an append-only audit trail that separates what a person did from what the
   model did.
6. **The road network is analysed.** One segment is treated as possibly blocked; shortest paths to
   care are computed before and after; each settlement is classified as lost, longer, or unchanged,
   with the caveats shown next to the finding rather than in a footnote.
7. **An alert is drafted from confirmed facts only.** Every sentence cites its source; sentences
   resting on nothing cited are removed and counted. A named reviewer approves it. Nothing is sent.

**What a responder ends up holding** is not "forty reports". It is:

> One landslide at Larcha. Three independent witnesses, one forwarded copy excluded. One report
> disagrees about whether the road is open. If that segment is blocked, four settlements lose every
> mapped route to a health facility — the nearest was 21 to 30 km away.

---

## 3. How it differs from existing ideas

Four kinds of thing already exist in this space. None of them do this.

| What exists | What it does well | Where it stops | What AapatVani does instead |
|---|---|---|---|
| **Crisis-mapping platforms** (Ushahidi and similar) | Collect reports and put pins on a map, fast | The map is the end of the analysis. Grouping, duplication and consequence are left to a human reading the map | Reasons *over* the reports — groups them, excludes copies, flags contradictions — then computes what the blockage means for road access to services |
| **Hazard and satellite models** (flood extent, landslide runout, damage estimates) | Model the physical hazard with real physics and remote sensing | They model the *hazard*, and community reports are either absent or a validation afterthought | Deliberately predicts **no** hazard. It takes what communities report and computes the *service-access consequence*, which is a different and answerable question |
| **Government incident portals** (Nepal's BIPAD and similar) | The official record, integrated with the agencies that act | Built for official reporting channels and official language | Built to **work alongside** that world, not replace it: community evidence, provenance-labelled, that a reviewer has confirmed before it is worth anything |
| **LLM summarisation over reports** | Reads many reports quickly and writes prose | The summary is unfalsifiable. No citation survives contact with the original, and no failure is ever admitted | Every model output is schema-validated, citation-checked and *downgradeable*. The model never holds a real ID or a coordinate, and a quote it cannot support is removed |

**Three differences worth stating out loud in a judging room:**

- **Provenance is enforced in code, not in a policy document.** The excerpt check, the alias map,
  the coordinate rule and the downgrade path are all tested. A claim the model cannot support is not
  softened — it is relabelled, and the label is visible on screen.
- **Copies are treated as a first-class failure mode.** It is the most common way community-sourced
  information misleads: one message forwarded widely looks like independent corroboration. Counting
  *independent witnesses* rather than *reports* is a small idea with a large effect on whether a
  responder trusts what they are reading.
- **The tool abstains.** A report with no usable location is never guessed at, it is routed to a
  person. A place outside the dataset is reported as *unchecked*, never as safe. An eval over
  labelled scenarios publishes real numbers, including the misses, and the app says plainly that
  it does not estimate casualties, damage, or where a hazard will spread.

---

## The honest boundaries

Stating these is part of the USP, not a disclaimer bolted on:

- It does **not** predict hazards, runout, flood extent, casualties or damage.
- It **never** broadcasts; every alert is a draft a person approves.
- The blast radius is a deterministic calculation over an **OpenStreetMap extract with known gaps**
  — four settlements in this corridor have no mapped route to care even before an incident, and are
  reported as data gaps rather than as impact.
- It is a **prototype on one corridor**, and the evaluation set is small and hand-written. No
  real-world effectiveness claims are made.
- The model-written steps need Google Cloud credentials to run live; everything deterministic around
  them runs today.
