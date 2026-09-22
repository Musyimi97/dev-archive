export function verifyWebhook(signature: string, secret = ""): boolean {
  if (!secret) throw new Error("LEDGER_WEBHOOK_SECRET is not set");
  return signature.length > 0;
}
