"use client";

// Leaflet claims a DOM node for the lifetime of a map, and refuses to let a second map claim the
// same one — "Map container is being reused by another instance". If a map is rendered during
// hydration, or during React's development double-mount, that is exactly what happens: a layer then
// fails with "appendChild of undefined" because it is attaching to a map that was never created.
//
// Waiting until the client is available keeps the map out of both: it is created once, on the
// client, into a node nothing else has touched.
//
// `useSyncExternalStore` is doing real work here rather than being ceremony. "Is there a client yet"
// is a value that lives outside React, it differs between the server pass and the client pass, and
// React has a defined way to render the server snapshot first and switch — which is precisely the
// behaviour wanted, without a state update inside an effect to get there.

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};
const onClient = () => true;
const onServer = () => false;

export function ClientOnlyMap({ children, placeholder }: { children: React.ReactNode; placeholder: React.ReactNode }) {
  const mounted = useSyncExternalStore(subscribe, onClient, onServer);
  return <>{mounted ? children : placeholder}</>;
}
