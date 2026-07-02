/**
 * A single government contract record, normalized across data sources so
 * results from SAM.gov (opportunities) and USASpending.gov (awards) can be
 * merged, filtered, and exported together.
 */
export interface ContractRecord {
  source: "sam.gov" | "usaspending.gov";
  id: string;
  title: string;
  type?: string;
  agency?: string;
  subAgency?: string;
  solicitationNumber?: string;
  naicsCode?: string;
  setAside?: string;
  postedDate?: string;
  responseDeadline?: string;
  startDate?: string;
  endDate?: string;
  awardDate?: string;
  awardAmount?: number;
  awardee?: string;
  placeOfPerformance?: string;
  active?: boolean;
  url?: string;
}

/** Filters for SAM.gov contract opportunity searches. */
export interface OpportunityFilters {
  /** Free-text keywords matched against the opportunity title. */
  keywords?: string;
  /** 6-digit NAICS industry code, e.g. "541511". */
  naicsCode?: string;
  /** Set-aside code, e.g. "SBA", "8A", "WOSB", "SDVOSBC", "HZC". */
  setAside?: string;
  /**
   * Notice type code: o = solicitation, p = presolicitation,
   * k = combined synopsis/solicitation, a = award notice,
   * r = sources sought, s = special notice.
   */
  noticeType?: string;
  /** Contracting agency/organization name, e.g. "Department of Defense". */
  agency?: string;
  /** Two-letter place-of-performance state code, e.g. "TX". */
  state?: string;
  /** Start of posted-date window, MM/dd/yyyy (required by the API). */
  postedFrom: string;
  /** End of posted-date window, MM/dd/yyyy (required by the API). */
  postedTo: string;
}

/** Filters for USASpending.gov awarded-contract searches. */
export interface AwardFilters {
  /** Keywords matched against award descriptions and recipients. */
  keywords?: string[];
  /** NAICS industry codes, e.g. ["541511"]. */
  naicsCodes?: string[];
  /** Awarding top-tier agency name, e.g. "Department of Defense". */
  agency?: string;
  /** Start of the award period-of-performance window, yyyy-MM-dd. */
  startDate: string;
  /** End of the award period-of-performance window, yyyy-MM-dd. */
  endDate: string;
  /** Minimum award amount in dollars. */
  minAmount?: number;
  /** Maximum award amount in dollars. */
  maxAmount?: number;
}
