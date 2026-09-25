"""
main.py — Ponto de entrada da aplicação Quicker Compras (MVP).

Responsabilidades:
    - Lifespan: inicializa o banco de dados na subida da aplicação.
    - Rotas HTML: login, dashboard e logout (Jinja2 + cookies de sessão).
    - API /api/solicitacoes: CRUD completo com regras de negócio de status.
    - API /api/usuarios: gestão de usuários restrita a administradores.
"""

import logging
from contextlib import asynccontextmanager
from datetime import date
from typing import Any, AsyncGenerator

import uvicorn
from fastapi import Depends, FastAPI, Form, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from sqlalchemy.orm import Session

from database import get_db, init_db
from models import Solicitacao, User
from schemas import (
    SolicitacaoCreate,
    SolicitacaoUpdate,
    StatusUpdate,
    UsuarioCreate,
    UsuarioPasswordReset,
    UsuarioRead,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constantes de negócio
# ---------------------------------------------------------------------------

# Status que permitem a atualização da O.S. completa (PUT /api/solicitacoes/{id})
STATUS_EDITAVEIS: set[str] = {"ABERTA", "EM ANDAMENTO"}

# Status aceitos na rota dedicada de mudança de status
STATUS_ATUALIZAVEIS: set[str] = {"EM ANDAMENTO", "FINALIZADA"}

# Todos os status válidos no sistema
STATUS_VALIDOS: set[str] = {"ABERTA", "EM ANDAMENTO", "FINALIZADA"}

# Role que concede acesso administrativo
ROLE_ADMIN: str = "admin"

# ---------------------------------------------------------------------------
# Lifespan — inicializa o banco antes de aceitar requisições
# ---------------------------------------------------------------------------


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Contexto de ciclo de vida da aplicação.

    Startup : executa init_db() — cria tabelas e semeia usuário admin.
    Shutdown: reservado para fechar recursos futuros (cache, filas, etc.).
    """
    logger.info("Iniciando aplicação — executando init_db()...")
    init_db()
    logger.info("Banco de dados pronto. Aplicação no ar.")
    yield
    logger.info("Encerrando aplicação.")


# ---------------------------------------------------------------------------
# Instância FastAPI
# ---------------------------------------------------------------------------

app = FastAPI(
    title="Quicker Compras — Solicitação de Estoque",
    version="0.3.0",
    lifespan=lifespan,
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ---------------------------------------------------------------------------
# Dependências reutilizáveis
# ---------------------------------------------------------------------------


def _get_user_from_cookie(request: Request, db: Session) -> User | None:
    """
    Lê o cookie 'session_user_id' e retorna o objeto User correspondente.

    Returns:
        User se autenticado, None caso contrário.
    """
    raw: str | None = request.cookies.get("session_user_id")
    if not raw:
        return None
    try:
        user_id = int(raw)
    except ValueError:
        return None
    return db.query(User).filter(User.id == user_id).first()


def _requer_auth(request: Request, db: Session = Depends(get_db)) -> User:
    """
    Dependência FastAPI: exige que o usuário esteja autenticado.

    Raises:
        HTTP 401 — cookie ausente ou ID inválido.
    """
    user: User | None = _get_user_from_cookie(request, db)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não autenticado.",
        )
    return user


def _requer_admin(
    current_user: User = Depends(_requer_auth),
) -> User:
    """
    Dependência FastAPI: exige perfil de administrador.

    Raises:
        HTTP 403 — usuário autenticado mas sem perfil admin.
    """
    if current_user.role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Acesso restrito a administradores.",
        )
    return current_user


# ---------------------------------------------------------------------------
# Rotas HTML — Autenticação e Dashboard
# ---------------------------------------------------------------------------


@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request) -> HTMLResponse:
    """Renderiza a página de login."""
    return templates.TemplateResponse("login.html", {"request": request})


@app.post("/login", response_model=None)
async def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
    db: Session = Depends(get_db),
) -> RedirectResponse | HTMLResponse:
    """
    Autentica o usuário via banco de dados (senha texto puro — MVP).

    Sucesso : seta cookie 'session_user_id' e redireciona para /dashboard.
    Falha   : re-renderiza login.html com mensagem de erro.
    """
    user: User | None = (
        db.query(User).filter(User.username == username).first()
    )

    if user and user.password == password:
        response = RedirectResponse(
            url="/dashboard",
            status_code=status.HTTP_302_FOUND,
        )
        response.set_cookie(
            key="session_user_id",
            value=str(user.id),
            httponly=True,
            samesite="lax",
        )
        logger.info(
            "Login bem-sucedido: user_id=%d username=%r", user.id, user.username
        )
        return response

    logger.warning("Tentativa de login falhou para username=%r", username)
    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Credenciais inválidas"},
        status_code=status.HTTP_401_UNAUTHORIZED,
    )


@app.get("/dashboard", response_class=HTMLResponse, response_model=None)
async def dashboard(
    request: Request,
    db: Session = Depends(get_db),
) -> HTMLResponse | RedirectResponse:
    """
    Renderiza o dashboard principal.
    Redireciona para '/' se o usuário não estiver autenticado.
    """
    user: User | None = _get_user_from_cookie(request, db)

    if not user:
        return RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)

    hoje: str = date.today().strftime("%Y-%m-%d")
    return templates.TemplateResponse(
        "dashboard.html",
        {
            "request": request,
            "user": user.username,
            "user_id": user.id,
            "user_role": user.role,
            "data_atual": hoje,
        },
    )


@app.post("/logout", response_model=None)
async def logout() -> RedirectResponse:
    """Encerra a sessão deletando o cookie e redireciona para o login."""
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="session_user_id")
    logger.info("Sessão encerrada.")
    return response


# ---------------------------------------------------------------------------
# API — Solicitações de Estoque
# ---------------------------------------------------------------------------


@app.post(
    "/api/solicitacoes",
    status_code=status.HTTP_201_CREATED,
    tags=["Solicitações"],
)
async def criar_solicitacao(
    payload: SolicitacaoCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_requer_auth),
) -> JSONResponse:
    """
    Cria uma nova solicitação atrelada ao usuário logado.

    Regra: status é sempre forçado para 'ABERTA', independente do payload.
    """
    solicitacao = Solicitacao(
        solicitante_id=current_user.id,
        status="ABERTA",                          # força — ignora qualquer input
        setor=payload.setor,
        destino=payload.destino,
        objetivo=payload.objetivo,
        justificativa=payload.justificativa,
        materiais=payload.materiais,
        observacoes=payload.observacoes,
        data_criacao=payload.data_criacao or date.today(),
    )
    db.add(solicitacao)
    db.commit()
    db.refresh(solicitacao)

    logger.info(
        "O.S. criada: id=%d user_id=%d destino=%r",
        solicitacao.id,
        current_user.id,
        solicitacao.destino,
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=_serializar_solicitacao(solicitacao),
    )


@app.get(
    "/api/solicitacoes",
    tags=["Solicitações"],
)
async def listar_solicitacoes(
    db: Session = Depends(get_db),
    current_user: User = Depends(_requer_auth),  # noqa: ARG001
) -> JSONResponse:
    """
    Retorna todas as solicitações em formato JSON.
    Inclui o nome do solicitante em cada registro.
    """
    solicitacoes: list[Solicitacao] = db.query(Solicitacao).all()
    return JSONResponse(
        content=[_serializar_solicitacao(s) for s in solicitacoes]
    )


@app.put(
    "/api/solicitacoes/{solicitacao_id}",
    tags=["Solicitações"],
)
async def atualizar_solicitacao(
    solicitacao_id: int,
    payload: SolicitacaoUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_requer_auth),
) -> JSONResponse:
    """
    Atualiza os dados principais de uma O.S. (Editar Itens, Setor, Destino,
    Objetivo).

    Regra de negócio:
        - Só permitido se status for 'ABERTA' ou 'EM ANDAMENTO'.
        - Campos None no payload são ignorados (não sobrescrevem o valor atual).

    Raises:
        HTTP 403 — O.S. com status 'FINALIZADA' não pode ser editada.
        HTTP 404 — O.S. não encontrada.
    """
    solicitacao: Solicitacao | None = (
        db.query(Solicitacao)
        .filter(Solicitacao.id == solicitacao_id)
        .first()
    )
    if not solicitacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitação id={solicitacao_id} não encontrada.",
        )

    if solicitacao.status not in STATUS_EDITAVEIS:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=(
                f"Solicitação id={solicitacao_id} com status "
                f"'{solicitacao.status}' não pode ser editada."
            ),
        )

    # Aplica apenas os campos fornecidos no payload (parcial)
    campos_atualizaveis = payload.model_dump(exclude_unset=True)
    for campo, valor in campos_atualizaveis.items():
        if valor is not None:
            setattr(solicitacao, campo, valor)

    db.commit()
    db.refresh(solicitacao)

    logger.info(
        "O.S. atualizada: id=%d user_id=%d campos=%s",
        solicitacao_id,
        current_user.id,
        list(campos_atualizaveis.keys()),
    )
    return JSONResponse(content=_serializar_solicitacao(solicitacao))


@app.put(
    "/api/solicitacoes/{solicitacao_id}/status",
    tags=["Solicitações"],
)
async def atualizar_status(
    solicitacao_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(_requer_auth),
) -> JSONResponse:
    """
    Atualiza exclusivamente o campo 'status' de uma O.S.

    Valores aceitos: 'EM ANDAMENTO', 'FINALIZADA'.
    (A transição para 'ABERTA' é reservada à criação.)

    Raises:
        HTTP 400 — status inválido ou transição não permitida.
        HTTP 404 — O.S. não encontrada.
    """
    novo_status: str = payload.status.strip().upper()

    if novo_status not in STATUS_ATUALIZAVEIS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                f"Status '{novo_status}' inválido para esta operação. "
                f"Valores aceitos: {sorted(STATUS_ATUALIZAVEIS)}"
            ),
        )

    solicitacao: Solicitacao | None = (
        db.query(Solicitacao)
        .filter(Solicitacao.id == solicitacao_id)
        .first()
    )
    if not solicitacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitação id={solicitacao_id} não encontrada.",
        )

    if solicitacao.status == "FINALIZADA" and novo_status != "FINALIZADA":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uma O.S. finalizada não pode ser reaberta.",
        )

    solicitacao.status = novo_status
    db.commit()
    db.refresh(solicitacao)

    logger.info(
        "Status atualizado: id=%d %r → %r user_id=%d",
        solicitacao_id,
        solicitacao.status,
        novo_status,
        current_user.id,
    )
    return JSONResponse(content=_serializar_solicitacao(solicitacao))


@app.delete(
    "/api/solicitacoes/{solicitacao_id}",
    status_code=status.HTTP_200_OK,
    tags=["Solicitações"],
)
async def deletar_solicitacao(
    solicitacao_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(_requer_auth),  # noqa: ARG001
) -> JSONResponse:
    """
    Exclui permanentemente uma solicitação do banco.

    Raises:
        HTTP 404 — O.S. não encontrada.
    """
    solicitacao: Solicitacao | None = (
        db.query(Solicitacao)
        .filter(Solicitacao.id == solicitacao_id)
        .first()
    )
    if not solicitacao:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Solicitação id={solicitacao_id} não encontrada.",
        )

    db.delete(solicitacao)
    db.commit()

    logger.info(
        "O.S. excluída: id=%d user_id=%d",
        solicitacao_id,
        current_user.id,
    )
    return JSONResponse(
        content={"detail": f"Solicitação id={solicitacao_id} excluída com sucesso."}
    )


# ---------------------------------------------------------------------------
# API — Gestão de Usuários (somente admin)
# ---------------------------------------------------------------------------


@app.get(
    "/api/usuarios",
    tags=["Usuários — Admin"],
)
async def listar_usuarios(
    db: Session = Depends(get_db),
    _admin: User = Depends(_requer_admin),
) -> JSONResponse:
    """
    Lista todos os usuários do sistema.
    Restrito a administradores. Senha nunca é exposta.
    """
    usuarios: list[User] = db.query(User).order_by(User.id).all()
    return JSONResponse(
        content=[UsuarioRead.model_validate(u).model_dump() for u in usuarios]
    )


@app.post(
    "/api/usuarios",
    status_code=status.HTTP_201_CREATED,
    tags=["Usuários — Admin"],
)
async def criar_usuario(
    payload: UsuarioCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(_requer_admin),
) -> JSONResponse:
    """
    Cria um novo usuário no sistema.
    Restrito a administradores.

    Raises:
        HTTP 409 — username já existente.
    """
    existente: User | None = (
        db.query(User).filter(User.username == payload.username).first()
    )
    if existente:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Username '{payload.username}' já está em uso.",
        )

    novo_usuario = User(
        username=payload.username,
        password=payload.password,  # MVP — hash em produção
        role=payload.role,
    )
    db.add(novo_usuario)
    db.commit()
    db.refresh(novo_usuario)

    logger.info(
        "Usuário criado: id=%d username=%r role=%r",
        novo_usuario.id,
        novo_usuario.username,
        novo_usuario.role,
    )
    return JSONResponse(
        status_code=status.HTTP_201_CREATED,
        content=UsuarioRead.model_validate(novo_usuario).model_dump(),
    )


@app.put(
    "/api/usuarios/{usuario_id}/senha",
    tags=["Usuários — Admin"],
)
async def redefinir_senha(
    usuario_id: int,
    payload: UsuarioPasswordReset,
    db: Session = Depends(get_db),
    _admin: User = Depends(_requer_admin),
) -> JSONResponse:
    """
    Redefine a senha de um usuário.
    Restrito a administradores.

    Raises:
        HTTP 404 — usuário não encontrado.
    """
    usuario: User | None = (
        db.query(User).filter(User.id == usuario_id).first()
    )
    if not usuario:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Usuário id={usuario_id} não encontrado.",
        )

    usuario.password = payload.nova_senha  # MVP — hash em produção
    db.commit()

    logger.info(
        "Senha redefinida pelo admin: usuario_id=%d username=%r",
        usuario_id,
        usuario.username,
    )
    return JSONResponse(
        content={"detail": f"Senha do usuário '{usuario.username}' redefinida com sucesso."}
    )


# ---------------------------------------------------------------------------
# Helper de Serialização
# ---------------------------------------------------------------------------


def _serializar_solicitacao(s: Solicitacao) -> dict[str, Any]:
    """
    Converte um objeto Solicitacao em dict serializável para JSON.
    Inclui o username do solicitante via relacionamento ORM (já carregado).
    """
    nome_solicitante: str = (
        s.solicitante.username if s.solicitante else str(s.solicitante_id)
    )
    return {
        "id": s.id,
        "status": s.status,
        "data_criacao": s.data_criacao.isoformat() if s.data_criacao else None,
        "solicitante_id": s.solicitante_id,
        "solicitante_nome": nome_solicitante,
        "setor": s.setor,
        "destino": s.destino,
        "objetivo": s.objetivo,
        "justificativa": s.justificativa,
        "materiais": s.materiais,
        "observacoes": s.observacoes,
    }


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
