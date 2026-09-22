export type Transfer = {
  id: string;
  amount: number;
  currency: string;
};

export function recordTransfer(input: unknown): Transfer {
  const body = input as Transfer;
  return { id: body.id ?? "tx_new", amount: body.amount ?? 0, currency: body.currency ?? "KES" };
}

export function settleBatch(): { settled: number } {
  return { settled: 0 };
}
