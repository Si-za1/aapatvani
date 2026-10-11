<!-- Original product brief, as shared by the team on 2026-10-11. The working plan, decisions and status live in ../project.md. -->

# AapatVani AI — Project Introduction & Product Vision

## 1. What We Are Building

We are building **AapatVani AI**, an AI-powered disaster intelligence and impact analysis platform designed to help communities and emergency responders make better sense of fragmented disaster information.

AapatVani is designed around a simple idea: when a disaster happens, valuable information may arrive through many channels, in different languages, formats, and levels of reliability. People may submit photographs, written reports, voice notes, or location information. Multiple reports may describe the same incident, contradict each other, or omit important details.

The challenge is not simply collecting these reports. It is turning them into an organised, traceable, and reviewable picture of what may be happening and what could be affected.

AapatVani AI uses Google's Gemini models to assist with understanding community-submitted information, structuring incident reports, identifying potential relationships between reports, and explaining possible impacts. It combines AI capabilities with deterministic data processing, geographic analysis, evidence tracking, and human verification.

Our first implementation will focus on Nepal, with an architecture that can later be configured for other regions in Asia-Pacific, such as the Philippines.

## 2. Why We Are Building It

Disasters create information challenges alongside physical damage. Reports can be fragmented, repetitive, incomplete, outdated, or contradictory. Responders need to understand which reports may describe the same event, what information is supported by evidence, and which locations or services may require further investigation.

Existing emergency systems and disaster-response organisations remain essential. AapatVani AI is not intended to replace them.

Instead, we want to explore whether AI-assisted information triage can help responders:

- Organise incoming community reports into structured incident records.
- Identify possible duplicate reports without automatically merging unrelated events.
- Distinguish reporter claims, visual observations, unverified information, and human-confirmed facts.
- Trace important claims back to their original reports and supporting evidence.
- Identify potential geographic, infrastructure, and service-access impacts.
- Review uncertainty and make better-informed decisions.
- Prepare evidence-linked alert drafts for human approval.

Our goal is to build a practical decision-support prototype that demonstrates how AI can support disaster-response workflows responsibly.

We will not claim that the prototype is already proven to improve real-world emergency response. We will evaluate its behaviour on labelled test scenarios and clearly communicate its limitations.

## 3. Our Core Differentiator

AapatVani AI is not just another disaster-reporting form, chatbot, or map with incident pins.

Its core value is the connection between three things:

**Community evidence → Incident intelligence → Potential impact analysis**

First, the platform transforms fragmented submissions into structured, traceable evidence.

Second, it compares reports to identify possible incident relationships, duplicate submissions, missing information, and contradictions.

Third, it analyses available geographic and network information to identify places, communities, infrastructure, and essential services that may be affected by an incident.

Every AI-generated conclusion must remain distinguishable from verified facts. Responders should be able to understand why the system produced a result and inspect the evidence behind it.

## 4. Main Features

### Feature 1: Multimodal Community Reporting

Build a simple reporting interface that allows a person to submit:

- A photograph or other permitted evidence.
- A report in Nepali or English.
- A voice note, if supported by the implemented audio workflow.
- An optional location and reported time.
- A short description of what they observed.

The interface should be accessible, mobile-friendly, and easy to use during a stressful situation.

Preserve the original submission and its metadata. Do not silently modify or discard the reporter's original information.

### Feature 2: Gemini-Powered Incident Extraction

Use a suitable Google Gemini model to transform unstructured submissions into structured incident information.

Potential fields include:

- Candidate hazard category.
- Description of the reported event.
- Visible evidence from an uploaded photograph.
- Reported impacts, such as a claimed road obstruction.
- Reported location and time.
- Missing information and uncertainty.
- Source references supporting each extracted claim.

Use schema validation and application-level checks. A model-generated result must not automatically become a confirmed fact.

### Feature 3: Incident Clustering and Contradiction Detection

Different people may report the same event in different words, while different events may sound similar.

Implement a candidate-matching workflow that considers available evidence, time, geographic proximity, and textual or semantic similarity.

The system should:

- Suggest reports that may belong to the same incident.
- Flag conflicting locations, times, descriptions, and other details.
- Identify potentially copied reports when the available evidence supports that suspicion.
- Avoid treating repeated or copied content as independent corroboration.
- Let human reviewers merge, separate, or retain reports independently.

A similarity score alone must never be treated as proof that two reports describe the same incident.

### Feature 4: Evidence Graph and Provenance

Build an evidence-oriented incident workspace that connects:

