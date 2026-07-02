import { fetchJson, sleep } from "./http.js";
import { AwardFilters, ContractRecord } from "./types.js";

export const USASPENDING_API_BASE = "https://api.usaspending.gov";
const AWARD_SEARCH_ENDPOINT = "/api/v2/search/spending_by_award/";

// A, B, C, D are the contract award types (definitive contracts, purchase
// orders, delivery orders, BPA calls) — i.e. procurement, not grants/loans.
const CONTRACT_AWARD_TYPE_CODES = ["A", "B", "C", "D"];

const MAX_PAGE_SIZE = 100;
const PAGE_DELAY_MS = 250;

export const AWARD_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Description",
  "Start Date",
  "End Date",
  "Award Amount",
  "Awarding Agency",
  "Awarding Sub Agency",
  "Contract Award Type",
  "NAICS",
  "Place of Performance State Code",
  "generated_internal_id",
];

export interface AwardResult {
  "Award ID"?: string | null;
  "Recipient Name"?: string | null;
  Description?: string | null;
  "Start Date"?: string | null;
  "End Date"?: string | null;
  "Award Amount"?: number | null;
  "Awarding Agency"?: string | null;
  "Awarding Sub Agency"?: string | null;
  "Contract Award Type"?: string | null;
  NAICS?: string | { code?: string | null } | null;
  "Place of Performance State Code"?: string | null;
  generated_internal_id?: string | null;
}

export interface AwardSearchResponse {
  results?: AwardResult[];
  page_metadata?: { page?: number; hasNext?: boolean };
}

/** Builds the POST payload for the USASpending spending_by_award endpoint. */
export function buildAwardSearchPayload(
  filters: AwardFilters,
  page: number,
  limit: number
): Record<string, unknown> {
  const awardFilters: Record<string, unknown> = {
    award_type_codes: CONTRACT_AWARD_TYPE_CODES,
    time_period: [
      { start_date: filters.startDate, end_date: filters.endDate },
    ],
  };
  if (filters.keywords?.length) {
    awardFilters.keywords = filters.keywords;
  }
  if (filters.naicsCodes?.length) {
    awardFilters.naics_codes = filters.naicsCodes;
  }
  if (filters.agency) {
    awardFilters.agencies = [
      { type: "awarding", tier: "toptier", name: filters.agency },
    ];
  }
  if (filters.minAmount !== undefined || filters.maxAmount !== undefined) {
    awardFilters.award_amounts = [
      {
        ...(filters.minAmount !== undefined
          ? { lower_bound: filters.minAmount }
          : {}),
        ...(filters.maxAmount !== undefined
          ? { upper_bound: filters.maxAmount }
          : {}),
      },
    ];
  }

  return {
    filters: awardFilters,
    fields: AWARD_FIELDS,
    page,
    limit,
    sort: "Award Amount",
    order: "desc",
    subawards: false,
  };
}

export function normalizeAwardResult(result: AwardResult): ContractRecord {
  const naics =
    typeof result.NAICS === "object" && result.NAICS !== null
      ? result.NAICS.code
      : result.NAICS;
  const internalId = result.generated_internal_id;
  const amount = result["Award Amount"];

  return {
    source: "usaspending.gov",
    id: String(result["Award ID"] ?? internalId ?? ""),
    title: result.Description || "(no description)",
    type: result["Contract Award Type"] ?? undefined,
    agency: result["Awarding Agency"] ?? undefined,
    subAgency: result["Awarding Sub Agency"] ?? undefined,
    naicsCode: naics ?? undefined,
    startDate: result["Start Date"] ?? undefined,
    endDate: result["End Date"] ?? undefined,
    awardAmount: typeof amount === "number" ? amount : undefined,
    awardee: result["Recipient Name"] ?? undefined,
    placeOfPerformance:
      result["Place of Performance State Code"] ?? undefined,
    url: internalId
      ? `https://www.usaspending.gov/award/${internalId}`
      : undefined,
  };
}

/**
 * Client for the USASpending.gov award search API — the public record of
 * what the government actually paid on past contracts. No API key required.
 * The primary use here is past-pricing research: find what the previous
 * contractor charged for the same work before you price a bid.
 */
export class UsaSpendingClient {
  async search(
    filters: AwardFilters,
    options: { maxRecords?: number } = {}
  ): Promise<{ records: ContractRecord[] }> {
    const maxRecords = options.maxRecords ?? 100;
    const records: ContractRecord[] = [];
    let page = 1;

    while (records.length < maxRecords) {
      const limit = Math.min(maxRecords - records.length, MAX_PAGE_SIZE);
      const payload = buildAwardSearchPayload(filters, page, limit);

      const response = await fetchJson<AwardSearchResponse>(
        `${USASPENDING_API_BASE}${AWARD_SEARCH_ENDPOINT}`,
        { method: "POST", body: payload }
      );

      const results = response.results ?? [];
      records.push(...results.map(normalizeAwardResult));

      if (results.length < limit || !response.page_metadata?.hasNext) break;
      page += 1;
      await sleep(PAGE_DELAY_MS);
    }

    return { records };
  }
}
