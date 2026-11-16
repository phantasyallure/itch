const J=(d,s=200,h={})=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json',...h}});
const enc=new TextEncoder(),hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join(''),rnd=()=>hex(crypto.getRandomValues(new Uint8Array(24)));
async function hash(p,s){const k=await crypto.subtle.importKey('raw',enc.encode(p),'PBKDF2',false,['deriveBits']);return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(s),iterations:100000},k,256))}
const PUB=['phone','email','fb_pixel','tiktok_pixel'];
export async function onRequest({request:q,env,params}){
const p=(params.path||[]).join('/'),parts=p.split('/'),m=q.method,db=env.DB;
try{
const b=['POST','PATCH'].includes(m)?await q.json().catch(()=>({})):{};
const ss=async()=>Object.fromEntries((await db.prepare('select k,v from settings').all()).results.map(r=>[r.k,r.v]));
if(p==='products')return J((await db.prepare('select * from products where active=1 order by id desc').all()).results.map(r=>({...r,images:JSON.parse(r.images||'[]')})));
if(p==='settings'){const s=await ss();return J(Object.fromEntries(PUB.map(k=>[k,s[k]||''])))}
if(p==='orders'&&m==='POST'){
const pr=await db.prepare('select * from products where id=?1 and active=1').bind(+b.product_id).first();
if(!pr||!b.full_name?.trim()||!/^0[5-7]\d{8}$/.test(b.phone||'')||!b.wilaya)return J({error:'Please check your information.'},400);
await db.prepare('insert into orders(product_id,product_name,price,full_name,phone,wilaya,comment,size,color)values(?1,?2,?3,?4,?5,?6,?7,?8,?9)').bind(pr.id,pr.name,pr.price,b.full_name.trim().slice(0,80),b.phone,String(b.wilaya).slice(0,40),String(b.comment||'').slice(0,500),String(b.size||''),String(b.color||'')).run();
return J({ok:1})}
if(parts[0]!=='admin')return J({error:'Not found'},404);
const n=(await db.prepare('select count(*) c from users').first()).c;
if(p==='admin/setup'&&m==='POST'){
if(n||(env.SETUP_KEY&&b.key!==env.SETUP_KEY)||!b.email||(b.password||'').length<8)return J({error:'Setup refused'},403);
const s=rnd();await db.prepare('insert into users(email,name,salt,hash)values(?1,?2,?3,?4)').bind(b.email.toLowerCase(),b.name||'Owner',s,await hash(b.password,s)).run();return J({ok:1})}
if(p==='admin/login'&&m==='POST'){
const u=await db.prepare('select * from users where email=?1').bind((b.email||'').toLowerCase()).first();
if(!u||u.hash!==await hash(b.password||'',u.salt))return J({error:'Wrong email or password'},401);
const t=rnd();await db.prepare('insert into sessions values(?1,?2,?3)').bind(t,u.id,Date.now()+6048e5).run();
return J({ok:1},200,{'set-cookie':`s=${t}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=604800`})}
const ck=(q.headers.get('cookie')||'').match(/(?:^|; )s=(\w+)/);
const me=ck&&await db.prepare('select u.id,u.email,u.name from sessions s join users u on u.id=s.user_id where s.token=?1 and s.expires>?2').bind(ck[1],Date.now()).first();
if(p==='admin/me')return J({me,setup:!n});
if(!me)return J({error:'Unauthorized'},401);
if(p==='admin/logout'){await db.prepare('delete from sessions where token=?1').bind(ck[1]).run();return J({ok:1},200,{'set-cookie':'s=; Path=/; Max-Age=0'})}
if(parts[1]==='products'){
if(m==='GET')return J((await db.prepare('select * from products order by id desc').all()).results.map(r=>({...r,images:JSON.parse(r.images||'[]')})));
if(m==='DELETE'){await db.prepare('delete from products where id=?1').bind(+parts[2]).run();return J({ok:1})}
const f=[b.name,+b.price||0,b.description||'',b.sizes||'',b.colors||'',JSON.stringify((b.images||[]).slice(0,5)),b.active?1:0];
if(b.id)await db.prepare('update products set name=?1,price=?2,description=?3,sizes=?4,colors=?5,images=?6,active=?7 where id=?8').bind(...f,+b.id).run();
else await db.prepare('insert into products(name,price,description,sizes,colors,images,active)values(?1,?2,?3,?4,?5,?6,?7)').bind(...f).run();
return J({ok:1})}
if(p==='admin/orders'&&m==='GET')return J((await db.prepare('select * from orders order by id desc limit 500').all()).results);
if(parts[1]==='orders'&&m==='PATCH'){await db.prepare('update orders set status=?1 where id=?2').bind(b.status,+parts[2]).run();return J({ok:1})}
if(p==='admin/stats'){const a=x=>db.prepare(x).all().then(r=>r.results);
return J({total:await db.prepare("select count(*) c,coalesce(sum(price),0) r,sum(status='new') n from orders where status!='cancelled'").first(),
products:await a('select product_name n,count(*) c from orders group by product_id order by c desc limit 6'),
wilayas:await a('select wilaya n,count(*) c from orders group by wilaya order by c desc limit 6'),
days:await a("select date(created_at) n,count(*) c from orders where created_at>=date('now','-13 day') group by n order by n")})}
if(p==='admin/settings'){if(m==='GET')return J(await ss());
for(const k of PUB)if(k in b)await db.prepare('insert into settings values(?1,?2) on conflict(k) do update set v=?2').bind(k,String(b[k]).trim().slice(0,120)).run();return J({ok:1})}
if(parts[1]==='team'){
if(m==='GET')return J((await db.prepare('select id,email,name from users').all()).results);
if(m==='DELETE'){if(+parts[2]!==me.id)await db.prepare('delete from users where id=?1').bind(+parts[2]).run();return J({ok:1})}
if(!b.email||(b.password||'').length<8)return J({error:'Email and 8+ char password required'},400);
const s=rnd();await db.prepare('insert into users(email,name,salt,hash)values(?1,?2,?3,?4)').bind(b.email.toLowerCase(),b.name||'',s,await hash(b.password,s)).run();return J({ok:1})}
return J({error:'Not found'},404)
}catch(e){return J({error:String(e.message||e).includes('UNIQUE')?'Already exists':'Server error'},500)}}
