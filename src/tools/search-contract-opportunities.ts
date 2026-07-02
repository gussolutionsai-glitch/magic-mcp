import { z } from "zod";
import { BaseTool } from "../utils/base-tool.js";
import {
  scrapeContracts,
  SAM_API_KEY_HELP,
} from "../scraper/scraper.js";

const TOOL_NAME = "search_contract_opportunities";
const TOOL_DESCRIPTION = `
Search open US federal contract opportunities (solicitations) on SAM.gov.

When to use this tool:
1. When the user wants to find government contracts to bid on
2. When the user asks what solicitations are open in an industry (NAICS),
   state, or agency, or under a small-business set-aside
3. As step one of a bid workflow: find an opportunity here, then research
   past pricing with search_contract_awards before pricing a proposal

Notes:
- Requires a free SAM.gov API key in the SAM_GOV_API_KEY environment
  variable (sam.gov -> Account Details -> Public API Key)
- Useful starter NAICS codes: 561730 landscaping, 562112 hazardous waste
  collection, 722310 food service contractors, 812990 personal services
- Set-aside codes: SBA (total small business), 8A, WOSB, SDVOSBC, HZC
- Returns normalized JSON records with title, agency, NAICS, set-aside,
  response deadline, and a sam.gov link
`.trim();

export class SearchContractOpportunitiesTool extends BaseTool {
  name = TOOL_NAME;
  description = TOOL_DESCRIPTION;

  schema = z.object({
    keywords: z
      .string()
      .optional()
      .describe("Keywords matched against opportunity titles"),
    naicsCode: z
      .string()
      .optional()
      .describe("6-digit NAICS industry code, e.g. 561730"),
    setAside: z
      .string()
      .optional()
      .describe("Set-aside code: SBA, 8A, WOSB, SDVOSBC, HZC, ..."),
    noticeType: z
      .string()
      .optional()
      .describe(
        "Notice type: o=solicitation, p=presolicitation, k=combined synopsis/solicitation, r=sources sought, s=special notice, a=award notice"
      ),
    agency: z
      .string()
      .optional()
      .describe('Agency name, e.g. "Department of Defense"'),
    state: z
      .string()
      .optional()
      .describe("Two-letter place-of-performance state code, e.g. TX"),
    daysBack: z
      .number()
      .optional()
      .describe("How many days back to search posted notices (default 30)"),
    minDaysUntilDeadline: z
      .number()
      .optional()
      .describe(
        "Skip opportunities whose response deadline is closer than this many days (14 leaves time to gather subcontractor quotes)"
      ),
    limit: z
      .number()
      .optional()
      .describe("Max records to return, 1-100 (default 20)"),
  });

  async execute({
    keywords,
    naicsCode,
    setAside,
    noticeType,
    agency,
    state,
    daysBack,
    minDaysUntilDeadline,
    limit,
  }: z.infer<typeof this.schema>) {
    console.log(`[${TOOL_NAME}] Searching SAM.gov opportunities`);

    if (!process.env.SAM_GOV_API_KEY) {
      return {
        content: [{ type: "text" as const, text: SAM_API_KEY_HELP }],
      };
    }

    try {
      const result = await scrapeContracts({
        source: "opportunities",
        keywords,
        naicsCodes: naicsCode ? [naicsCode] : undefined,
        setAside,
        noticeType,
        agency,
        state,
        daysBack,
        minDaysUntilDeadline,
        maxRecords: Math.min(Math.max(limit ?? 20, 1), 100),
      });

      console.log(
        `[${TOOL_NAME}] Returning ${result.records.length} of ${
          result.samTotalRecords ?? "?"
        } matching opportunities`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                totalMatching: result.samTotalRecords,
                returned: result.records.length,
                opportunities: result.records,
              },
              null,
              2
            ),
          },
        ],
      };
    } catch (error) {
      console.error(`[${TOOL_NAME}] Error:`, error);
      throw error;
    }
  }
}
