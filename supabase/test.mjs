import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const db = new PGlite();
const boot = `
create schema auth;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
grant usage on schema auth to anon, authenticated, service_role;`;
await db.exec(boot);
await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));
await db.exec(`grant all on all tables in schema public to service_role; insert into public.staff(phone,name,role) values ('8099999999','Staff','admin');`);
let pass=0, fail=0;
async function as(who, sql, params=[]){
  const claims = who==='anon'?{role:'anon'}: who==='service'?{role:'service_role'}:{role:'authenticated',phone:'234'+who};
  const role = who==='anon'?'anon':who==='service'?'service_role':'authenticated';
  await db.exec(`reset role; select set_config('request.jwt.claims','${JSON.stringify(claims)}',false); set role ${role};`);
  try { const r = await db.query(sql, params); return r; } finally { await db.exec('reset role;'); }
}
async function ok(name, fn){ try{ const r=await fn(); if(r===false) throw new Error('assert false'); pass++; console.log('PASS',name); }catch(e){ fail++; console.log('FAIL',name,'-',e.message); } }
async function throws(name, fn, re){ try{ await fn(); fail++; console.log('FAIL',name,'- no error'); }catch(e){ if(re && !re.test(e.message)){fail++;console.log('FAIL',name,'-',e.message);} else {pass++; console.log('PASS',name,'(',e.message.slice(0,60),')');} } }
const A='8031111111', B='8032222222', S='8099999999';
const prof = async (who,ph)=> (await as(who,'select data from profiles where phone=$1',[ph])).rows[0]?.data;

