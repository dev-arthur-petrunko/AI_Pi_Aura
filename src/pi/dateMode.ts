export interface DateModePlan {
  start: number;
  end: number; // exclusive
  lead: number;
  tail: number;
}

export function dateModePlan(start: number, len: number, lead = 6, tail = 6): DateModePlan {
  const s = Math.max(0, start - lead);
  const e = start + len + tail;
  return { start: s, end: e, lead: start - s, tail };
}
