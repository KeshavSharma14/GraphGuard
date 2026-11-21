export const API_URL = process.env.NEXT_PUBLIC_API_URL || "";

export function authHeaders(token: string) {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}
