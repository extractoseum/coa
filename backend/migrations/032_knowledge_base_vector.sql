-- Enable the pgvector extension to work with embeddings
create extension if not exists vector;

-- Create a table to store knowledge snippets (reviews, policies, etc.)
create table if not exists knowledge_base (
  id bigserial primary key,
  content text not null,               -- The actual text chunk (e.g. a single review)
  embedding vector(1536),              -- OpenAI text-embedding-3-small dimension
  metadata jsonb default '{}'::jsonb,  -- Extra info: { "source": "reviews.md", "stars": 5, "product_id": "123" }
  created_at timestamptz default now()
);

-- Create a function to search for similar content
create or replace function match_knowledge (
  query_embedding vector(1536),
  match_threshold float,
  match_count int
)
returns table (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    knowledge_base.id,
    knowledge_base.content,
    knowledge_base.metadata,
    1 - (knowledge_base.embedding <=> query_embedding) as similarity
  from knowledge_base
  where 1 - (knowledge_base.embedding <=> query_embedding) > match_threshold
  order by knowledge_base.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create an index to make searches faster (IVFFlat)
-- We use cosine distance (vector_cosine_ops)
create index on knowledge_base using ivfflat (embedding vector_cosine_ops)
with (lists = 100);
