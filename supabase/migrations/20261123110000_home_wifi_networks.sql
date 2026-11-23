-- FlatApp: the flat's Wi-Fi networks, the precise "got home" signal.
--
-- Why: the Home circle cannot be smaller than about 100 m (phone location indoors is 20 to 50 m
-- off), so people showed as Home from the corner shop. Phones now report Home the moment they join
-- one of the flat's Wi-Fi networks, and ignore a circle "Out" while still on it. The network name
-- is matched on the phone; only Home or Out is ever sent.
--
-- * The list lives on the flat and is shared by all flatmates: routers often broadcast two names
--   (2.4 and 5 GHz, "Home" and "Home_5G") and some flats have two routers. Any member may add or
--   remove a name, like the rest of the flat info; at most 10.
-- * Flat info's Wi-Fi name is copied into the list now and whenever it is saved, so most flats need
--   no setup. A changed name is added, not swapped: the old router may still be in use, and the list
--   can be tidied by hand.

alter table public.flats
  add column home_networks text[] not null default '{}'
  check (cardinality(home_networks) <= 10);

update public.flats f
set home_networks = array[trim(i.wifi_name)]
from public.flat_info i
where i.flat_id = f.id and nullif(trim(i.wifi_name), '') is not null and cardinality(f.home_networks) = 0;

create function public.add_home_network(p_flat uuid, p_ssid text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  name_ text := trim(coalesce(p_ssid, ''));
  list text[];
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  if char_length(name_) not between 1 and 64 then raise exception 'That is not a Wi-Fi name' using errcode = '22023'; end if;
  select home_networks into list from public.flats where id = p_flat for update;
  if name_ = any(list) then return list; end if;
  if cardinality(list) >= 10 then raise exception 'A flat can have up to 10 Wi-Fi networks' using errcode = '23514'; end if;
  update public.flats set home_networks = home_networks || name_ where id = p_flat returning home_networks into list;
  return list;
end $$;

create function public.remove_home_network(p_flat uuid, p_ssid text) returns text[]
language plpgsql security definer set search_path = '' as $$
declare
  list text[];
begin
  if not public.is_flat_member(p_flat) then raise exception 'You are not in this flat' using errcode = '42501'; end if;
  update public.flats set home_networks = array_remove(home_networks, p_ssid) where id = p_flat returning home_networks into list;
  return list;
end $$;

-- Saving flat info with a Wi-Fi name adds that name to the list (silently skipped when the list is full).
create function public.flat_info_add_home_network() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  name_ text := nullif(trim(coalesce(new.wifi_name, '')), '');
begin
  if name_ is not null then
    update public.flats set home_networks = home_networks || name_
    where id = new.flat_id and not (name_ = any(home_networks)) and cardinality(home_networks) < 10;
  end if;
  return null;
end $$;

create trigger flat_info_home_network
  after insert or update of wifi_name on public.flat_info
  for each row execute function public.flat_info_add_home_network();

-- New functions are executable by everyone by default on Supabase: close them, then open the two the
-- app calls to signed-in people only.
revoke execute on function
  public.add_home_network(uuid, text),
  public.remove_home_network(uuid, text),
  public.flat_info_add_home_network()
from public, anon, authenticated;
grant execute on function
  public.add_home_network(uuid, text),
  public.remove_home_network(uuid, text)
to authenticated;

notify pgrst, 'reload schema';
