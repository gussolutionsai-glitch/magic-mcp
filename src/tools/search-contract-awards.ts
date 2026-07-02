import { z } from "zod";
import { BaseTool } from "../utils/base-tool.js";
import { scrapeContracts } from "../scraper/scraper.js";

const TOOL_NAME = "search_contract_awards";
const TOOL_DESCRIPTION = `
Search past US federal contract awards on USASpending.gov — what the
government actually paid for work.

When to use this tool:
1. Past-pricing research before bidding: find what the previous contractor
   charged for the same or similar work (that price is your ceiling; bid
   below it while keeping your margin)
2. When the user asks who has won contracts in an industry or agency, or
   what agencies spend the most in a category
3. As step two of a bid workflow, after finding an opportunity with
   search_contract_opportunities

Notes:
- No API key required
- Results are sorted by award amount, largest first
- Returns normalized JSON records with awardee, award amount, agency,
  NAICS, period of performance, and a usaspending.gov link
`.trim();

export class SearchContractAwardsTool extends BaseTool {
  name = TOOL_NAME;
  description = TOOL_DESCRIPTION;

  schema = z.object({
    keywords: z
      .string()
      .optional()
      .describe('Keywords matched against award descriptions, e.g. "landscaping"'),
    naicsCodes: z
      .array(z.string())
      .optional()
      .describe('NAICS industry codes, e.g. ["561730"]'),
    agency: z
      .string()
      .optional()
      .describe('Awarding agency name, e.g. "Department of Defense"'),
    daysBack: z
      .number()
      .optional()
      .describe("How many days back to search (default 1095 = 3 years)"),
    minAmount: z
      .number()
      .optional()
      .describe("Minimum award amount in dollars"),
    maxAmount: z
      .number()
      .optional()
      .describe(
        "Maximum award amount in dollars (350000 targets the RFQ range where no past performance is required)"
      ),
    limit: z
      .number()
      .optional()
      .describe("Max records to return, 1-100 (default 20)"),
  });

  async execute({
    keywords,
    naicsCodes,
    agency,
    daysBack,
    minAmount,
    maxAmount,
    limit,
  }: z.infer<typeof this.schema>) {
    console.log(`[${TOOL_NAME}] Searching USASpending.gov awards`);

    try {
      const result = await scrapeContracts({
        source: "awards",
        keywords,
        naicsCodes,
        agency,
        daysBack,
        minAmount,
        maxAmount,
        maxRecords: Math.min(Math.max(limit ?? 20, 1), 100),
      });

      console.log(
        `[${TOOL_NAME}] Returning ${result.records.length} awards`
      );

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                returned: result.records.length,
                awards: result.records,
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
