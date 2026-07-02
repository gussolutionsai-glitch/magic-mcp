import { SamGovClient, formatSamDate } from "./sam-gov.js";
import { UsaSpendingClient } from "./usaspending.js";
import { ContractRecord } from "./types.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Default lookback windows: opportunities are only worth seeing while they
// are open for bids; awards are past-pricing research, so look back years.
const DEFAULT_OPPORTUNITY_DAYS_BACK = 30;
const DEFAULT_AWARD_DAYS_BACK = 3 * 365;

export type ScrapeSource = "opportunities" | "awards" | "all";

export interface ScrapeOptions {
  /** Which data source(s) to scrape. Defaults to "opportunities". */
  source?: ScrapeSource;
  /** Free-text keywords (opportunity title / award description search). */
  keywords?: string;
  /** NAICS industry codes, e.g. ["561730", "562112"]. */
  naicsCodes?: string[];
  /** SAM.gov set-aside code, e.g. "SBA", "8A", "WOSB", "SDVOSBC". */
  setAside?: string;
  /** SAM.gov notice type code (o, p, k, r, s, a). */
  noticeType?: string;
  /** Agency name, e.g. "Department of Defense". */
  agency?: string;
  /** Two-letter place-of-performance state code (opportunities only). */
  state?: string;
  /** Lookback window in days (posted date / award period). */
  daysBack?: number;
  /**
   * Drop opportunities whose response deadline is closer than this many
   * days — no point bidding when there's no time to gather quotes.
   */
  minDaysUntilDeadline?: number;
  /** Award amount bounds in dollars (awards only). */
  minAmount?: number;
  maxAmount?: number;
  /** Max records to fetch per source. Defaults to 100. */
  maxRecords?: number;
  /** SAM.gov API key; falls back to the SAM_GOV_API_KEY env var. */
  samApiKey?: string;
}

export interface ScrapeResult {
  records: ContractRecord[];
  /** Total matching records reported by SAM.gov (may exceed maxRecords). */
  samTotalRecords?: number;
  warnings: string[];
}

export const SAM_API_KEY_HELP =
  "A SAM.gov API key is required to search contract opportunities. " +
  "Get one for free: sign in at https://sam.gov, open Account Details, " +
  "and request a Public API Key. Then set the SAM_GOV_API_KEY environment " +
  "variable (or pass samApiKey).";

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Drops opportunities whose response deadline is less than minDays away.
 * Records without a parseable deadline are kept — better to surface them
 * than to silently hide a biddable contract.
 */
export function filterByDeadline(
  records: ContractRecord[],
  minDays: number | undefined,
  now: Date = new Date()
): ContractRecord[] {
  if (!minDays || minDays <= 0) return records;
  const cutoff = now.getTime() + minDays * DAY_MS;
  return records.filter((record) => {
    if (!record.responseDeadline) return true;
    const deadline = Date.parse(record.responseDeadline);
    return Number.isNaN(deadline) ? true : deadline >= cutoff;
  });
}

/**
 * Scrapes government contract data from SAM.gov (open opportunities to bid
 * on) and/or USASpending.gov (past awards, for pricing research), returning
 * records normalized to a single shape.
 */
export async function scrapeContracts(
  options: ScrapeOptions
): Promise<ScrapeResult> {
  const source = options.source ?? "opportunities";
  const maxRecords = options.maxRecords ?? 100;
  const now = new Date();
  const warnings: string[] = [];
  const records: ContractRecord[] = [];
  let samTotalRecords: number | undefined;

  if (source === "opportunities" || source === "all") {
    const apiKey = options.samApiKey ?? process.env.SAM_GOV_API_KEY;
    if (!apiKey) {
      if (source === "opportunities") throw new Error(SAM_API_KEY_HELP);
      warnings.push(`Skipping SAM.gov opportunities: ${SAM_API_KEY_HELP}`);
    } else {
      const daysBack = options.daysBack ?? DEFAULT_OPPORTUNITY_DAYS_BACK;
      const client = new SamGovClient(apiKey);
      // The SAM.gov API accepts one NAICS code per query, so fan out one
      // query per code and dedupe (a notice can match several searches).
      const naicsCodes = options.naicsCodes?.length
        ? options.naicsCodes
        : [undefined];
      const collected: ContractRecord[] = [];
      const seenIds = new Set<string>();
      let totalRecords = 0;
      for (const naicsCode of naicsCodes) {
        const remaining = maxRecords - collected.length;
        if (remaining <= 0) break;
        const result = await client.search(
          {
            keywords: options.keywords,
            naicsCode,
            setAside: options.setAside,
            noticeType: options.noticeType,
            agency: options.agency,
            state: options.state,
            postedFrom: formatSamDate(
              new Date(now.getTime() - daysBack * DAY_MS)
            ),
            postedTo: formatSamDate(now),
          },
          { maxRecords: remaining }
        );
        totalRecords += result.totalRecords;
        for (const record of result.records) {
          if (!seenIds.has(record.id)) {
            seenIds.add(record.id);
            collected.push(record);
          }
        }
      }
      samTotalRecords = totalRecords;
      records.push(
        ...filterByDeadline(collected, options.minDaysUntilDeadline, now)
      );
    }
  }

  if (source === "awards" || source === "all") {
    const daysBack = options.daysBack ?? DEFAULT_AWARD_DAYS_BACK;
    const client = new UsaSpendingClient();
    const result = await client.search(
      {
        keywords: options.keywords ? [options.keywords] : undefined,
        naicsCodes: options.naicsCodes,
        agency: options.agency,
        startDate: isoDate(new Date(now.getTime() - daysBack * DAY_MS)),
        endDate: isoDate(now),
        minAmount: options.minAmount,
        maxAmount: options.maxAmount,
      },
      { maxRecords }
    );
    records.push(...result.records);
  }

  return { records, samTotalRecords, warnings };
}
