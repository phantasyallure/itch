-- Run once in Supabase → SQL Editor → New query → Run

create table if not exists products(
  id bigint generated always as identity primary key,
  name text, price int, description text, sizes text, colors text,
  images text, active int default 1,
  created_at timestamptz default now()
);
create table if not exists orders(
  id bigint generated always as identity primary key,
  product_id bigint, product_name text, price int,
  full_name text, phone text, wilaya text, comment text,
  size text, color text, status text default 'new',
  created_at timestamptz default now()
);
create table if not exists settings(k text primary key, v text);
create table if not exists users(
  id bigint generated always as identity primary key,
  email text unique, name text, salt text, hash text
);
create table if not exists sessions(
  token text primary key,
  user_id bigint references users(id) on delete cascade,
  expires bigint
);

-- Lock tables: only the server (service role key) can touch them.
alter table products enable row level security;
alter table orders   enable row level security;
alter table settings enable row level security;
alter table users    enable row level security;
alter table sessions enable row level security;

-- Dashboard stats
create or replace function admin_stats() returns json
language sql stable as $$
  select json_build_object(
    'total', (select json_build_object('c',count(*),'r',coalesce(sum(price),0),'n',count(*) filter (where status='new'))
              from orders where status<>'cancelled'),
    'products', (select coalesce(json_agg(t),'[]'::json) from
                 (select product_name n, count(*) c from orders group by product_id, product_name order by c desc limit 6) t),
    'wilayas',  (select coalesce(json_agg(t),'[]'::json) from
                 (select wilaya n, count(*) c from orders group by wilaya order by c desc limit 6) t),
    'days',     (select coalesce(json_agg(t),'[]'::json) from
                 (select to_char(created_at::date,'YYYY-MM-DD') n, count(*) c from orders
                  where created_at::date >= current_date - 13 group by 1 order by 1) t)
  );
$$;
revoke execute on function admin_stats() from public, anon, authenticated;
