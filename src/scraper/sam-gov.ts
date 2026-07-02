import { fetchJson, sleep } from "./http.js";
import { ContractRecord, OpportunityFilters } from "./types.js";

export const SAM_API_BASE = "https://api.sam.gov/opportunities/v2/search";

// The API allows up to 1000 records per request. Personal API keys have a
// small daily request quota, so fewer, larger pages is the polite shape.
const MAX_PAGE_SIZE = 1000;
const PAGE_DELAY_MS = 1000;

export interface SamOpportunity {
  noticeId: string;
  title: string;
  solicitationNumber?: string | null;
  fullParentPathName?: string | null;
  postedDate?: string | null;
  type?: string | null;
  typeOfSetAside?: string | null;
  typeOfSetAsideDescription?: string | null;
  responseDeadLine?: string | null;
  naicsCode?: string | null;
  active?: string | null;
  award?: {
    date?: string | null;
    number?: string | null;
    amount?: string | null;
    awardee?: { name?: string | null } | null;
  } | null;
  placeOfPerformance?: {
    city?: { name?: string | null } | null;
    state?: { code?: string | null; name?: string | null } | null;
  } | null;
  uiLink?: string | null;
}

export interface SamSearchResponse {
  totalRecords?: number;
  limit?: number;
  offset?: number;
  opportunitiesData?: SamOpportunity[];
}

/** Formats a date as MM/dd/yyyy, the format the SAM.gov API requires. */
export function formatSamDate(date: Date): string {
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${month}/${day}/${date.getUTCFullYear()}`;
}

/**
 * Maps our filters onto SAM.gov query parameters. The API key is appended
 * separately by the client so this stays a pure, testable function.
 */
export function buildSamSearchParams(
  filters: OpportunityFilters,
  limit: number,
  offset: number
): URLSearchParams {
  const params = new URLSearchParams({
    postedFrom: filters.postedFrom,
    postedTo: filters.postedTo,
    limit: String(limit),
    offset: String(offset),
  });
  if (filters.keywords) params.set("title", filters.keywords);
  if (filters.naicsCode) params.set("ncode", filters.naicsCode);
  if (filters.setAside) params.set("typeOfSetAside", filters.setAside);
  if (filters.noticeType) params.set("ptype", filters.noticeType);
  if (filters.state) params.set("state", filters.state);
  if (filters.agency) params.set("organizationName", filters.agency);
  return params;
}

export function normalizeSamOpportunity(
  opportunity: SamOpportunity
): ContractRecord {
  // fullParentPathName is a dot-separated org path, e.g.
  // "DEPT OF DEFENSE.DEPT OF THE ARMY.AMC.ACC"
  const orgPath = (opportunity.fullParentPathName ?? "")
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  const place = opportunity.placeOfPerformance;
  const placeParts = [
    place?.city?.name,
    place?.state?.code ?? place?.state?.name,
  ].filter(Boolean);

  const awardAmount = Number(opportunity.award?.amount);

  return {
    source: "sam.gov",
    id: opportunity.noticeId,
    title: opportunity.title,
    type: opportunity.type ?? undefined,
    agency: orgPath[0],
    subAgency: orgPath[1],
    solicitationNumber: opportunity.solicitationNumber ?? undefined,
    naicsCode: opportunity.naicsCode ?? undefined,
    setAside:
      opportunity.typeOfSetAsideDescription ??
      opportunity.typeOfSetAside ??
      undefined,
    postedDate: opportunity.postedDate ?? undefined,
    responseDeadline: opportunity.responseDeadLine ?? undefined,
    awardDate: opportunity.award?.date ?? undefined,
    awardAmount: Number.isFinite(awardAmount) ? awardAmount : undefined,
    awardee: opportunity.award?.awardee?.name ?? undefined,
    placeOfPerformance:
      placeParts.length > 0 ? placeParts.join(", ") : undefined,
    active:
      opportunity.active != null
        ? opportunity.active.toLowerCase() === "yes"
        : undefined,
    url: opportunity.uiLink ?? undefined,
  };
}

/**
 * Client for the SAM.gov Get Opportunities API — the federal government's
 * public feed of contract solicitations. Requires a free API key from your
 * SAM.gov account (Account Details -> Public API Key).
 */
export class SamGovClient {
  constructor(private readonly apiKey: string) {}

  async search(
    filters: OpportunityFilters,
    options: { maxRecords?: number } = {}
  ): Promise<{ records: ContractRecord[]; totalRecords: number }> {
    const maxRecords = options.maxRecords ?? 100;
    const records: ContractRecord[] = [];
    let totalRecords = 0;
    let offset = 0;

    while (records.length < maxRecords) {
      const limit = Math.min(maxRecords - records.length, MAX_PAGE_SIZE);
      const params = buildSamSearchParams(filters, limit, offset);
      params.set("api_key", this.apiKey);

      const response = await fetchJson<SamSearchResponse>(
        `${SAM_API_BASE}?${params.toString()}`
      );

      totalRecords = response.totalRecords ?? 0;
      const page = response.opportunitiesData ?? [];
      records.push(...page.map(normalizeSamOpportunity));
      offset += page.length;

      if (page.length < limit || offset >= totalRecords) break;
      await sleep(PAGE_DELAY_MS);
    }

    return { records, totalRecords };
  }
}
