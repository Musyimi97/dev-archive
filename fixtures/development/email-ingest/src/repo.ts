export type InboundEmail = {
  message_id: string;
  subject: string;
};

export function insertInboundEmail(messageId: string, subject: string): InboundEmail {
  if (!messageId) throw new Error("message_id required");
  return { message_id: messageId, subject };
}
