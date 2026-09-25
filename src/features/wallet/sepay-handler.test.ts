import { describe, expect, it, vi } from "vitest";
import { createSePayWebhookHandler, type SePayEvent } from "./sepay-handler";

const validEvent: SePayEvent = {
  id: 92704,
  gateway: "Vietcombank",
  transactionDate: "2026-09-25 11:08:33",
  accountNumber: "TEST-ACCOUNT",
  subAccount: "",
  code: "DRAGON123456789ABC",
  content: "DRAGON123456789ABC nap xu",
  transferType: "in",
  description: "test transaction",
  transferAmount: 100000,
  accumulated: 100000,
  referenceCode: "FT-TEST-001",
};

function post(event: unknown, authorization = "Apikey test-api-key") {
  return new Request("https://example.test/sepay-webhook", {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify(event),
  });
}

describe("SePay webhook handler", () => {
  it("processes a valid authenticated incoming event and responds with SePay's success body", async () => {
    const processEvent = vi.fn().mockResolvedValue({ credited: true });
    const handler = createSePayWebhookHandler("test-api-key", processEvent);
    const response = await handler(post(validEvent));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(processEvent).toHaveBeenCalledWith(validEvent);
  });

  it("rejects a bad API key without forwarding the event", async () => {
    const processEvent = vi.fn();
    const handler = createSePayWebhookHandler("test-api-key", processEvent);
    const response = await handler(post(validEvent, "Apikey wrong-key"));

    expect(response.status).toBe(401);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("returns 400 for malformed or incomplete event data", async () => {
    const processEvent = vi.fn();
    const handler = createSePayWebhookHandler("test-api-key", processEvent);
    const incomplete = { ...validEvent, transferAmount: undefined };
    const response = await handler(post(incomplete));

    expect(response.status).toBe(400);
    expect(processEvent).not.toHaveBeenCalled();
  });

  it("rejects oversized webhook bodies before parsing them", async () => {
    const handler = createSePayWebhookHandler("test-api-key", vi.fn());
    const response = await handler(
      new Request("https://example.test/sepay-webhook", {
        method: "POST",
        headers: { authorization: "Apikey test-api-key", "content-type": "application/json" },
        body: " ".repeat(65 * 1024),
      }),
    );
    expect(response.status).toBe(413);
  });

  it("forwards outgoing transfers for audit while the database prevents crediting", async () => {
    const processEvent = vi.fn();
    const handler = createSePayWebhookHandler("test-api-key", processEvent);
    const response = await handler(post({ ...validEvent, transferType: "out" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(processEvent).toHaveBeenCalledWith({ ...validEvent, transferType: "out" });
  });

  it("returns a retryable server response when database processing fails", async () => {
    const handler = createSePayWebhookHandler(
      "test-api-key",
      vi.fn().mockRejectedValue(new Error("database unavailable")),
    );
    const response = await handler(post(validEvent));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ success: false });
  });
});
