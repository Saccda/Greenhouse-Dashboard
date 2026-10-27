import type {
  Farm, HistoryResponse, LatestResponse, SprayStatsResponse, TimeRange, WaterResponse,
} from "@/types";

/**
 * Everything the section page has already fetched.
 *
 * Passed whole rather than cherry-picked per section, because the useful
 * panels turned out to be the ones that CROSS domains — air temperature on
 * the soil page, spray cycles on the energy page — and a prop list tailored
 * to each section is exactly what stops those from being written.
 */
export interface DetailProps {
  farm?: Farm;
  latest?: LatestResponse;
  history?: HistoryResponse;
  /** The equivalent window immediately before this one, for comparisons. */
  previous?: HistoryResponse;
  water?: WaterResponse;
  sprayStats?: SprayStatsResponse;
  isOffline: boolean;
  isLoading: boolean;
  tempWarn: number;
  humWarn: number;
  range: TimeRange;
  /** "day", "week" — for sentences like "warmer than the previous week". */
  rangeWord: string;
  windowStart: number;
  windowEnd: number;
}
