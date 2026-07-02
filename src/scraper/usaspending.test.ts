import {
  buildAwardSearchPayload,
  normalizeAwardResult,
} from "./usaspending.js";

describe("buildAwardSearchPayload", () => {
  const baseFilters = { startDate: "2023-07-01", endDate: "2026-07-01" };

  it("always restricts to contract award types and the time period", () => {
    const payload = buildAwardSearchPayload(baseFilters, 1, 100) as any;
    expect(payload.filters.award_type_codes).toEqual(["A", "B", "C", "D"]);
    expect(payload.filters.time_period).toEqual([
      { start_date: "2023-07-01", end_date: "2026-07-01" },
    ]);
    expect(payload.page).toBe(1);
    expect(payload.limit).toBe(100);
    expect(payload.sort).toBe("Award Amount");
    expect(payload.subawards).toBe(false);
  });

  it("maps optional filters onto the USASpending filter names", () => {
    const payload = buildAwardSearchPayload(
      {
        ...baseFilters,
        keywords: ["hazardous waste"],
        naicsCodes: ["562112"],
        agency: "Department of Veterans Affairs",
        minAmount: 10000,
        maxAmount: 350000,
      },
      2,
      50
    ) as any;
    expect(payload.filters.keywords).toEqual(["hazardous waste"]);
    expect(payload.filters.naics_codes).toEqual(["562112"]);
    expect(payload.filters.agencies).toEqual([
      {
        type: "awarding",
        tier: "toptier",
        name: "Department of Veterans Affairs",
      },
    ]);
    expect(payload.filters.award_amounts).toEqual([
      { lower_bound: 10000, upper_bound: 350000 },
    ]);
  });

  it("omits unset filters and supports one-sided amount bounds", () => {
    const payload = buildAwardSearchPayload(
      { ...baseFilters, maxAmount: 350000 },
      1,
      10
    ) as any;
    expect(payload.filters.keywords).toBeUndefined();
    expect(payload.filters.naics_codes).toBeUndefined();
    expect(payload.filters.agencies).toBeUndefined();
    expect(payload.filters.award_amounts).toEqual([{ upper_bound: 350000 }]);
  });
});

describe("normalizeAwardResult", () => {
  it("maps award fields to the normalized record shape", () => {
    const record = normalizeAwardResult({
      "Award ID": "W912PP23C0011",
      "Recipient Name": "ACME LANDSCAPING LLC",
      Description: "GROUNDS MAINTENANCE",
      "Start Date": "2023-10-01",
      "End Date": "2028-09-30",
      "Award Amount": 1600000,
      "Awarding Agency": "Department of Defense",
      "Awarding Sub Agency": "Department of the Army",
      "Contract Award Type": "DEFINITIVE CONTRACT",
      NAICS: "561730",
      "Place of Performance State Code": "CO",
      generated_internal_id: "CONT_AWD_123",
    });
    expect(record).toEqual({
      source: "usaspending.gov",
      id: "W912PP23C0011",
      title: "GROUNDS MAINTENANCE",
      type: "DEFINITIVE CONTRACT",
      agency: "Department of Defense",
      subAgency: "Department of the Army",
      naicsCode: "561730",
      startDate: "2023-10-01",
      endDate: "2028-09-30",
      awardAmount: 1600000,
      awardee: "ACME LANDSCAPING LLC",
      placeOfPerformance: "CO",
      url: "https://www.usaspending.gov/award/CONT_AWD_123",
    });
  });

  it("handles NAICS returned as an object and missing fields", () => {
    const record = normalizeAwardResult({
      "Award ID": "ABC",
      NAICS: { code: "722310" },
    });
    expect(record.naicsCode).toBe("722310");
    expect(record.title).toBe("(no description)");
    expect(record.url).toBeUndefined();
    expect(record.awardAmount).toBeUndefined();
  });

  it("falls back to the internal id when Award ID is missing", () => {
    const record = normalizeAwardResult({
      generated_internal_id: "CONT_AWD_456",
    });
    expect(record.id).toBe("CONT_AWD_456");
  });
});
