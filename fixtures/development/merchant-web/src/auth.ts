export async function refreshSession(token: string): Promise<string> {
  if (!token) throw new Error("missing refresh token");
  return `session_${token.slice(0, 6)}`;
}

export function isExpired(exp: number): boolean {
  return Date.now() / 1000 > exp;
}
