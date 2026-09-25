"""
models.py — Modelos ORM SQLAlchemy para o MVP Quicker Compras.

Tabelas:
    - users        → Usuários do sistema
    - solicitacoes → Solicitações de estoque
"""

from datetime import date

from sqlalchemy import Column, Date, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship, Mapped

from database import Base


# ---------------------------------------------------------------------------
# Tabela: users
# ---------------------------------------------------------------------------


class User(Base):
    """
    Representa um usuário do sistema.

    Atributos:
        id       (int) : Chave primária auto-incrementada.
        username (str) : Nome de login — único no sistema.
        password (str) : Senha em texto puro (MVP). Migrar para hash em produção.
        role     (str) : Perfil de acesso. Valores: 'admin', 'solicitante', 'estoque'.
    """

    __tablename__ = "users"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    username: Mapped[str] = Column(
        String(100), unique=True, nullable=False, index=True
    )
    password: Mapped[str] = Column(String(255), nullable=False)
    role: Mapped[str] = Column(
        String(50), nullable=False, default="solicitante"
    )

    solicitacoes: Mapped[list["Solicitacao"]] = relationship(
        "Solicitacao",
        back_populates="solicitante",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<User id={self.id} username={self.username!r} role={self.role!r}>"


# ---------------------------------------------------------------------------
# Tabela: solicitacoes
# ---------------------------------------------------------------------------


class Solicitacao(Base):
    """
    Representa uma solicitação de estoque emitida por um usuário.

    Atributos:
        id             (int)        : PK auto-incrementada.
        status         (str)        : Estado. Default: 'ABERTA'.
        data_criacao   (date)       : Data de abertura.
        solicitante_id (int)        : FK → users.id.
        setor          (str | None) : Setor de origem da requisição.
        destino        (str)        : Local de destino do material.
        objetivo       (str)        : Objetivo da requisição.
        justificativa  (str | None) : Justificativa textual opcional.
        materiais      (list | None): Lista JSON de materiais.
        observacoes    (str | None) : Observações gerais opcionais.
    """

    __tablename__ = "solicitacoes"

    id: Mapped[int] = Column(Integer, primary_key=True, index=True)
    status: Mapped[str] = Column(
        String(50), nullable=False, default="ABERTA"
    )
    data_criacao: Mapped[date] = Column(
        Date, nullable=False, default=date.today
    )
    solicitante_id: Mapped[int] = Column(
        Integer,
        ForeignKey("users.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    setor: Mapped[str | None] = Column(String(100), nullable=True)
    destino: Mapped[str] = Column(String(255), nullable=False)
    objetivo: Mapped[str] = Column(String(255), nullable=False)
    justificativa: Mapped[str | None] = Column(String(1000), nullable=True)
    materiais: Mapped[list | None] = Column(JSON, nullable=True)
    observacoes: Mapped[str | None] = Column(String(1000), nullable=True)

    solicitante: Mapped["User"] = relationship(
        "User",
        back_populates="solicitacoes",
    )

    def __repr__(self) -> str:
        return (
            f"<Solicitacao id={self.id} status={self.status!r} "
            f"solicitante_id={self.solicitante_id} destino={self.destino!r}>"
        )
