-- 1. Create the Config Table
create table public.app_config (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Enable Row Level Security (Security First!)
alter table public.app_config enable row level security;

-- 3. Policy: Allow READ access to everyone (Application needs to read the key)
--    Note: In a stricter environment, you would use an auth-gated policy,
--    but for distributing an app key to clients, public read (via anon key) is the standard pattern.
create policy "Allow public read access"
  on public.app_config
  for select
  using (true);

-- 4. Policy: Allow WRITE access ONLY to authenticated service role / admins
--    (Prevents random users from changing your API Key)
create policy "Allow internal update access"
  on public.app_config
  for all
  using (auth.role() = 'service_role');

-- 5. Insert Initial Keys (Seed Data)
insert into public.app_config (key, value, description)
values
  ('groq_api_key', '<INSIRA_CHAVE_AQUI>', 'Chave principal da API Groq AI'),
  ('groq_model', 'llama-3.3-70b-versatile', 'Modelo LLM padrão a ser usado'),
  ('app_status', 'active', 'Flag para controle de shutdown remoto (active/maintenance)');
