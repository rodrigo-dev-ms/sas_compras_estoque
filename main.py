from fastapi import FastAPI, Form, Request, status
from fastapi.responses import HTMLResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from datetime import date
import uvicorn

app = FastAPI(title="Solicitação de Estoque MVP")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Usuários hardcoded para o MVP (substituir por banco de dados futuramente)
USERS: dict[str, str] = {
    "rodrigo": "admin123",
    "estoque": "estoque123",
}


@app.get("/", response_class=HTMLResponse)
async def login_page(request: Request) -> HTMLResponse:
    """Renderiza a página de login."""
    return templates.TemplateResponse("login.html", {"request": request})


@app.post("/login", response_model=None)
async def login(
    request: Request,
    username: str = Form(...),
    password: str = Form(...),
) -> RedirectResponse | HTMLResponse:
    """Autentica o usuário e redireciona para o dashboard."""
    if USERS.get(username) == password:
        response = RedirectResponse(
            url="/dashboard",
            status_code=status.HTTP_302_FOUND,
        )
        response.set_cookie(key="session_user", value=username)
        return response

    return templates.TemplateResponse(
        "login.html",
        {"request": request, "error": "Credenciais inválidas"},
    )


@app.get("/dashboard", response_class=HTMLResponse, response_model=None)
async def dashboard(request: Request) -> HTMLResponse | RedirectResponse:
    """Renderiza o dashboard principal para usuários autenticados."""
    user: str | None = request.cookies.get("session_user")

    if not user:
        return RedirectResponse(url="/")

    hoje: str = date.today().strftime("%Y-%m-%d")
    return templates.TemplateResponse(
        "dashboard.html",
        {"request": request, "user": user, "data_atual": hoje},
    )


@app.post("/logout")
async def logout() -> RedirectResponse:
    """Encerra a sessão do usuário e redireciona para o login."""
    response = RedirectResponse(url="/", status_code=status.HTTP_302_FOUND)
    response.delete_cookie(key="session_user")
    return response


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
