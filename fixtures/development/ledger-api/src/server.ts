import Fastify from "fastify";
import { recordTransfer, settleBatch } from "./ledger.ts";
import { verifyWebhook } from "./webhooks.ts";

const app = Fastify();

app.post("/transfers", async (request) => {
  return recordTransfer(request.body);
});

app.post("/webhooks/stripe", async (request) => {
  verifyWebhook(String(request.headers["stripe-signature"] ?? ""), process.env.LEDGER_WEBHOOK_SECRET);
  return { ok: true };
});

app.post("/settlements", async () => settleBatch());

app.listen({ port: Number(process.env.PORT || 4010), host: "127.0.0.1" });
