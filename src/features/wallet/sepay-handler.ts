export type SePayEvent = {
  id: number;
  gateway: string;
  transactionDate: string;
  accountNumber: string;
  subAccount?: string | null;
  code: string | null;
  content: string;
  transferType: "in" | "out";
  description?: string;
  transferAmount: number;
  accumulated?: number;
  referenceCode?: string;
};

export type ProcessSePayEvent = (event: SePayEvent) => Promise<unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSePayEvent(value: unknown): value is SePayEvent {
  if (!isRecord(value)) return false;
  return (
    Number.isSafeInteger(value["id"]) &&
    (value["id"] as number) > 0 &&
    typeof value["gateway"] === "string" &&
    typeof value["transactionDate"] === "string" &&
    typeof value["accountNumber"] === "string" &&
    (value["subAccount"] === undefined ||
      value["subAccount"] === null ||
      typeof value["subAccount"] === "string") &&
    (typeof value["code"] === "string" || value["code"] === null) &&
    typeof value["content"] === "string" &&
    (value["transferType"] === "in" || value["transferType"] === "out") &&
    Number.isSafeInteger(value["transferAmount"]) &&
    (value["transferAmount"] as number) > 0 &&
    (value["description"] === undefined || typeof value["description"] === "string") &&
    (value["accumulated"] === undefined || Number.isSafeInteger(value["accumulated"])) &&
    (value["referenceCode"] === undefined || typeof value["referenceCode"] === "string")
  );
}

function constantTimeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let difference = leftBytes.length ^ rightBytes.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function jsonResponse(status: number, body: { success: boolean }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

async function readLimitedBody(request: Request, limit: number) {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}

export function createSePayWebhookHandler(
  expectedApiKey: string | undefined,
  processEvent: ProcessSePayEvent,
) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return jsonResponse(405, { success: false });
    if (!expectedApiKey) return jsonResponse(500, { success: false });

    const authorization = request.headers.get("authorization") ?? "";
    const prefix = "Apikey ";
    if (
      !authorization.startsWith(prefix) ||
      !constantTimeEqual(authorization.slice(prefix.length), expectedApiKey)
    ) {
      return jsonResponse(401, { success: false });
    }

    if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return jsonResponse(400, { success: false });
    }

    let payload: unknown;
    try {
      const body = await readLimitedBody(request, 64 * 1024);
      if (body === null) {
        return jsonResponse(413, { success: false });
      }
      payload = JSON.parse(body);
    } catch {
      return jsonResponse(400, { success: false });
    }
    if (!isSePayEvent(payload)) return jsonResponse(400, { success: false });

    try {
      await processEvent(payload);
      return jsonResponse(200, { success: true });
    } catch {
      return jsonResponse(500, { success: false });
    }
  };
}
