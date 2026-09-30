# Quicker Compras — MVP de Gestão de Estoque (v1.1.0)

Sistema web de requisição interna de materiais e equipamentos (Ordens de Serviço), desenvolvido para otimizar, padronizar e rastrear o fluxo de compras e liberação de estoque.

## 🎯 O Problema e a Solução
Antes da implementação, o controle de requisições carecia de um fluxo rastreável e padronizado. O **Quicker Compras** centraliza esta operação em uma interface unificada, garantindo integridade dos dados e gerando automaticamente documentos oficiais em PDF (A4 estrito) com layouts travados matematicamente via CSS absoluto, ideais para assinatura e arquivamento formal.

## 🚀 Arquitetura em Produção e Stack
O sistema opera em nuvem sob os princípios de **Clean Architecture**, com foco em performance e manutenibilidade.

*   **Front-end:** HTML5 semântico, CSS3 (Grid/Flexbox nativo), Vanilla JS.
*   **Back-end:** Python 3.10+ com FastAPI (Assíncrono e autodocumentado).
*   **Banco de Dados:** PostgreSQL hospedado via Neon.tech (Serverless).
*   **Hospedagem & CI/CD:** Render (PaaS) conectado ao repositório GitHub para *auto-deploy* no commit.
*   **Monitoramento:** Endpoint dedicado `/healthz` monitorado via UptimeRobot, garantindo SLA e prevenindo *cold starts* dos containers.

## ⚙️ Funcionalidades (v1.1.0)
*   **Gestão de O.S.:** Criação, histórico, edição de status e exportação client-side para PDF.
*   **Segurança (RBAC):** Perfis de acesso rígidos (`admin`, `solicitante`, `compras`). 
*   **Self-Service de Credenciais:** Usuários não-administradores possuem acesso isolado para alteração da própria senha, sem permissões destrutivas no sistema.

## 💻 Guia para Desenvolvimento Local
*Para manutenção ou escalabilidade da aplicação fora do ambiente de produção.*

```bash
# 1. Clone o repositório
git clone [https://github.com/rodrigo-dev-ms/sas_compras_estoque.git](https://github.com/rodrigo-dev-ms/sas_compras_estoque.git)
cd sas_compras_estoque

# 2. Ative o ambiente virtual e instale dependências
python -m venv .venv
source .venv/bin/activate  # Linux/Mac (Use .venv\Scripts\activate no Windows)
pip install -r requirements.txt

# 3. Defina as variáveis de ambiente (.env) apontando para o banco de homologação/local
DATABASE_URL=postgresql://usuario:senha@localhost:5432/db_local

# 4. Inicie o servidor ASGI
uvicorn main:app --reload


Desenvolvido por Rodrigo M. de Souza — Engenharia de Software Pragmática.