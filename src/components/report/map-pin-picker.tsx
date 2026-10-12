"use client";

// The pin picker. Loaded client-only (Leaflet touches `window`), and only when a reporter actually
// chooses to drop a pin, so the map bundle never delays the form on a slow connection.

import { divIcon } from "leaflet";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import type { LatLng } from "@/lib/domain/schemas";

function ClickCatcher({ onPick }: { onPick: (point: LatLng) => void }) {
  useMapEvents({
    click(event) {
      onPick({ lat: event.latlng.lat, lng: event.latlng.lng });
    },
  });
  return null;
}

/**
 * A hand-built marker rather than Leaflet's default image: the default icon resolves its PNG by a
 * relative URL that bundlers rewrite, and it 404s in production. A divIcon has no asset to lose.
 */
const PIN_ICON = divIcon({
  className: "av-div-icon",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#16302e;box-shadow:0 0 0 4px rgba(250,244,232,.9),0 1px 6px rgba(22,48,46,.5)"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

export interface MapPinPickerProps {
  center: [number, number];
  zoom: number;
  value: LatLng | null;
  onPick: (point: LatLng) => void;
  tileUrl: string;
  attribution: string;
  label: string;
}

export default function MapPinPicker({ center, zoom, value, onPick, tileUrl, attribution, label }: MapPinPickerProps) {
  return (
    <div className="av-map h-64 w-full overflow-hidden rounded-2xl border border-border" role="application" aria-label={label}>
      <MapContainer center={value ? [value.lat, value.lng] : center} zoom={zoom} scrollWheelZoom className="h-full w-full">
        <TileLayer url={tileUrl} attribution={attribution} />
        <ClickCatcher onPick={onPick} />
        {value ? <Marker position={[value.lat, value.lng]} icon={PIN_ICON} /> : null}
      </MapContainer>
    </div>
  );
}
