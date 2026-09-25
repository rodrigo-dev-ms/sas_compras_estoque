"""
database.py — Configuração do engine SQLAlchemy e inicialização do banco.

Carrega DATABASE_URL do arquivo .env via python-dotenv.
Expõe: engine, SessionLocal, Base e init_db().
"""

import os
import logging

from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker, Session

# Carrega as variáveis do arquivo .env (se existir)
load_dotenv()

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Engine e Session Factory
# ---------------------------------------------------------------------------

DATABASE_URL: str | None = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise RuntimeError(
        "Variável de ambiente DATABASE_URL não definida. "
        "Crie um arquivo .env com DATABASE_URL=postgresql://user:pass@host:5432/dbname"
    )

engine = create_engine(
    DATABASE_URL,
    # Pool adequado para monólito single-process com Uvicorn
    pool_pre_ping=True,        # Verifica conexão morta antes de reutilizar
    pool_size=5,               # Conexões mantidas abertas
    max_overflow=10,           # Conexões extras permitidas sob alta carga
    echo=False,                # True → loga todas as queries SQL (debug)
)

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)


# ---------------------------------------------------------------------------
# Base Declarativo
# ---------------------------------------------------------------------------

class Base(DeclarativeBase):
    """Base para todos os modelos ORM do projeto."""


# ---------------------------------------------------------------------------
# Utilitário de Sessão para FastAPI (Depends)
# ---------------------------------------------------------------------------

def get_db():
    """
    Gerador de sessão para injeção de dependência via FastAPI Depends.

    Uso:
        @app.get("/endpoint")
        def endpoint(db: Session = Depends(get_db)): ...
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------------------------------------------------------------------------
# Inicialização do Banco de Dados
# ---------------------------------------------------------------------------

def init_db() -> None:
    """
    Cria todas as tabelas mapeadas no Base (se ainda não existirem) e
    garante a existência de um usuário administrador padrão.

    Regra crítica:
        Se a tabela 'users' estiver vazia após a criação, insere
        automaticamente o usuário 'admin' para não bloquear o login.
    """
    # Importação local evita circular import entre database ↔ models
    from models import User  # noqa: PLC0415

    logger.info("Criando tabelas no banco de dados (se necessário)...")
    Base.metadata.create_all(bind=engine)
    logger.info("Tabelas verificadas/criadas com sucesso.")

    # Verifica e semeia o usuário admin padrão
    with SessionLocal() as session:
        user_count: int = session.query(User).count()

        if user_count == 0:
            admin = User(
                username="admin",
                password="admin123",  # MVP — substituir por hash em produção
                role="admin",
            )
            session.add(admin)
            session.commit()
            logger.info(
                "Banco de dados vazio detectado. "
                "Usuário padrão 'admin' criado com sucesso."
            )
        else:
            logger.info(
                "Tabela 'users' já contém %d registro(s). "
                "Seed ignorado.",
                user_count,
            )
