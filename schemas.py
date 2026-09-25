"""
schemas.py — Schemas Pydantic para validação de entrada e serialização de
             saída da API Quicker Compras.

Convenção de nomenclatura:
    - <Entidade>Create  → payload de criação (POST)
    - <Entidade>Update  → payload de atualização parcial/total (PUT)
    - <Entidade>Read    → resposta serializada com dados relacionados
    - <campo>Update     → payload de atualização de campo específico
"""

from datetime import date
from typing import Any

from pydantic import BaseModel, Field


# ===========================================================================
# SOLICITAÇÕES
# ===========================================================================


class SolicitacaoCreate(BaseModel):
    """
    Payload de criação de uma solicitação de estoque (POST /api/solicitacoes).

    Nota: o campo `status` NÃO é aceito aqui — a rota força 'ABERTA'.
    O `solicitante_id` é injetado via cookie pelo back-end.
    """

    setor: str | None = Field(default=None, max_length=100)
    destino: str = Field(..., max_length=255)
    objetivo: str = Field(..., max_length=255)
    justificativa: str | None = Field(default=None, max_length=1000)
    materiais: list[dict[str, Any]] | None = Field(default=None)
    observacoes: str | None = Field(default=None, max_length=1000)
    data_criacao: date | None = Field(default=None)


class SolicitacaoUpdate(BaseModel):
    """
    Payload de atualização completa de uma O.S. (PUT /api/solicitacoes/{id}).

    Só é aceito para solicitações com status 'ABERTA' ou 'EM ANDAMENTO'.
    Campos omitidos (None) são ignorados — atualização parcial (PATCH-like).
    """

    setor: str | None = Field(default=None, max_length=100)
    destino: str | None = Field(default=None, max_length=255)
    objetivo: str | None = Field(default=None, max_length=255)
    justificativa: str | None = Field(default=None, max_length=1000)
    materiais: list[dict[str, Any]] | None = Field(default=None)
    observacoes: str | None = Field(default=None, max_length=1000)


class StatusUpdate(BaseModel):
    """
    Payload exclusivo para alteração de status
    (PUT /api/solicitacoes/{id}/status).

    Valores aceitos definidos em STATUS_ATUALIZAVEIS (não inclui 'ABERTA',
    pois status inicial é gerenciado pela criação).
    """

    status: str = Field(
        ...,
        description="EM ANDAMENTO | FINALIZADA",
    )


class SolicitacaoRead(BaseModel):
    """
    Schema de leitura de uma solicitação — retornado nas respostas da API.
    Inclui o nome do solicitante para evitar join extra no front-end.
    """

    id: int
    status: str
    data_criacao: date | None
    solicitante_id: int
    solicitante_nome: str          # campo calculado, não existe na tabela
    setor: str | None
    destino: str
    objetivo: str
    justificativa: str | None
    materiais: list[dict[str, Any]] | None
    observacoes: str | None

    model_config = {"from_attributes": True}


# ===========================================================================
# USUÁRIOS
# ===========================================================================


class UsuarioCreate(BaseModel):
    """Payload de criação de usuário (POST /api/usuarios). Apenas admin."""

    username: str = Field(..., min_length=3, max_length=100)
    password: str = Field(..., min_length=6, max_length=255)
    role: str = Field(
        default="solicitante",
        description="admin | solicitante | estoque | inativo",
    )


class UsuarioUpdate(BaseModel):
    """
    Payload de atualização de usuário (PUT /api/usuarios/{usuario_id}).
    Apenas administradores. Permite alterar username, senha, role ou inativar.
    """

    username: str | None = Field(default=None, min_length=3, max_length=100)
    password: str | None = Field(default=None, min_length=6, max_length=255)
    role: str | None = Field(
        default=None,
        description="admin | solicitante | estoque | inativo",
    )
    is_active: bool | None = Field(
        default=None,
        description="Sinalizador opcional de ativação/inativação",
    )


class UsuarioPasswordReset(BaseModel):
    """Payload para redefinição de senha (PUT /api/usuarios/{id}/senha)."""

    nova_senha: str = Field(..., min_length=6, max_length=255)


class UsuarioRead(BaseModel):
    """Schema de leitura de usuário — senha NUNCA é exposta."""

    id: int
    username: str
    role: str

    model_config = {"from_attributes": True}
