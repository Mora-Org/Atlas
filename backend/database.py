import os
from sqlalchemy import MetaData, create_engine, event
from sqlalchemy.orm import sessionmaker, declarative_base

_URL_PADRAO = "sqlite:///./dynamic_template.db"


def _resolver_url(bruta: str | None) -> str:
    """Variável AUSENTE e variável VAZIA têm que cair no mesmo default.

    `os.environ.get(k, default)` só devolve o default quando a chave **não
    existe**. `DATABASE_URL=` (setada, vazia) devolvia `""`, e `create_engine("")`
    estoura no import do módulo com "Could not parse SQLAlchemy URL from given
    URL string" — mensagem que não diz nada sobre a causa e acontece antes de
    qualquer log subir.

    Não é hipótese: aconteceu no primeiro CI com matriz de engine, onde a perna
    SQLite declarava `DATABASE_URL: ""`. Painel de plataforma (Railway, Vercel)
    deixa variável vazia com a mesma facilidade — apagar o valor não apaga a
    chave.

    O `.strip()` continua defendendo do newline colado do dashboard, que
    quebrava o psycopg2 com FATAL: database "postgres\\n" does not exist.
    """
    return (bruta or "").strip() or _URL_PADRAO


DATABASE_URL = _resolver_url(os.environ.get("DATABASE_URL"))

# Schema das tabelas de sistema. Em Postgres (Supabase), fixamos `public`
# para escapar do conflito com `auth.users` (Supabase Auth) — search_path
# pode ser sobrescrito pelo pooler entre conexões. Em SQLite, schema=None
# (não há schemas).
_SYSTEM_SCHEMA = "public" if DATABASE_URL.startswith("postgres") else None


def _engine_kwargs(url: str) -> dict:
    if url.startswith("sqlite"):
        return {"connect_args": {"check_same_thread": False}}
    # Postgres: pool_pre_ping evita conexões mortas após idle/restart do servidor.
    return {"pool_pre_ping": True, "pool_size": 5, "max_overflow": 10}


engine = create_engine(DATABASE_URL, **_engine_kwargs(DATABASE_URL))


# Em Supabase, o role `postgres` herda search_path que inclui `auth` antes de
# `public`. Como `auth.users` existe (Supabase Auth) e nosso `public.users`
# também, consultas não-qualificadas `FROM users` resolvem pra `auth.users`
# e quebram. Forçamos `search_path = public` em toda conexão nova do pool.
if engine.dialect.name == "postgresql":
    @event.listens_for(engine, "connect")
    def _set_search_path(dbapi_conn, connection_record):
        cur = dbapi_conn.cursor()
        cur.execute("SET search_path TO public")
        cur.close()

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Em PG, todas as system tables vão pra `public` schema (qualified no SQL
# emitido pelo ORM), evitando colisão com `auth.users` mesmo se search_path
# for resetado pelo pooler.
_metadata = MetaData(schema=_SYSTEM_SCHEMA) if _SYSTEM_SCHEMA else MetaData()
Base = declarative_base(metadata=_metadata)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_postgres() -> bool:
    return engine.dialect.name == "postgresql"
