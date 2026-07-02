import { ContractRecord } from "./types.js";

export const CSV_COLUMNS: (keyof ContractRecord)[] = [
  "source",
  "id",
  "title",
  "type",
  "agency",
  "subAgency",
  "solicitationNumber",
  "naicsCode",
  "setAside",
  "postedDate",
  "responseDeadline",
  "startDate",
  "endDate",
  "awardDate",
  "awardAmount",
  "awardee",
  "placeOfPerformance",
  "active",
  "url",
];

function escapeCsvField(value: unknown): string {
  if (value === undefined || value === null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(records: ContractRecord[]): string {
  const header = CSV_COLUMNS.join(",");
  const rows = records.map((record) =>
    CSV_COLUMNS.map((column) => escapeCsvField(record[column])).join(",")
  );
  return [header, ...rows].join("\n");
}
