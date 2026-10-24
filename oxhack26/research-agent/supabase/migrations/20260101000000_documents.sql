-- Uploaded documents, one row per chunk. Everything that belongs to one file
-- shares metadata->>'document_id'.
create extension if not exists vector;

create table if not exists public.documents (
  id bigserial primary key,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(1536) not null
);

create index if not exists documents_embedding_idx
  on public.documents using hnsw (embedding vector_cosine_ops);

create index if not exists documents_document_id_idx
  on public.documents ((metadata->>'document_id'));

-- Nearest chunks, optionally restricted to a set of documents.
create or replace function public.match_documents(
  query_embedding vector(1536),
  match_count int,
  document_ids text[] default null
)
returns table (id bigint, content text, metadata jsonb, similarity float)
language sql stable
as $$
  select d.id, d.content, d.metadata, 1 - (d.embedding <=> query_embedding) as similarity
  from public.documents d
  where document_ids is null or d.metadata->>'document_id' = any(document_ids)
  order by d.embedding <=> query_embedding
  limit match_count;
$$;

alter table public.documents enable row level security;
