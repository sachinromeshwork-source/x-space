-- X Space schema. Tables use the xs_ prefix so they cannot collide with X Base tables.
create extension if not exists pg_trgm;
create table xs_profiles(id uuid primary key references auth.users on delete cascade,mobile text unique not null,name text not null,avatar_url text,last_seen timestamptz default now(),created_at timestamptz default now());
create index on xs_profiles using gin(name gin_trgm_ops);
create index on xs_profiles using gin(mobile gin_trgm_ops);
create table xs_conversations(id uuid primary key default gen_random_uuid(),is_group boolean not null default false,name text,avatar_url text,created_by uuid references xs_profiles(id),created_at timestamptz default now(),last_message_at timestamptz default now());
create index on xs_conversations(last_message_at desc);
create table xs_members(conversation_id uuid references xs_conversations on delete cascade,user_id uuid references xs_profiles on delete cascade,role text not null default 'member' check(role in('admin','member')),last_read_at timestamptz default now(),joined_at timestamptz default now(),primary key(conversation_id,user_id));
create index on xs_members(user_id);
create table xs_messages(id uuid primary key default gen_random_uuid(),conversation_id uuid not null references xs_conversations on delete cascade,sender_id uuid not null references xs_profiles,body text,kind text not null default 'text' check(kind in('text','image','file')),file_path text,file_name text,reply_to uuid references xs_messages on delete set null,forwarded boolean default false,pinned boolean default false,edited_at timestamptz,deleted_at timestamptz,created_at timestamptz default now());
create index on xs_messages(conversation_id,created_at desc);
create index on xs_messages using gin(body gin_trgm_ops);
create table xs_reactions(message_id uuid references xs_messages on delete cascade,user_id uuid references xs_profiles on delete cascade,emoji text not null,primary key(message_id,user_id,emoji));
create table xs_blocks(blocker_id uuid references xs_profiles on delete cascade,blocked_id uuid references xs_profiles on delete cascade,primary key(blocker_id,blocked_id));
create table xs_reports(id uuid primary key default gen_random_uuid(),reporter_id uuid references xs_profiles,reported_id uuid references xs_profiles,reason text not null check(reason in('spam','harassment','abuse','other')),details text,created_at timestamptz default now());

create function xs_is_member(cid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from xs_members where conversation_id=cid and user_id=auth.uid()) $$;
create function xs_is_admin(cid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from xs_members where conversation_id=cid and user_id=auth.uid() and role='admin') $$;

-- Profile creation: only for sign-ups flagged by X Space, so X Base sign-ups are untouched.
create function xs_handle_signup() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.raw_user_meta_data->>'xspace'='true' then
  insert into xs_profiles(id,mobile,name) values(new.id,new.raw_user_meta_data->>'mobile',coalesce(nullif(new.raw_user_meta_data->>'name',''),'User'));
 end if; return new; end $$;
create trigger xs_on_signup after insert on auth.users for each row execute function xs_handle_signup();

create function xs_start_dm(other uuid) returns uuid language plpgsql security definer set search_path=public as $$
declare cid uuid; begin
 if other=auth.uid() then raise exception 'Cannot message yourself'; end if;
 if exists(select 1 from xs_blocks where (blocker_id=auth.uid() and blocked_id=other) or (blocker_id=other and blocked_id=auth.uid())) then raise exception 'blocked'; end if;
 select c.id into cid from xs_conversations c where not c.is_group
  and exists(select 1 from xs_members where conversation_id=c.id and user_id=auth.uid())
  and exists(select 1 from xs_members where conversation_id=c.id and user_id=other) limit 1;
 if cid is null then
  insert into xs_conversations(created_by) values(auth.uid()) returning id into cid;
  insert into xs_members(conversation_id,user_id,role) values(cid,auth.uid(),'member'),(cid,other,'member');
 end if; return cid; end $$;

create function xs_mark_read(cid uuid) returns void language sql security definer set search_path=public as $$ update xs_members set last_read_at=now() where conversation_id=cid and user_id=auth.uid() $$;

