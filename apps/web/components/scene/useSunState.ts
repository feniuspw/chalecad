import { useMemo } from 'react';
import { resolveLocation, sunPosition, sunTimes, type ResolvedLocation, type SunAngles, type SunTimes } from '@/lib/sun';
import { useEditor } from '@/lib/store/editor';

export interface SunState extends SunAngles {
  date: string;
  minutes: number;
  northDeg: number;
  location: ResolvedLocation;
  times: SunTimes;
}

/** Sol atual do store: local do projeto, data, hora e ângulos derivados. */
export function useSunState(): SunState {
  const sun = useEditor((s) => s.sun);
  const region = useEditor((s) => s.project.meta.region);
  const loc = useEditor((s) => s.project.meta.location);
  const northDeg = useEditor((s) => s.project.meta.northDeg);
  const lat = loc?.lat;
  const lon = loc?.lon;
  const location = useMemo(() => resolveLocation({ region, location: lat === undefined || lon === undefined ? undefined : { lat, lon } }), [region, lat, lon]);
  const times = useMemo(() => sunTimes(sun.date, location.lat, location.lon, location.tz), [sun.date, location]);
  const angles = useMemo(() => sunPosition(sun.date, sun.minutes, location.lat, location.lon, location.tz), [sun.date, sun.minutes, location]);
  return { ...angles, date: sun.date, minutes: sun.minutes, northDeg, location, times };
}