await ok('A creates own profile; plan/credit forced', async()=>{ await as(A,`insert into profiles(phone,data) values($1,$2)`,[A,{name:'Ada Obi',plan:'household',credit:99999,bills:[{amount:1}]}]); const d=await prof(A,A); return d.plan===null && d.credit===0 && d.bills.length===0 && d.name==='Ada Obi' && d.status==='active'; });
await throws('A cannot create profile for B', ()=>as(A,`insert into profiles(phone,data) values($1,'{}')`,[B]));
await ok('B creates own profile', async()=>{ await as(B,`insert into profiles(phone,data) values($1,$2)`,[B,{name:'Bola'}]); return true; });
await ok('A edits name; credit/plan edits ignored; plan becomes request', async()=>{ await as(A,`update profiles set data = data || $1 where phone=$2`,[{name:'Ada O.',credit:50000,plan:'weekly'},A]); const d=await prof(A,A); return d.name==='Ada O.' && d.credit===0 && d.plan===null && d.planWanted==='weekly'; });
await ok('A cannot read B', async()=> (await as(A,'select * from profiles where phone=$1',[B])).rows.length===0);
await ok('A cannot update B', async()=>{ await as(A,`update profiles set data='{"name":"hacked"}' where phone=$1`,[B]); return (await prof(B,B)).name==='Bola'; });
await throws('A cannot book plan pickup without a plan', ()=>as(A,`insert into orders(id,phone,data) values('WD-AAAA1',$1,'{"type":"regular"}')`,[A]), /no active plan/);
await ok('Server activates A plan', async()=>{ await as('service',`update profiles set data = data || '{"plan":"weekly","status":"active","credit":3000}' where phone=$1`,[A]); const d=await prof(A,A); return d.plan==='weekly'&&d.credit===3000; });
await ok('A books plan pickup; status forced 0', async()=>{ await as(A,`insert into orders(id,phone,data) values('WD-AAAA1',$1,'{"type":"regular","status":6,"kg":1}')`,[A]); const o=(await as(A,`select data from orders where id='WD-AAAA1'`)).rows[0].data; return o.status===0 && o.kg===null && o.cost===0; });
await throws('A cannot book a second plan pickup', ()=>as(A,`insert into orders(id,phone,data) values('WD-AAAA2',$1,'{"type":"regular"}')`,[A]), /already booked/);
await throws('Extra pickup needs payment', ()=>as(A,`insert into orders(id,phone,data) values('WD-AAAA3',$1,'{"type":"extra","bags":1,"cost":0}')`,[A]), /payment required: 7000/);
await throws('Customer cannot write payments', ()=>as(A,`insert into payments(reference,phone,purpose,amount) values('fake',$1,'order',7000)`,[A]));
await ok('Server records verified payment', async()=>{ await as('service',`insert into payments(reference,phone,purpose,amount) values('ref1',$1,'order',7000)`,[A]); return true; });
await throws('Underpaid express+extra rejected', ()=>as(A,`insert into orders(id,phone,data) values('WD-AAAA3',$1,'{"type":"extra","bags":1,"extras":["express"],"payRef":"ref1"}')`,[A]), /payment required: 12000/);
await ok('Paid extra pickup accepted', async()=>{ await as(A,`insert into orders(id,phone,data) values('WD-AAAA3',$1,'{"type":"extra","bags":1,"payRef":"ref1"}')`,[A]); const o=(await as(A,`select data from orders where id='WD-AAAA3'`)).rows[0].data; return o.paid===7000&&o.cost===7000; });
await throws('Payment cannot be reused', ()=>as(A,`insert into orders(id,phone,data) values('WD-AAAA4',$1,'{"type":"extra","bags":1,"payRef":"ref1"}')`,[A]), /payment required/);
await throws('B cannot use A payment', ()=>as(B,`insert into orders(id,phone,data) values('WD-BBBB1',$1,'{"type":"dry","bags":1,"payRef":"ref1"}')`,[B]), /payment required/);
await ok('A cannot mark own order delivered', async()=>{ await as(A,`update orders set data = data || '{"status":6,"kg":2}' where id='WD-AAAA1'`); const o=(await as(A,`select data from orders where id='WD-AAAA1'`)).rows[0].data; return o.status===0&&o.kg===null; });
await ok('A can move plan pickup date', async()=>{ await as(A,`update orders set data = data || '{"date":"2026-12-01"}' where id='WD-AAAA1'`); return (await as(A,`select data->>'date' d from orders where id='WD-AAAA1'`)).rows[0].d==='2026-12-01'; });
await throws('Adding express to plan pickup needs payment', ()=>as(A,`update orders set data = data || '{"extras":["express"]}' where id='WD-AAAA1'`), /payment required: 5000/);
await ok('Staff sees all orders', async()=> (await as(S,'select id from orders')).rows.length===2);
await ok('Staff advances status', async()=>{ await as(S,`update orders set data = jsonb_set(data,'{status}','2') where id='WD-AAAA1'`); return (await as(A,`select data->>'status' s from orders where id='WD-AAAA1'`)).rows[0].s==='2'; });
await ok('After pickup, A cannot change date', async()=>{ await as(A,`update orders set data = data || '{"date":"2027-01-01"}' where id='WD-AAAA1'`); return (await as(A,`select data->>'date' d from orders where id='WD-AAAA1'`)).rows[0].d==='2026-12-01'; });
await ok('A can rate and report issue', async()=>{ await as(A,`update orders set data = data || '{"rating":5,"issue":{"kind":"Missing item","text":"sock","status":"resolved"}}' where id='WD-AAAA1'`); const o=(await as(A,`select data from orders where id='WD-AAAA1'`)).rows[0].data; return o.rating===5 && o.issue.status==='open'; });
await ok('A cannot see B orders', async()=> (await as(A,`select id from orders where phone=$1`,[B])).rows.length===0);
await ok('Staff can edit credit', async()=>{ await as(S,`update profiles set data = jsonb_set(data,'{credit}','5000') where phone=$1`,[A]); return (await prof(A,A)).credit===5000; });
await throws('Customer cannot create tags', ()=>as(A,`insert into tags(code,phone) values('WD-T-9999',$1)`,[A]));
await ok('Staff creates tag; A can read own tag', async()=>{ await as(S,`insert into tags(code,phone,data) values('WD-T-0001',$1,'{}')`,[A]); return (await as(A,'select code from tags')).rows.length===1; });
await ok('Visitor joins waitlist', async()=>{ await as('anon',`insert into waitlist(area,phone) values('Lekki','08031234567')`); return true; });
await throws('Visitor cannot read waitlist', ()=>as('anon','select * from waitlist'));
await ok('Customer cannot read waitlist', async()=> (await as(A,'select * from waitlist')).rows.length===0);
await ok('Staff reads waitlist', async()=> (await as(S,'select * from waitlist')).rows.length===1);
await ok('Customer asks for a person', async()=>{ await as(A,`insert into handoffs(phone,data) values($1,'{"text":"hi"}')`,[A]); return true; });
await ok('Customer cannot close handoff', async()=>{ await as(A,`update handoffs set status='done'`); return (await as(S,'select status from handoffs')).rows[0].status==='open'; });
await throws('Visitor cannot read profiles', ()=>as('anon','select * from profiles'));
console.log(`\n${pass} passed, ${fail} failed`);
