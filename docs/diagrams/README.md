# Diagrams

Exported from [`../status-and-diagrams.html`](../status-and-diagrams.html) at 2× on a light ground,
for slides and documents. Regenerate by opening that file and re-exporting, or from the same source
with a headless browser at a device scale factor of 2.

| File | What it shows |
|---|---|
| `01-architecture.png` | Two clients, one deployable on Cloud Run, the modules inside it, and the three Google Cloud services it reaches — plus the road dataset that ships inside the image. |
| `02-process-flow.png` | A report arriving through extraction, checking, grouping, review, road analysis and alert approval, with the guardrails annotated. |
| `03-use-cases.png` | Three actors outside a system boundary and the seven use cases inside it, in UML notation: a community reporter starts two, a reviewer decides four, and Gemini does the reading and the comparing. Two use cases are reached by more than one actor — a grouping is proposed by the system and settled by a person, an alert is drafted and approved. |

All three are drawn as inline SVG in the HTML, so they are the same drawing in both places.
