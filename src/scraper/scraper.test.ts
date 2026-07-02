import { filterByDeadline, scrapeContracts } from "./scraper.js";
import { ContractRecord } from "./types.js";

function record(responseDeadline?: string): ContractRecord {
  return { source: "sam.gov", id: "x", title: "Test", responseDeadline };
}

describe("filterByDeadline", () => {
  const now = new Date("2026-07-01T00:00:00Z");

  it("returns all records when no minimum is set", () => {
    const records = [record("2026-07-02"), record()];
    expect(filterByDeadline(records, undefined, now)).toEqual(records);
    expect(filterByDeadline(records, 0, now)).toEqual(records);
  });

  it("drops opportunities closing sooner than the minimum", () => {
    const closingSoon = record("2026-07-05T17:00:00Z");
    const enoughTime = record("2026-07-20T17:00:00Z");
    expect(filterByDeadline([closingSoon, enoughTime], 14, now)).toEqual([
      enoughTime,
    ]);
  });

  it("keeps records with missing or unparseable deadlines", () => {
    const missing = record();
    const garbage = record("TBD");
    expect(filterByDeadline([missing, garbage], 14, now)).toEqual([
      missing,
      garbage,
    ]);
  });
});

describe("scrapeContracts with multiple NAICS codes", () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("queries SAM.gov once per NAICS code and dedupes the results", async () => {
    const requestedCodes: (string | null)[] = [];
    global.fetch = (async (url: RequestInfo | URL) => {
      const ncode = new URL(String(url)).searchParams.get("ncode");
      requestedCodes.push(ncode);
      const opportunitiesData =
        ncode === "561730"
          ? [
              { noticeId: "a", title: "Landscaping A" },
              { noticeId: "shared", title: "Shared Notice" },
            ]
          : [
              { noticeId: "b", title: "Waste B" },
              { noticeId: "shared", title: "Shared Notice" },
            ];
      return new Response(
        JSON.stringify({ totalRecords: 2, opportunitiesData }),
        { status: 200 }
      );
    }) as typeof fetch;

    const result = await scrapeContracts({
      source: "opportunities",
      naicsCodes: ["561730", "562112"],
      samApiKey: "test-key",
    });

    expect(requestedCodes).toEqual(["561730", "562112"]);
    expect(result.records.map((r) => r.id).sort()).toEqual([
      "a",
      "b",
      "shared",
    ]);
    expect(result.samTotalRecords).toBe(4);
  });
});
