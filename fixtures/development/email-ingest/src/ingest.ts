import Fastify from "fastify";
import { insertInboundEmail } from "./repo.ts";

const app = Fastify();

app.post("/integrations/email-ingest", async (request, reply) => {
  const key = String(request.headers["x-integration-key"] ?? "");
  if (key !== process.env.ENZI_WEBHOOK_SECRET) {
    return reply.code(401).send({ error: "unauthorized" });
  }
  const body = request.body as { message_id?: string; subject?: string };
  return insertInboundEmail(body.message_id ?? "", body.subject ?? "");
});

app.listen({ port: 4044, host: "127.0.0.1" });
