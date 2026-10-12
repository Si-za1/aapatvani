"use client";

// A Leaflet map we own outright, rather than one react-leaflet owns for us.
//
// Why not MapContainer: its cleanup runs `context?.map.remove()`, and `context` is set by a state
// update that has not committed when the first effect runs. Under React's development double-mount
// the cleanup therefore runs with `context` still null, does nothing, and leaves Leaflet's internal
// `_leaflet_id` on the container node. The remount then calls `new Map(node)` on a node that already
// has one, and Leaflet throws "Map container is being reused by another instance" — every layer
// failing behind it with "appendChild of undefined".
//
// Here the map reference lives in a ref that the cleanup always sees, so `map.remove()` always runs
// and always clears the node. That makes the component safe to mount, unmount and mount again,
// which is exactly what development does to it.
//
// Layers are drawn imperatively through `draw`. That keeps one code path for markers, polylines and
// popups, and it is cheap at this scale — a few dozen features at most.

import { useEffect, useRef } from "react";
import * as L from "leaflet";

/** Leaflet writes popup content as HTML, so anything from a record has to be escaped first. */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** The markup a popup shows: a title, a kind, a detail line and a link. All escaped. */
export function popupHtml(parts: { title: string; kind?: string; detail?: string; href?: string; hrefLabel?: string }): string {
  const rows = [
    `<strong style="display:block;font-size:13px">${escapeHtml(parts.title)}</strong>`,
    parts.kind ? `<span style="display:block;font-size:12px;color:#6b6357">${escapeHtml(parts.kind)}</span>` : "",
    parts.detail ? `<span style="display:block;font-size:12px">${escapeHtml(parts.detail)}</span>` : "",
    parts.href ? `<a href="${escapeHtml(parts.href)}" style="display:inline-block;margin-top:4px;font-size:12px;font-weight:500;text-decoration:underline">${escapeHtml(parts.hrefLabel ?? "Open")}</a>` : "",
  ];
  return rows.filter(Boolean).join("");
}

export interface LeafletMapProps {
  center: [number, number];
  zoom: number;
  tileUrl: string;
  attribution: string;
  className?: string;
  /** Announced to assistive technology; the container is otherwise an opaque div. */
  ariaLabel?: string;
  /** Draws the current features into a group that has already been cleared. */
  draw?: (group: L.LayerGroup, map: L.Map) => void;
  /** Called when the map is clicked, for the pin picker. */
  onMapClick?: (point: { lat: number; lng: number }) => void;
  /** Re-runs `draw` whenever this string changes. */
  drawKey?: string;
}

export function LeafletMap({ center, zoom, tileUrl, attribution, className, ariaLabel, draw, onMapClick, drawKey }: LeafletMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const groupRef = useRef<L.LayerGroup | null>(null);

  // Declared first so it has already run by the time the effects below look for the map.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const map = L.map(node, { center, zoom, scrollWheelZoom: true });
    L.tileLayer(tileUrl, { attribution }).addTo(map);
    mapRef.current = map;
    groupRef.current = L.layerGroup().addTo(map);

    // Always runs, so the node is always released — this is the whole point of the component.
    return () => {
      map.remove();
      mapRef.current = null;
      groupRef.current = null;
    };
    // Created once. Moving the camera or changing tiles after mount is a different concern, and the
    // screens that use this do not do either.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !onMapClick) return;
    const handler = (event: L.LeafletMouseEvent) => onMapClick({ lat: event.latlng.lat, lng: event.latlng.lng });
    map.on("click", handler);
    return () => {
      map.off("click", handler);
    };
  }, [onMapClick]);

  useEffect(() => {
    const group = groupRef.current;
    const map = mapRef.current;
    if (!group || !map) return;
    group.clearLayers();
    draw?.(group, map);
    // `draw` is a fresh closure each render, so this redraws on each one. At a few dozen features
    // that is cheaper than the bookkeeping needed to avoid it, and it cannot go stale.
  }, [draw, drawKey]);

  return <div ref={containerRef} className={className} role="application" aria-label={ariaLabel} />;
}
