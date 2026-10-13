# Prototype screenshots

The running app, captured from a production build so nothing from a development overlay appears.
All at 2× for print and slides: the desktop screens are 2880 × 1800 (a 1440 × 900 window), the phone
one is 860 × 1800 (430 × 900).

| File | Screen | What it shows |
|---|---|---|
| `01-landing-nepali.png` | Landing page | What a reporter sees first. Nepali is the default language. |
| `02-landing-english.png` | Landing page | The same page in English, from the language toggle. |
| `03-report-form.png` | Report form | The phone form: text, hazard picker, location, photo and voice. |
| `04-sign-in.png` | Sign-in | Reviewer entry. Outside the shell: no navigation until signed in. |
| `05-overview.png` | Overview | Counts, the map, the incident list, and what has just arrived. |
| `06-review-queue.png` | Review queue | Reports as cards, grouped by hazard. |
| `07-report-workspace.png` | Report workspace | One report: the original beside what was read from it, claim by claim. |
| `08-incident-board.png` | Incident board | One panel per hazard, tinted by the most attention-needing incident in it. |
| `09-incident-overview.png` | Incident overview | What is reported, why we think so, what disagrees, what needs a person. |
| `10-road-analysis.png` | Road analysis | The before-and-after chart, and the findings deck at 1 of 12. |
| `11-timeline.png` | Timeline | The evidence chain on one axis. Above the line, what people said. |
| `12-activity-record.png` | Activity record | Every action by day, with what the record is made of beside it. |
| `13-settings.png` | Settings | Two working preferences, and what this deployment is made of. |
| `14-evaluation.png` | Evaluation | Measured results over the labelled scenarios. |

## Retaking them

They come from a production build, not the dev server, because `next dev` draws a badge in the
corner that would end up on every slide:

```bash
npm run build
REVIEWER_PASSCODE=demo-reviewer SESSION_SECRET=<any 32+ char string> PORT=3002 npm start
```

Sign in through `POST /api/auth/login` for an `av_session` cookie, set it plus `av_lang` in the
browser, and capture with `prefers-color-scheme: light` and a device scale factor of 2. Screen 10
needs one extra step: scroll the findings deck into view before capturing, or it lands off-screen.

The demo store must be seeded and one road analysis run on the landslide incident for screens 09 and
10 to show anything — `npm run seed`, then **Run the analysis** on the landslide's Impact tab.
