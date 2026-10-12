// Every hazard gets an icon as well as its name. The design rule in project.md §3 is that colour
// never carries meaning on its own, an icon and a text label always come with it, and this is
// where the icon half is decided.

import {
  Activity,
  CloudRain,
  Flame,
  Mountain,
  Snowflake,
  TriangleAlert,
  WavesHorizontal,
  Wind,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { HazardIcon } from "@/config/regions/types";

const ICONS: Record<HazardIcon, LucideIcon> = {
  landslide: Mountain,
  flood: WavesHorizontal,
  debris_flow: WavesHorizontal,
  glof: WavesHorizontal,
  // A waveform reads better for an earthquake than any object shape would.
  earthquake: Activity,
  fire: Flame,
  windstorm: Wind,
  lightning: Zap,
  heavy_rain: CloudRain,
  avalanche: Snowflake,
  cold_wave: Snowflake,
  typhoon: Wind,
  storm_surge: WavesHorizontal,
  volcano: Mountain,
  tsunami: WavesHorizontal,
  other: TriangleAlert,
  unclear: TriangleAlert,
};

export function HazardGlyph({ icon, className }: { icon: HazardIcon; className?: string }) {
  const Icon = ICONS[icon] ?? TriangleAlert;
  return <Icon className={className} aria-hidden />;
}
