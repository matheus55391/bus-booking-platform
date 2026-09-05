function apiGatewayBase() {
  return (
    process.env.API_GATEWAY_URL ??
    process.env.GATEWAY_URL ??
    process.env.NEXT_PUBLIC_API_GATEWAY_URL ??
    process.env.NEXT_PUBLIC_GATEWAY_URL ??
    "http://localhost:3001"
  );
}

export async function parseApiError(response: Response) {
  const body = await response.json().catch(() => null);
  const message =
    body?.message ||
    (typeof body === "string" ? body : null) ||
    `Erro ${response.status}`;
  return Array.isArray(message) ? message.join(", ") : String(message);
}

export function apiUrl(path: string) {
  return `${apiGatewayBase()}${path}`;
}