- Original reports.
- Extracted claims.
- Supporting evidence and source excerpts.
- Related reports.
- Contradictory claims.
- Geographic impact candidates.
- Reviewer decisions.
- Alert drafts derived from reviewed information.

A responder should be able to select a claim and understand where it came from.

Validate evidence references against stored records. Do not allow Gemini to invent report IDs, evidence references, or supporting sources.

### Feature 5: Blast Radius and Potential Impact Analysis

Build a feature called **Blast Radius Analysis**, meaning an analysis of the locations, communities, infrastructure, and services that could potentially be affected by an incident.

This is not a simple circle drawn around an incident. It should use available geographic information and, where feasible, road-network connectivity and documented service dependencies.

For example, a reported landslide may block a road connecting a community to a health facility. The platform could identify the road blockage, show the relevant network connection, and flag the community and facility for access-impact review.

The feature should:

- Identify nearby candidate assets using valid coordinates.
- Analyse road connectivity when suitable network data is available.
- Identify possible access disruptions when the relevant dependency is documented.
- Explain why each asset was flagged.
- Link impact candidates to supporting evidence and analysis inputs.
- Display uncertainty, data quality, and missing information.
- Let responders confirm or dismiss individual candidates.
- Preserve a history of assessments and reviewer decisions.

Use deterministic geographic and network logic for calculations. Use Gemini to help interpret evidence and explain results, not to invent geography or calculate unsupported hazard boundaries.

Never claim that a location is safe merely because it falls outside the displayed analysis. Do not predict precise flood extents, landslide propagation, casualty counts, or physical damage without appropriate validated models and data.

### Feature 6: Incident Map and Responder Dashboard

Create a central dashboard where authorised responders can:

- View incident locations and review statuses.
- Filter incidents by hazard type, time, and status.
- Identify reports awaiting review.
- Open candidate incident clusters.
- Inspect the associated evidence.
- View potential impact assessments.
- Track verified incidents and unresolved contradictions.

Use Leaflet and OpenStreetMap for the initial interactive map, subject to their usage requirements.

The map must distinguish incident locations from potential impact candidates and human-confirmed information. A map marker alone should never imply that an impact has been verified.

### Feature 7: Human Verification Workspace

Create a dedicated review experience.

Reviewers should be able to:

- Inspect the original report alongside AI-extracted information.
- Open supporting photographs and other evidence.
- Compare related reports.
- Review contradictions and missing information.
- Accept, edit, reject, or request more information about extracted claims.
- Confirm or separate candidate incident clusters.
- Review potential impact candidates.
- Record decisions and notes.

Maintain an audit trail that distinguishes AI-generated suggestions from human actions.

### Feature 8: Evidence-Linked Alert Drafting

Allow responders to generate a draft summary or alert using reviewed incident information.

A draft should include the known facts, the reported location and time where available, relevant potential impacts, unresolved uncertainty, and links to supporting evidence.

Do not automatically publish or broadcast emergency alerts. Human approval is required before any alert is treated as official.

### Feature 9: Regional Configuration

Build the platform with a regional configuration layer.

Nepal is the initial target for the prototype. A second configuration, such as the Philippines, may demonstrate how hazard categories, geographic datasets, languages, and regional settings can be adapted.

Do not imply that the platform has comprehensive geographic coverage or has been validated in another country merely because a regional selector exists.

Clearly label synthetic, historical, and operational data.

### Feature 10: Evaluation and Transparency

Include a repeatable evaluation workflow using labelled synthetic scenarios.

Test:

- Incident extraction.
- Candidate duplicate detection.
- False merges and missed matches.
- Contradiction identification.
- Evidence-reference validity.
- Potential impact analysis.
- Handling of missing or stale geographic data.
- Appropriate uncertainty and abstention.

Report actual measured results. Never fabricate performance numbers or claim real-world effectiveness based only on synthetic data.

## 5. Who Will Use It?

**Primary users:** authorised disaster-response personnel, incident coordinators, and reviewers who need to organise and assess incoming reports.

**Contributors:** community members who submit observations and supporting information.

**Potential future users:** relevant local authorities, humanitarian organisations, and response partners, subject to appropriate partnerships, permissions, and operational validation.

The product should not assume that every user has technical knowledge or that every community report is accurate.

## 6. Product Design Philosophy

AapatVani AI should feel like a trustworthy public-interest tool, not a flashy AI experiment.

The design should communicate calm, clarity, credibility, and practical usefulness.

### Visual direction

Use a modern, restrained public-sector dashboard aesthetic:

