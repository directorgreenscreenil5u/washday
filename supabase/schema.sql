-- Washday backend schema. Run once in Supabase: SQL Editor > New query > paste > Run.
-- Customers sign in with a phone code. Their phone (last 10 digits) links them to their data.
-- Staff are listed in public.staff. Payments are written only by the server functions.


-- ---------- helpers ----------
create or replace function public.my_phone() returns text
language sql stable as $$
  select nullif(right(regexp_replace(coalesce(auth.jwt()->>'phone',''),'\D','','g'),10),'')
$$;

create table if not exists public.staff (
  phone text primary key check (phone ~ '^\d{10}$'),
  name text not null,
  role text not null default 'staff' check (role in ('staff','admin')),
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.staff where phone = public.my_phone())
$$;

create or replace function public.is_privileged() returns boolean
language sql stable as $$
  -- server functions use the service role; SQL editor runs as postgres
  select coalesce(auth.jwt()->>'role','') = 'service_role' or current_user in ('postgres','supabase_admin') or public.is_staff()
$$;

-- ---------- tables ----------
create table if not exists public.profiles (
  phone text primary key check (phone ~ '^\d{10}$'),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key check (id ~ '^WD-[A-Z0-9]{4,12}$'),
  phone text not null references public.profiles(phone) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_phone_idx on public.orders(phone);

create table if not exists public.tags (
  code text primary key,
  phone text references public.profiles(phone) on delete set null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
create index if not exists tags_phone_idx on public.tags(phone);

create table if not exists public.payments (
  reference text primary key,
  phone text not null,
  purpose text not null check (purpose in ('subscribe','order')),
  amount integer not null check (amount > 0),          -- naira
  meta jsonb not null default '{}'::jsonb,
  used_by text,                                         -- order id that consumed it
  created_at timestamptz not null default now()
);

create table if not exists public.handoffs (
  id bigint generated always as identity primary key,
  phone text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open','done')),
  created_at timestamptz not null default now()
);

create table if not exists public.waitlist (
  id bigint generated always as identity primary key,
  area text not null check (length(area) between 2 and 120),
  phone text not null check (length(phone) between 10 and 20),
  created_at timestamptz not null default now()
);

create table if not exists public.quotes (
  id bigint generated always as identity primary key,
  org text not null check (length(org) between 2 and 160),
  phone text not null check (length(phone) between 10 and 20),
  need text check (length(need) <= 2000),
  created_at timestamptz not null default now()
);

-- ---------- prices (must match CONFIG in app.js) ----------
create or replace function public.order_price(d jsonb) returns integer
language sql immutable as $$
  select
    (case d->>'type'
       when 'extra' then 7000 * greatest(coalesce((d->>'bags')::int,1),1)
       when 'dry'   then 3000 * greatest(coalesce((d->>'bags')::int,1),1)
       else 0 end)
  + 5000 * coalesce((d->'qty'->>'duvet')::int,0)
  + 3000 * coalesce((d->'qty'->>'curtain')::int,0)
  + 3000 * coalesce((d->'qty'->>'dry')::int,0)
  + (case when coalesce(d->'extras','[]'::jsonb) ? 'express' then 5000 else 0 end)
$$;

-- ---------- guards: what customers may change ----------
-- Fields only staff or the server may set on a profile
create or replace function public.guard_profile() returns trigger
language plpgsql as $$
declare k text;
  protected text[] := array['phone','plan','status','founding','commitEnd','cycleStart','joined',
                            'bills','credit','creditLog','pendingCharges','payment','isDemo','referral','referredBy'];
begin
  new.updated_at := now();
  if public.is_privileged() then return new; end if;
  if tg_op = 'INSERT' then
    if new.phone is distinct from public.my_phone() then raise exception 'not your account'; end if;
    new.data := new.data - protected
      || jsonb_build_object('phone',new.phone,'plan',null,'status','active','bills','[]'::jsonb,'credit',0,
                            'joined',to_char(now() at time zone 'Africa/Lagos','YYYY-MM-DD'),
                            'referral', upper(substr(regexp_replace(coalesce(new.data->>'name','WD'),'[^A-Za-z]','','g'),1,6)) || (10+floor(random()*89))::int);
    return new;
  end if;
  -- UPDATE: keep protected fields from the stored row; a plan change becomes a request
  if (new.data->>'plan') is distinct from (old.data->>'plan') and (new.data->>'plan') is not null then
    new.data := jsonb_set(new.data,'{planWanted}',to_jsonb(new.data->>'plan'));
  end if;
  foreach k in array protected loop
    if old.data ? k then new.data := jsonb_set(new.data, array[k], old.data->k);
    else new.data := new.data - k; end if;
  end loop;
  new.phone := old.phone;
  return new;
end $$;

-- Marks a verified, unused payment as spent on an order. Runs with owner rights because
-- customers cannot touch the payments table directly.
create or replace function public.use_payment(ref text, ph text, need int, order_id text) returns int
language plpgsql security definer set search_path = public as $$
declare pay record;
begin
  if ph is distinct from public.my_phone() and not public.is_staff() then raise exception 'not your payment'; end if;
  select * into pay from public.payments
    where reference = ref and phone = ph and purpose = 'order' and used_by is null for update;
  if not found or pay.amount < need then raise exception 'payment required: % naira', need; end if;
  update public.payments set used_by = order_id where reference = ref;
  return pay.amount;
end $$;
revoke all on function public.use_payment(text,text,int,text) from public, anon;
grant execute on function public.use_payment(text,text,int,text) to authenticated;

create or replace function public.guard_order() returns trigger
language plpgsql as $$
declare need int; paid int;
  cust_keys text[] := array['date','window','address','bags','note','extras','qty','rating','issue','cancelled','payRef'];
  k text; merged jsonb;
begin
  new.updated_at := now();
  if public.is_privileged() then
    if tg_op = 'UPDATE' then new.phone := old.phone; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.phone is distinct from public.my_phone() then raise exception 'not your order'; end if;
    new.data := new.data || jsonb_build_object('id',new.id,'phone',new.phone,'status',0,
      'history',jsonb_build_array(jsonb_build_object('s',0,'at',(extract(epoch from now())*1000)::bigint)),
      'kg',null,'items',null,'flags','[]'::jsonb,'issue',null,'rating',null,'paid',0,'cancelled',false);
    if coalesce(new.data->>'type','') not in ('regular','extra','dry') then raise exception 'bad order type'; end if;
    if new.data->>'type' = 'regular' then
      if not exists(select 1 from public.profiles p where p.phone = new.phone and p.data->>'plan' is not null and p.data->>'status' = 'active')
        then raise exception 'no active plan'; end if;
      if exists(select 1 from public.orders o where o.phone = new.phone and o.data->>'type' = 'regular'
                and coalesce((o.data->>'status')::int,0) = 0 and not coalesce((o.data->>'cancelled')::boolean,false))
        then raise exception 'plan pickup already booked'; end if;
    end if;
    merged := new.data;
  else
    new.phone := old.phone; new.id := old.id;
    merged := old.data;
    foreach k in array cust_keys loop
      if new.data ? k then merged := jsonb_set(merged, array[k], new.data->k); end if;
    end loop;
    -- once collected, only rating and issue reports can change
    if coalesce((old.data->>'status')::int,0) > 0 or coalesce((old.data->>'cancelled')::boolean,false) then
      merged := old.data
        || jsonb_build_object('rating', coalesce(new.data->'rating', old.data->'rating'))
        || jsonb_build_object('issue',  coalesce(new.data->'issue',  old.data->'issue'));
      if (old.data->'issue') is not null and (old.data->'issue') <> 'null'::jsonb then
        merged := jsonb_set(merged,'{issue}',old.data->'issue');   -- staff resolve issues
      end if;
    end if;
    if (merged->'issue') is not null and (merged->'issue') <> 'null'::jsonb and (old.data->'issue' is null or old.data->'issue'='null'::jsonb) then
      merged := jsonb_set(merged,'{issue,status}','"open"');
    end if;
  end if;
  -- price must be covered by verified payments
  need := public.order_price(merged);
  paid := coalesce((merged->>'paid')::int,0);
  if tg_op = 'UPDATE' then paid := coalesce((old.data->>'paid')::int,0); end if;
  if need > paid then
    paid := paid + public.use_payment(merged->>'payRef', new.phone, need - paid, new.id);
  end if;
  merged := merged || jsonb_build_object('cost',need,'paid',paid);
  new.data := merged;
  return new;
end $$;

create or replace function public.touch() returns trigger language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

drop trigger if exists profiles_guard on public.profiles;
create trigger profiles_guard before insert or update on public.profiles for each row execute function public.guard_profile();
drop trigger if exists orders_guard on public.orders;
create trigger orders_guard before insert or update on public.orders for each row execute function public.guard_order();
drop trigger if exists tags_touch on public.tags;
create trigger tags_touch before update on public.tags for each row execute function public.touch();

-- ---------- row-level security ----------
alter table public.staff    enable row level security;
alter table public.profiles enable row level security;
alter table public.orders   enable row level security;
alter table public.tags     enable row level security;
alter table public.payments enable row level security;
alter table public.handoffs enable row level security;
alter table public.waitlist enable row level security;
alter table public.quotes   enable row level security;

drop policy if exists staff_read on public.staff;
create policy staff_read on public.staff for select to authenticated using (public.is_staff() or phone = public.my_phone());

drop policy if exists p_select on public.profiles;
create policy p_select on public.profiles for select to authenticated using (phone = public.my_phone() or public.is_staff());
drop policy if exists p_insert on public.profiles;
create policy p_insert on public.profiles for insert to authenticated with check (phone = public.my_phone() or public.is_staff());
drop policy if exists p_update on public.profiles;
create policy p_update on public.profiles for update to authenticated using (phone = public.my_phone() or public.is_staff()) with check (phone = public.my_phone() or public.is_staff());

drop policy if exists o_select on public.orders;
create policy o_select on public.orders for select to authenticated using (phone = public.my_phone() or public.is_staff());
drop policy if exists o_insert on public.orders;
create policy o_insert on public.orders for insert to authenticated with check (phone = public.my_phone() or public.is_staff());
drop policy if exists o_update on public.orders;
create policy o_update on public.orders for update to authenticated using (phone = public.my_phone() or public.is_staff()) with check (phone = public.my_phone() or public.is_staff());
drop policy if exists o_delete on public.orders;
create policy o_delete on public.orders for delete to authenticated using (public.is_staff());

drop policy if exists t_select on public.tags;
create policy t_select on public.tags for select to authenticated using (phone = public.my_phone() or public.is_staff());
drop policy if exists t_write on public.tags;
create policy t_write on public.tags for all to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists pay_select on public.payments;
create policy pay_select on public.payments for select to authenticated using (phone = public.my_phone() or public.is_staff());
-- no insert/update policy: only server functions (service role) write payments

drop policy if exists h_select on public.handoffs;
create policy h_select on public.handoffs for select to authenticated using (phone = public.my_phone() or public.is_staff());
drop policy if exists h_insert on public.handoffs;
create policy h_insert on public.handoffs for insert to authenticated with check (phone = public.my_phone() and status = 'open');
drop policy if exists h_update on public.handoffs;
create policy h_update on public.handoffs for update to authenticated using (public.is_staff()) with check (public.is_staff());

drop policy if exists w_insert on public.waitlist;
create policy w_insert on public.waitlist for insert to anon, authenticated with check (true);
drop policy if exists w_select on public.waitlist;
create policy w_select on public.waitlist for select to authenticated using (public.is_staff());
drop policy if exists q_insert on public.quotes;
create policy q_insert on public.quotes for insert to anon, authenticated with check (true);
drop policy if exists q_select on public.quotes;
create policy q_select on public.quotes for select to authenticated using (public.is_staff());

-- Table access for the API roles (RLS above decides which rows)
grant usage on schema public to anon, authenticated;
grant select on public.staff to authenticated;
grant select, insert, update on public.profiles, public.orders, public.handoffs to authenticated;
grant delete on public.orders to authenticated;
grant select, insert, update, delete on public.tags to authenticated;
grant select on public.payments to authenticated;
grant insert on public.waitlist, public.quotes to anon, authenticated;
grant select on public.waitlist, public.quotes to authenticated;
revoke all on public.payments from anon;

-- After running: add yourself as admin (your 10-digit number, no leading 0), e.g.
-- insert into public.staff(phone,name,role) values ('8031234567','Your Name','admin');

-- Saved card tokens for monthly renewals. No policies: only server functions can read or write.
create table if not exists public.billing_tokens (
  phone text primary key,
  authorization_code text not null,
  email text,
  last4 text,
  brand text,
  updated_at timestamptz not null default now()
);
alter table public.billing_tokens enable row level security;
revoke all on public.billing_tokens from anon, authenticated;
