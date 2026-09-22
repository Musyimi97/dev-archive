export function transferRows(rows: Array<{ id: string; amount: number }>): string {
  if (!rows.length) return "No transfers yet.";
  return rows.map((row) => `${row.id} · ${row.amount}`).join("\n");
}
