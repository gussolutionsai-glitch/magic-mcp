import {
  buildSamSearchParams,
  formatSamDate,
  normalizeSamOpportunity,
  SamOpportunity,
} from "./sam-gov.js";

describe("formatSamDate", () => {
  it("formats dates as MM/dd/yyyy", () => {
    expect(formatSamDate(new Date(Date.UTC(2026, 0, 5)))).toBe("01/05/2026");
    expect(formatSamDate(new Date(Date.UTC(2026, 11, 31)))).toBe("12/31/2026");
  });
});

describe("buildSamSearchParams", () => {
  it("always includes the required posted-date window and paging", () => {
    const params = buildSamSearchParams(
      { postedFrom: "06/01/2026", postedTo: "07/01/2026" },
      50,
      100
    );
    expect(params.get("postedFrom")).toBe("06/01/2026");
    expect(params.get("postedTo")).toBe("07/01/2026");
    expect(params.get("limit")).toBe("50");
    expect(params.get("offset")).toBe("100");
    expect(params.get("api_key")).toBeNull();
  });

  it("maps optional filters onto SAM.gov parameter names", () => {
    const params = buildSamSearchParams(
      {
        postedFrom: "06/01/2026",
        postedTo: "07/01/2026",
        keywords: "landscaping",
        naicsCode: "561730",
        setAside: "SBA",
        noticeType: "o",
        state: "CO",
        agency: "Department of Defense",
      },
      10,
      0
    );
    expect(params.get("title")).toBe("landscaping");
    expect(params.get("ncode")).toBe("561730");
    expect(params.get("typeOfSetAside")).toBe("SBA");
    expect(params.get("ptype")).toBe("o");
    expect(params.get("state")).toBe("CO");
    expect(params.get("organizationName")).toBe("Department of Defense");
  });

  it("omits parameters for unset filters", () => {
    const params = buildSamSearchParams(
      { postedFrom: "06/01/2026", postedTo: "07/01/2026" },
      10,
      0
    );
    expect(params.has("title")).toBe(false);
    expect(params.has("ncode")).toBe(false);
    expect(params.has("typeOfSetAside")).toBe(false);
  });
});

describe("normalizeSamOpportunity", () => {
  const opportunity: SamOpportunity = {
    noticeId: "abc123",
    title: "Grounds Maintenance Services",
    solicitationNumber: "W912PP26R0001",
    fullParentPathName: "DEPT OF DEFENSE.DEPT OF THE ARMY.AMC",
    postedDate: "2026-06-15",
    type: "Solicitation",
    typeOfSetAside: "SBA",
    typeOfSetAsideDescription: "Total Small Business Set-Aside",
    responseDeadLine: "2026-07-20T14:00:00-06:00",
    naicsCode: "561730",
    active: "Yes",
    placeOfPerformance: {
      city: { name: "Denver" },
      state: { code: "CO", name: "Colorado" },
    },
    uiLink: "https://sam.gov/opp/abc123/view",
  };

  it("maps opportunity fields to the normalized record shape", () => {
    const record = normalizeSamOpportunity(opportunity);
    expect(record).toEqual({
      source: "sam.gov",
      id: "abc123",
      title: "Grounds Maintenance Services",
      type: "Solicitation",
      agency: "DEPT OF DEFENSE",
      subAgency: "DEPT OF THE ARMY",
      solicitationNumber: "W912PP26R0001",
      naicsCode: "561730",
      setAside: "Total Small Business Set-Aside",
      postedDate: "2026-06-15",
      responseDeadline: "2026-07-20T14:00:00-06:00",
      awardDate: undefined,
      awardAmount: undefined,
      awardee: undefined,
      placeOfPerformance: "Denver, CO",
      active: true,
      url: "https://sam.gov/opp/abc123/view",
    });
  });

  it("extracts award details from award notices", () => {
    const record = normalizeSamOpportunity({
      ...opportunity,
      type: "Award Notice",
      active: "No",
      award: {
        date: "2026-05-01",
        amount: "962000",
        awardee: { name: "Acme Landscaping LLC" },
      },
    });
    expect(record.awardAmount).toBe(962000);
    expect(record.awardee).toBe("Acme Landscaping LLC");
    expect(record.awardDate).toBe("2026-05-01");
    expect(record.active).toBe(false);
  });

  it("tolerates sparse records", () => {
    const record = normalizeSamOpportunity({
      noticeId: "sparse",
      title: "Sparse Notice",
      award: { amount: "not-a-number" },
    });
    expect(record.agency).toBeUndefined();
    expect(record.placeOfPerformance).toBeUndefined();
    expect(record.awardAmount).toBeUndefined();
    expect(record.active).toBeUndefined();
  });
});
