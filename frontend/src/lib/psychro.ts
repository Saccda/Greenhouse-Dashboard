/**
 * Dew point and vapour pressure deficit, from temperature and humidity.
 *
 * Both are DERIVED, not measured — which is what makes them fair to show.
 * Nothing new is being claimed here: given a thermometer and a hygrometer,
 * these follow by arithmetic, and VPD is the number greenhouse growers
 * actually steer by. It says how hard the air is pulling water out of the
 * leaf, which temperature alone cannot: 30 °C at 60% RH and 30 °C at 85% RH
 * are the same temperature and completely different growing conditions.
 *
 * ONE HONEST LIMIT
 *   This is AIR vpd, computed from air temperature. The figure agronomists
 *   quote is usually LEAF vpd, which uses leaf temperature — and a leaf in
 *   sun sits above air temperature, in a transpiring canopy below it. We have
 *   no leaf sensor, so this is labelled "air VPD" everywhere it appears
 *   rather than quietly passing for the other thing.
 */

/**
 * Dew point in °C — the temperature at which this air would condense.
 *
 * Magnus-Tetens, with the Sonntag coefficients. Accurate to about 0.1 °C
 * across the range a greenhouse ever sees.
 */
export function dewPoint(tempC: number, rhPercent: number): number | null {
  if (!Number.isFinite(tempC) || !Number.isFinite(rhPercent)) return null;
  // Below ~1% the logarithm runs away and the result stops meaning anything;
  // a hygrometer reading 0 is broken rather than describing bone-dry air.
  if (rhPercent < 1 || rhPercent > 100) return null;
  const b = 17.62;
  const c = 243.12;
  const gamma = Math.log(rhPercent / 100) + (b * tempC) / (c + tempC);
  return (c * gamma) / (b - gamma);
}

/** Saturation vapour pressure in kPa (Tetens). */
export function saturationVapourPressure(tempC: number): number {
  return 0.6108 * Math.exp((17.27 * tempC) / (tempC + 237.3));
}

/**
 * Air vapour pressure deficit in kPa.
 *
 * Rough bands, for the subtitle rather than for any automatic decision:
 * under 0.4 the air is too still and wet for the plant to transpire and
 * disease follows; 0.4–1.6 is the usual working range; above about 1.6 the
 * plant closes its stomata and growth stops even though water is available.
 */
export function vpd(tempC: number, rhPercent: number): number | null {
  if (!Number.isFinite(tempC) || !Number.isFinite(rhPercent)) return null;
  if (rhPercent < 0 || rhPercent > 100) return null;
  return saturationVapourPressure(tempC) * (1 - rhPercent / 100);
}

/** Plain words for a VPD figure. Deliberately vague where the science is. */
export function vpdBand(kpa: number): { label: string; tone: "ok" | "warn" } {
  if (kpa < 0.4) return { label: "Low — air is near saturation", tone: "warn" };
  if (kpa > 1.6) return { label: "High — plants may close up", tone: "warn" };
  return { label: "Within the usual working range", tone: "ok" };
}
