// Called by the website after Paystack checkout closes successfully.
// Body: { reference }. The signed-in customer must own the payment.
import { createClient } from "npm:@supabase/supabase-js@2";
import { applyTransaction, cors, fetchTransaction, last10 } from "../_shared/paystack.ts";

Deno.serve(async (req) => {
  const h = { ...cors(req), "Content-Type": "application/json" };
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return new Response(JSON.stringify({ error: "POST only" }), { status: 405, headers: h });
  try {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error } = await sb.auth.getUser(token);
    if (error || !user?.phone) return new Response(JSON.stringify({ error: "Please log in again" }), { status: 401, headers: h });
    const { reference } = await req.json();
    if (typeof reference !== "string" || !/^[\w.-]{6,100}$/.test(reference)) throw new Error("Bad reference");
    const tx = await fetchTransaction(reference);
    const result = await applyTransaction(tx, last10(user.phone));
    return new Response(JSON.stringify(result), { headers: h });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 400, headers: h });
  }
});
