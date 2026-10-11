# Araniko Highway corridor, Sindhupalchok

अरनिको राजमार्ग क्षेत्र, सिन्धुपाल्चोक

- **Dataset id:** `np-araniko-corridor` (region `np`)
- **Source:** OpenStreetMap contributors, via the Overpass API
- **Licence:** Open Database License (ODbL 1.0). Attribution: © OpenStreetMap contributors.
  This processed extract is a derivative database and is shared under the same licence.
- **OSM snapshot:** 2026-10-11T11:22:51Z
- **Bounding box (S, W, N, E):** 27.62, 85.68, 28, 86.02
- **Query:** `scripts/overpass/np-araniko-corridor.overpassql` (limited to Nepal's national boundary)
- **Regenerate:** `npm run data:fetch` (or `npm run data:prepare -- <overpass.json>`)

## Contents

| | Count |
|---|---|
| Road graph nodes / edges | 11340 / 11613 |
| Mapped road length | 2524.9 km |
| Connected components | 101 (largest holds 96% of nodes) |
| Health facilities (of which hospitals) | 36 (4) |
| Schools | 408 |
| Settlements | 187 |
| Gazetteer entries | 622 |

Road classes included: secondary, trunk, primary, tertiary, unclassified, service, residential, track, road.

## Known limitations

- Only motorable road classes are included. Footpaths and trails are excluded, so walking access is not analysed.
- Road condition, seasonal closures, vehicle availability and travel time are not modelled. Distances are measured along mapped roads.
- OpenStreetMap coverage in rural Nepal is incomplete. Missing roads or facilities change the results.
- Facility levels come from OSM tags and names and can be wrong (for example, sub-health posts tagged as hospitals).
- Settlement points are approximate centres, not boundaries. Population appears only where OSM has a population tag; it is never estimated.
- Areas across the national border are excluded.

This is not authoritative or complete geographic data. Results built on it are candidates for human review.
