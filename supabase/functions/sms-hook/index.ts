// Supabase "Send SMS" auth hook: delivers login codes through Termii.
// Secrets: SEND_SMS_HOOK_SECRET (from the hook settings), TERMII_API_KEY, TERMII_SENDER_ID,
// optional TERMII_BASE_URL (shown in your Termii dashboard), TERMII_CHANNEL (dnd by default).
import { Webhook } from "npm:standardwebhooks@1.0.0";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") || "").replace("v1,whsec_", "");
  let data: any;
  try {
    data = new Webhook(secret).verify(payload, Object.fromEntries(req.headers));
  } catch {
    return reply(401, { error: { http_code: 401, message: "Invalid signature" } });
  }
  const to = String(data?.user?.phone || "").replace(/\D/g, "");
  const otp = String(data?.sms?.otp || "");
  if (!/^\d{11,15}$/.test(to) || !/^\d{4,10}$/.test(otp)) return reply(400, { error: { http_code: 400, message: "Bad request" } });

  const base = (Deno.env.get("TERMII_BASE_URL") || "https://v3.api.termii.com").replace(/\/$/, "");
  const r = await fetch(`${base}/api/sms/send`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: Deno.env.get("TERMII_API_KEY"),
      to,
      from: Deno.env.get("TERMII_SENDER_ID") || "Washday",
      sms: `Your Washday code is ${otp}. It expires in 10 minutes. Never share it with anyone.`,
      type: "plain",
      channel: Deno.env.get("TERMII_CHANNEL") || "dnd",
    }),
  });
  if (!r.ok) {
    console.error("termii", r.status, await r.text());
    return reply(500, { error: { http_code: 500, message: "Could not send the code. Try again." } });
  }
  return reply(200, {});
});
