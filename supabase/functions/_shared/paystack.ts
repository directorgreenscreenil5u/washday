// Shared Paystack logic for paystack-verify and paystack-webhook.
import { createClient } from "npm:@supabase/supabase-js@2";

export const PLANS: Record<string, { name: string; price: number }> = {
  fresh: { name: "Fresh Start", price: 20000 },
  weekly: { name: "Weekly Fresh", price: 35000 },
  household: { name: "Full House", price: 60000 },
};
export const FOUNDING_DISCOUNT = 0.30;
export const FOUNDING_DEADLINE = "2027-01-04"; // Lagos date

export const admin = () =>
  createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });

export const last10 = (p: string | null | undefined) => (p || "").replace(/\D/g, "").slice(-10);
export const lagosToday = () => new Date(Date.now() + 3600_000).toISOString().slice(0, 10);
export const isFounding = () => lagosToday() < FOUNDING_DEADLINE;
export const planFirstMonth = (plan: string) => {
  const p = PLANS[plan];
  if (!p) return null;
  return isFounding() ? Math.round(p.price * (1 - FOUNDING_DISCOUNT)) : p.price;
};

export async function fetchTransaction(reference: string) {
  const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${Deno.env.get("PAYSTACK_SECRET_KEY")}` },
  });
  const j = await r.json();
  if (!r.ok || !j.status) throw new Error("Could not verify payment with Paystack");
  return j.data;
}

const addMonths = (iso: string, n: number) => {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
};

// Records a successful Paystack transaction once, and applies its effect.
// `tx` is Paystack's transaction object. Returns a short result for the client.
export async function applyTransaction(tx: any, expectPhone?: string) {
  if (tx.status !== "success") throw new Error("Payment was not successful");
  if (tx.currency !== "NGN") throw new Error("Unexpected currency");
  const meta = (typeof tx.metadata === "string" ? JSON.parse(tx.metadata || "{}") : tx.metadata) || {};
  const phone = last10(meta.phone);
  if (!/^\d{10}$/.test(phone)) throw new Error("Payment is missing the customer phone");
  if (expectPhone && phone !== expectPhone) throw new Error("This payment belongs to another account");
  const purpose = meta.purpose === "subscribe" ? "subscribe" : "order";
  const amount = Math.round(tx.amount / 100);
  const db = admin();

  if (purpose === "subscribe") {
    const need = planFirstMonth(meta.plan);
    if (need === null) throw new Error("Unknown plan");
    if (amount < need) throw new Error(`Amount too low for this plan (expected ${need})`);
  }

  const { data: existing } = await db.from("payments").select("*").eq("reference", tx.reference).maybeSingle();
  if (existing) {
    if (existing.phone !== phone) throw new Error("Reference already used");
    return { ok: true, reference: tx.reference, amount: existing.amount, purpose: existing.purpose, repeat: true };
  }
  const { error: insErr } = await db.from("payments").insert({
    reference: tx.reference, phone, purpose, amount,
    meta: { plan: meta.plan ?? null, channel: tx.channel, paid_at: tx.paid_at },
  });
  if (insErr) {
    if (insErr.code === "23505") return { ok: true, reference: tx.reference, amount, purpose, repeat: true };
    throw new Error("Could not save payment");
  }

  const auth = tx.authorization;
  if (auth?.reusable && auth?.authorization_code) {
    await db.from("billing_tokens").upsert({
      phone, authorization_code: auth.authorization_code, email: tx.customer?.email ?? null,
      last4: auth.last4 ?? null, brand: auth.brand ?? null, updated_at: new Date().toISOString(),
    });
  }

  if (purpose === "subscribe") {
    const { data: prof, error } = await db.from("profiles").select("data").eq("phone", phone).single();
    if (error || !prof) throw new Error("Account not found");
    const d = prof.data || {};
    const today = lagosToday();
    const start = /^\d{4}-\d{2}-\d{2}$/.test(meta.start || "") && meta.start >= today && meta.start <= addMonths(today, 1) ? meta.start : today;
    const founding = isFounding();
    const p = PLANS[meta.plan];
    const bill = {
      date: today, kind: "start", amount, status: "Paid", ref: tx.reference,
      desc: `${p.name}, first month${founding ? ` · founding member ${Math.round(FOUNDING_DISCOUNT * 100)}% off` : ""}`,
    };
    const next = {
      ...d, plan: meta.plan, status: "active", founding, cycleStart: start,
      commitEnd: founding ? addMonths(start, 3) : null,
      bills: [bill, ...((d.bills as any[]) || [])],
      payment: { type: "card", last4: auth?.last4 ?? null },
    };
    delete (next as any).planWanted;
    const { error: upErr } = await db.from("profiles").update({ data: next }).eq("phone", phone);
    if (upErr) throw new Error("Could not activate plan");
  } else {
    // one-off extras: add a bill line; the order itself is created by the customer with payRef
    const { data: prof } = await db.from("profiles").select("data").eq("phone", phone).single();
    if (prof) {
      const d = prof.data || {};
      const bill = { date: lagosToday(), kind: "extra", amount, status: "Paid", ref: tx.reference, desc: meta.desc || "Extras" };
      await db.from("profiles").update({ data: { ...d, bills: [bill, ...((d.bills as any[]) || [])] } }).eq("phone", phone);
    }
  }
  return { ok: true, reference: tx.reference, amount, purpose };
}

export const cors = (req: Request) => {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") || "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
};
