#!/usr/bin/env node

import { parseArgs } from "node:util";
import { promises as fs } from "fs";
import { scrapeContracts, ScrapeSource } from "./scraper.js";
import { toCsv } from "./csv.js";

const HELP = `
gov-contract-scraper — scrape US government contract data

Sources:
  opportunities   Open solicitations on SAM.gov (requires SAM_GOV_API_KEY)
  awards          Past contract awards on USASpending.gov (no key needed;
                  use this for past-pricing research before you bid)
  all             Both

Usage:
  node dist/scraper/cli.js [options]

Options:
  --source <opportunities|awards|all>  Data source (default: opportunities)
  --keywords <text>          Keyword search (title / award description)
  --naics <code[,code...]>   NAICS codes, e.g. 561730,562112,722310
  --set-aside <code>         SBA, 8A, WOSB, SDVOSBC, HZC, ...
  --notice-type <code>       o=solicitation p=presolicitation k=combined
                             r=sources sought s=special a=award notice
  --agency <name>            e.g. "Department of Defense"
  --state <XX>               Place-of-performance state (opportunities)
  --days <n>                 Lookback window in days
                             (default: 30 opportunities, 1095 awards)
  --min-deadline-days <n>    Skip opportunities closing sooner than n days
  --min-amount <n>           Minimum award amount in dollars (awards)
  --max-amount <n>           Maximum award amount in dollars (awards)
  --max <n>                  Max records per source (default: 100)
  --format <json|csv>        Output format (default: json)
  --out <file>               Write to file instead of stdout
  --sam-api-key <key>        SAM.gov API key (or set SAM_GOV_API_KEY)
  --help                     Show this help

Examples:
  # Small-business landscaping solicitations posted in the last 30 days
  node dist/scraper/cli.js --naics 561730 --set-aside SBA --min-deadline-days 14

  # What did the government pay for similar work before? (pricing research)
  node dist/scraper/cli.js --source awards --keywords "hazardous waste" \\
    --state CO --max-amount 350000 --format csv --out past-pricing.csv
`.trim();

function parseNumber(value: string | undefined, flag: string): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${flag}: "${value}"`);
  }
  return parsed;
}

export async function main(argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      source: { type: "string", default: "opportunities" },
      keywords: { type: "string" },
      naics: { type: "string" },
      "set-aside": { type: "string" },
      "notice-type": { type: "string" },
      agency: { type: "string" },
      state: { type: "string" },
      days: { type: "string" },
      "min-deadline-days": { type: "string" },
      "min-amount": { type: "string" },
      "max-amount": { type: "string" },
      max: { type: "string" },
      format: { type: "string", default: "json" },
      out: { type: "string" },
      "sam-api-key": { type: "string" },
      help: { type: "boolean", default: false },
    },
  });

  if (values.help) {
    console.log(HELP);
    return;
  }

  const source = values.source as ScrapeSource;
  if (!["opportunities", "awards", "all"].includes(source)) {
    throw new Error(`Invalid --source: "${values.source}". ${HELP}`);
  }
  const format = values.format as string;
  if (!["json", "csv"].includes(format)) {
    throw new Error(`Invalid --format: "${values.format}" (json or csv)`);
  }

  const result = await scrapeContracts({
    source,
    keywords: values.keywords,
    naicsCodes: values.naics?.split(",").map((code) => code.trim()),
    setAside: values["set-aside"],
    noticeType: values["notice-type"],
    agency: values.agency,
    state: values.state,
    daysBack: parseNumber(values.days, "--days"),
    minDaysUntilDeadline: parseNumber(
      values["min-deadline-days"],
      "--min-deadline-days"
    ),
    minAmount: parseNumber(values["min-amount"], "--min-amount"),
    maxAmount: parseNumber(values["max-amount"], "--max-amount"),
    maxRecords: parseNumber(values.max, "--max"),
    samApiKey: values["sam-api-key"],
  });

  for (const warning of result.warnings) {
    console.error(`[gov-scraper] Warning: ${warning}`);
  }

  const output =
    format === "csv"
      ? toCsv(result.records)
      : JSON.stringify(result.records, null, 2);

  if (values.out) {
    await fs.writeFile(values.out, output, "utf-8");
    console.error(
      `[gov-scraper] Wrote ${result.records.length} records to ${values.out}`
    );
  } else {
    console.log(output);
  }

  if (result.samTotalRecords !== undefined) {
    console.error(
      `[gov-scraper] SAM.gov reported ${result.samTotalRecords} total matching opportunities`
    );
  }
}

main(process.argv.slice(2)).catch((error) => {
  console.error(
    `[gov-scraper] ${error instanceof Error ? error.message : error}`
  );
  process.exit(1);
});
