-- Fix: "Database error saving new user" when inviting a team member.
--
-- Root cause: the auth.users → public.profiles trigger writes to columns
-- `full_name` and `avatar_url` (Supabase's example default), but our
-- profiles table actually has `name` and `avatar`. The schema mismatch
-- makes the underlying INSERT INTO public.profiles fail, which rolls
-- back the auth.users INSERT, which surfaces as the cryptic
-- "Database error saving new user" in inviteUserByEmail().
--
-- Run in the Supabase SQL editor:
--   https://supabase.com/dashboard/project/jlatxzeiuwabgxjjhuic/sql/new
--
-- Safe to re-run (DROP IF EXISTS + CREATE OR REPLACE).

-- 1. Replace the trigger function with one that targets our real column
--    names. Reads role + name out of the raw user_meta_data the inviter
--    passes via the `data` option on inviteUserByEmail / generateLink.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, name, role, avatar, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    -- Fall back to the localpart of the email if no name was supplied.
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    -- Honor the role the inviter chose; default to 'designer'.
    COALESCE(NEW.raw_user_meta_data->>'role', 'designer'),
    -- Avatar is a one-character initial used by the team-list chips.
    UPPER(LEFT(COALESCE(NEW.raw_user_meta_data->>'name', NEW.email), 1)),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- 2. (Re)attach the trigger. DROP-then-CREATE keeps the migration
--    idempotent and ensures any out-of-date prior definition is gone.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
