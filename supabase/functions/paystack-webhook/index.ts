// Paystack calls this after every payment, as a backup in case the customer closes the page early.
// Set the URL in Paystack: Settings > API Keys & Webhooks > Webhook URL.
import { applyTransaction, fetchTransaction } from "../_shared/paystack.ts";

async function hmac512(key: string, body: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405 });
  const body = await req.text();
  const expected = await hmac512(Deno.env.get("PAYSTACK_SECRET_KEY")!, body);
  if ((req.headers.get("x-paystack-signature") || "") !== expected) return new Response("bad signature", { status: 401 });
  try {
    const event = JSON.parse(body);
    if (event.event === "charge.success") {
      const tx = await fetchTransaction(event.data.reference); // re-check with Paystack directly
      await applyTransaction(tx);
    }
  } catch (e) {
    console.error("webhook", (e as Error).message);
  }
  return new Response("ok"); // always 200 so Paystack does not retry forever
});
