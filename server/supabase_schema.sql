-- Enable UUID Extension if not exists
create extension if not exists "uuid-ossp";

-- Table: ai_global_memory
-- Purpose: Stores the collective intelligence (Hive Mind)
create table if not exists ai_global_memory (
    id uuid primary key default uuid_generate_v4(),
    term text not null,                       -- The search term (e.g., "FATURAMENTO")
    target text not null,                     -- The resolved target (e.g., "TB_FAT_2024")
    type text default 'is_alias_of',          -- Relationship type
    weight float default 1.0,                 -- Connection strength
    confidence_score float default 0.5,       -- Trust Score (0.0 to 1.0)
    created_by text,                          -- Username or 'ADMIN'
    created_at timestamptz default now(),
    app_version text,                         -- Application Version (e.g. '1.15.96')
    source_type text check (source_type in ('MANUAL_OVERRIDE', 'PASSIVE_OBSERVATION', 'ADMIN_VERIFIED', 'OFFICIAL_DEV')),
    validation_status text default 'PENDING' check (validation_status in ('PENDING', 'VERIFIED', 'REJECTED')),
    
    -- Constraint: Uniqueness on Term + Target to prevent dupes (Upsert key)
    constraint unique_term_target unique (term, target)
);

-- Index for fast lookup
create index if not exists idx_global_memory_term on ai_global_memory(term);
create index if not exists idx_global_memory_target on ai_global_memory(target);
create index if not exists idx_global_memory_source on ai_global_memory(source_type);
create index if not exists idx_global_memory_valid on ai_global_memory(validation_status);

-- Table: ai_config
-- Purpose: Global switches and version control (Governance)
create table if not exists ai_config (
    key text primary key,                     -- e.g. 'min_kb_version', 'force_reset_flag'
    value text,                               -- e.g. '2.2.0', 'true'
    description text,
    updated_at timestamptz default now()
);

-- Initial Config Data
insert into ai_config (key, value, description) values 
('min_kb_version', '0.0.1', 'Minimum Knowledge Base version required. Lower versions trigger reset.'),
('force_reset_flag', 'false', 'If true, forces a hard reset of local memory on next sync.')
on conflict (key) do nothing;

-- RLS Policies (Row Level Security) - Optional but recommended
alter table ai_global_memory enable row level security;
alter table ai_config enable row level security;

-- Allow Read/Write for Authenticated Users (Adjust as needed)
create policy "Enable all for users" on ai_global_memory for all using (true);
create policy "Enable read for users" on ai_config for select using (true);