create function xs_list() returns table(cid uuid,is_group boolean,title text,avatar text,last_at timestamptz,last_text text,unread bigint,other_id uuid)
language sql stable security definer set search_path=public as $$
 select c.id,c.is_group,coalesce(c.name,p.name),coalesce(c.avatar_url,p.avatar_url),c.last_message_at,
  case when lm.id is null then null when lm.deleted_at is not null then 'Message deleted' else coalesce(lm.body,'Attachment') end,
  (select count(*) from xs_messages m where m.conversation_id=c.id and m.sender_id<>auth.uid() and m.created_at>me.last_read_at and m.deleted_at is null),
  p.id
 from xs_members me join xs_conversations c on c.id=me.conversation_id
 left join xs_members om on not c.is_group and om.conversation_id=c.id and om.user_id<>auth.uid()
 left join xs_profiles p on p.id=om.user_id
 left join lateral(select id,body,deleted_at from xs_messages where conversation_id=c.id order by created_at desc limit 1) lm on true
 where me.user_id=auth.uid() order by c.last_message_at desc $$;

create function xs_before_message() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if exists(select 1 from xs_conversations c join xs_members o on o.conversation_id=c.id and o.user_id<>new.sender_id
   join xs_blocks b on (b.blocker_id=o.user_id and b.blocked_id=new.sender_id) or (b.blocker_id=new.sender_id and b.blocked_id=o.user_id)
   where c.id=new.conversation_id and not c.is_group) then raise exception 'blocked'; end if;
 return new; end $$;
create trigger xs_msg_before before insert on xs_messages for each row execute function xs_before_message();
create function xs_after_message() returns trigger language plpgsql security definer set search_path=public as $$
begin update xs_conversations set last_message_at=new.created_at where id=new.conversation_id; return new; end $$;
create trigger xs_msg_after after insert on xs_messages for each row execute function xs_after_message();

alter table xs_profiles enable row level security; alter table xs_conversations enable row level security; alter table xs_members enable row level security;
alter table xs_messages enable row level security; alter table xs_reactions enable row level security; alter table xs_blocks enable row level security; alter table xs_reports enable row level security;
create policy p_sel on xs_profiles for select to authenticated using(true);
create policy p_upd on xs_profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy c_sel on xs_conversations for select to authenticated using(xs_is_member(id));
create policy c_upd on xs_conversations for update to authenticated using(xs_is_admin(id));
create policy m_sel on xs_members for select to authenticated using(xs_is_member(conversation_id));
create policy msg_sel on xs_messages for select to authenticated using(xs_is_member(conversation_id));
create policy msg_ins on xs_messages for insert to authenticated with check(sender_id=auth.uid() and xs_is_member(conversation_id));
create policy msg_upd on xs_messages for update to authenticated using(sender_id=auth.uid() or xs_is_admin(conversation_id));
create policy r_sel on xs_reactions for select to authenticated using(exists(select 1 from xs_messages m where m.id=message_id and xs_is_member(m.conversation_id)));
create policy r_ins on xs_reactions for insert to authenticated with check(user_id=auth.uid());
create policy r_del on xs_reactions for delete to authenticated using(user_id=auth.uid());
create policy b_all on xs_blocks for all to authenticated using(blocker_id=auth.uid()) with check(blocker_id=auth.uid());
create policy rep_ins on xs_reports for insert to authenticated with check(reporter_id=auth.uid());

alter publication supabase_realtime add table xs_messages, xs_members, xs_reactions;

insert into storage.buckets(id,name,public) values('xs-avatars','xs-avatars',true) on conflict do nothing;
create policy xs_av_read on storage.objects for select using(bucket_id='xs-avatars');
create policy xs_av_write on storage.objects for insert to authenticated with check(bucket_id='xs-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
create policy xs_av_upd on storage.objects for update to authenticated using(bucket_id='xs-avatars' and (storage.foldername(name))[1]=auth.uid()::text);
