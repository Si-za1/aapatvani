/* AapatVani region extract: Araniko Highway corridor, Sindhupalchok, Nepal.
   Motorable roads, health facilities, schools and named places inside Nepal's
   national boundary, within the corridor bounding box (S, W, N, E). */
[out:json][timeout:240];
area["ISO3166-1"="NP"][admin_level=2]->.np;
(
  way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|track|road)(_link)?$"](area.np)(27.62,85.68,28.00,86.02);
)->.roads;
.roads out body;
.roads >;
out skel qt;
(
  nwr["amenity"~"^(hospital|clinic|doctors|health_post)$"](area.np)(27.62,85.68,28.00,86.02);
  nwr["healthcare"](area.np)(27.62,85.68,28.00,86.02);
  nwr["amenity"="school"](area.np)(27.62,85.68,28.00,86.02);
  node["place"~"^(city|town|village|hamlet|suburb|neighbourhood|locality|isolated_dwelling)$"](area.np)(27.62,85.68,28.00,86.02);
);
out center tags;