- Deep teal and river blue for the primary interface.
- Warm off-white and light neutral surfaces.
- Muted sage for verified information.
- Amber for items requiring review.
- Red reserved for clearly labelled critical warnings where appropriate.

Use readable typography, generous spacing, subtle borders, restrained shadows, and clear information hierarchy.

Use colour together with text labels and icons. Never rely on colour alone to communicate incident status or severity.

Avoid excessive gradients, glowing AI effects, unnecessary animations, oversized decorative illustrations, and generic AI landing-page patterns.

### User experience principles

- Mobile-friendly public reporting.
- A clear dashboard for responders.
- A map paired with a useful incident and impact list.
- Evidence visible alongside claims.
- Uncertainty communicated explicitly.
- Human-review actions easy to understand.
- Clear separation between reported, inferred, and confirmed information.
- Useful empty states, loading states, errors, and missing-data warnings.

Prioritise the actual incident-review workflow over decorative analytics.

## 7. Technical Direction

Use a simple, maintainable architecture appropriate for a three-day hackathon.

Preferred stack:

- Next.js with App Router.
- React and TypeScript.
- Tailwind CSS and shadcn/ui.
- Lucide icons.
- Google's Gemini API through the official Google GenAI SDK.
- Firestore for reports, incidents, claims, impact assessments, and review history.
- Google Cloud Storage or an appropriate Firebase storage option for uploaded media.
- Firebase Authentication for reviewer access if time permits.
- Leaflet and OpenStreetMap for mapping.
- Zod for request and model-output validation.
- Cloud Run for deployment on Google Cloud.

Keep Gemini API keys server-side. Enforce access controls on reviewer actions, media access, and administrative APIs.

Start with a modular application rather than unnecessary microservices or multiple AI agents.

Use the currently available Gemini model that best fits the required multimodal capabilities, structured output, quality, latency, and available budget. Verify actual model availability and API quotas before committing to a specific model ID.

## 8. Three-Day Delivery Strategy

The goal is to demonstrate one coherent, functioning workflow rather than a large collection of incomplete features.

**Day 1: Foundation and AI reporting**
- Establish the application structure and design system.
- Build the report submission flow.
- Integrate Gemini for structured extraction.
- Store reports and evidence.
- Display the resulting structured incident.

**Day 2: Incident intelligence and impact analysis**
- Build the review queue and incident workspace.
- Add candidate clustering and contradiction flags.
- Implement evidence links and reviewer decisions.
- Build the first deterministic blast-radius analysis.
- Display potential impacts on the map.

**Day 3: Integration, deployment, and evaluation**
- Integrate alert drafting with reviewed facts.
- Test end-to-end scenarios and failure cases.
- Verify evidence provenance and access controls.
- Deploy to Cloud Run.
- Run the labelled evaluation dataset.
- Prepare the demonstration and clearly communicate limitations.

Prioritise a working end-to-end application. Defer advanced GIS, extensive regional datasets, complex agent orchestration, and nonessential visualisations until the core workflow is reliable.

## 9. What Success Looks Like

At the end of the hackathon, we want to demonstrate this scenario:

Several people submit reports about a possible landslide. The reports contain different descriptions, images, and incomplete location information.

AapatVani AI structures the submissions, proposes which reports may describe the same incident, identifies contradictions, and links the extracted claims to their sources.

A responder reviews the evidence, confirms the incident details that are supported, and opens the blast-radius analysis. The application identifies candidate road connections, communities, and services that may be affected using the available geographic data. The responder inspects the evidence and records review decisions.

Finally, the system produces an evidence-linked alert draft based on the reviewed information. A human must approve it before release.

The demonstration should make clear what Gemini contributes, what deterministic application logic contributes, what the evidence supports, and what remains unknown.

## 10. Your Role as the Coding Assistant

Act as a senior full-stack engineer, AI engineer, product designer, and pragmatic hackathon technical lead.

First, understand this product vision. Do not immediately generate the entire application or add features that are not required.

Next, provide:

1. A concise understanding of the product and its main differentiator.
2. A prioritised feature list separating must-have, should-have, and future features.
3. A proposed architecture and data flow.
4. A practical division of responsibilities for two engineers.
5. A three-day implementation plan with clear deliverables.
6. The main technical risks and how to mitigate them.
7. The smallest credible end-to-end demo we should build first.

Preserve the distinction between community-reported claims, AI-generated interpretations, deterministic geographic findings, and human-confirmed facts throughout the design.

Optimise for a working, demonstrable, technically defensible prototype with meaningful social impact. Do not overengineer the system or sacrifice reliability for feature count.
