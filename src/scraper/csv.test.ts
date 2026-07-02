import { toCsv, CSV_COLUMNS } from "./csv.js";
import { ContractRecord } from "./types.js";

describe("toCsv", () => {
  it("emits only the header for an empty record set", () => {
    expect(toCsv([])).toBe(CSV_COLUMNS.join(","));
  });

  it("serializes records and leaves missing fields empty", () => {
    const record: ContractRecord = {
      source: "sam.gov",
      id: "abc123",
      title: "Grounds Maintenance",
      agency: "DEPT OF DEFENSE",
      awardAmount: 962000,
      active: true,
    };
    const [header, row] = toCsv([record]).split("\n");
    expect(header.split(",").length).toBe(CSV_COLUMNS.length);
    const cells = row.split(",");
    expect(cells[CSV_COLUMNS.indexOf("source")]).toBe("sam.gov");
    expect(cells[CSV_COLUMNS.indexOf("title")]).toBe("Grounds Maintenance");
    expect(cells[CSV_COLUMNS.indexOf("awardAmount")]).toBe("962000");
    expect(cells[CSV_COLUMNS.indexOf("active")]).toBe("true");
    expect(cells[CSV_COLUMNS.indexOf("awardee")]).toBe("");
  });

  it("quotes and escapes fields containing commas, quotes, and newlines", () => {
    const record: ContractRecord = {
      source: "usaspending.gov",
      id: "x",
      title: 'Mowing, edging and "misc" work\nPhase 2',
    };
    const row = toCsv([record]).split("\n").slice(1).join("\n");
    expect(row).toContain('"Mowing, edging and ""misc"" work\nPhase 2"');
  });
});
