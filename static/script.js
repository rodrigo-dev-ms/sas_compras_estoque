/**
 * @fileoverview Lógica de manipulação do DOM, integração com API RESTful,
 * gestão de usuários (admin), filtros de histórico e exportação PDF.
 * @author Quicker Telecom Dev Team
 * @version 2.2.0
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES E ESTADO
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE     = '/api/solicitacoes';
const API_USUARIOS = '/api/usuarios';

/** @type {number} Contador global para IDs únicos de linha de material */
let contador = 1;

/** @type {number|null} ID da O.S. atualmente em edição (null = Nova Solicitação) */
let solicitacaoAtualId = null;

/** @type {Array<object>} Cache local das solicitações carregadas */
let solicitacoesCache = [];

/** @type {string} Filtro de status ativo para o histórico */
let filtroStatusAtual = '';

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA DE ABAS E NAVEGAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alterna a aba ativa no dashboard.
 * Carrega dinamicamente os dados da seção selecionada.
 * @param {string} tabId — ID da seção a ativar ('tab-nova', 'tab-historico' ou 'tab-usuarios')
 */
function trocarAba(tabId) {
    document.querySelectorAll('.tab').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(sec => sec.classList.remove('active'));

    const btn = document.querySelector(`.tab[data-tab="${tabId}"]`);
    const sec = document.getElementById(tabId);
    if (btn) btn.classList.add('active');
    if (sec) sec.classList.add('active');

    if (tabId === 'tab-historico') {
        carregarSolicitacoes();
    } else if (tabId === 'tab-usuarios') {
        carregarUsuarios();
    }
}

/**
 * Reseta a interface inteira para a tela inicial (Nova Solicitação).
 * Vinculado ao clique no logotipo "Quicker Compras" no topo.
 */
function resetarParaInicio() {
    limparFormulario();
    trocarAba('tab-nova');
    _mostrarToast('Interface reiniciada para Nova Solicitação.', 'info');
}

// ═══════════════════════════════════════════════════════════════════════════
// CONTROLE DE ESTADO DA TELA (Criação vs. Edição)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alterna a interface entre o modo de Nova Solicitação e Edição de O.S.
 * @param {'criacao'|'edicao'} modo
 * @param {object|null} [osData=null]
 */
function setModoVisualizacao(modo, osData = null) {
    const btnAbrir     = document.getElementById('btn-abrir-os');
    const btnAtualizar = document.getElementById('btn-atualizar-os');
    const btnExportar  = document.getElementById('btn-exportar-pdf');
    const statusWrap   = document.getElementById('header-status-container');
    const selectStatus = document.getElementById('select-status-form');
    const docOsNumber  = document.getElementById('doc-os-number');

    if (modo === 'edicao' && osData) {
        solicitacaoAtualId = osData.id;

        // Botões
        if (btnAbrir)     btnAbrir.style.display     = 'none';
        if (btnAtualizar) btnAtualizar.style.display = 'inline-flex';
        if (btnExportar)  btnExportar.style.display  = 'inline-flex';

        // Drop-down de Status
        if (statusWrap)   statusWrap.style.display   = 'block';
        if (selectStatus && osData.status) {
            selectStatus.value = osData.status;
            _aplicarCorStatus(selectStatus);
        }

        // Título com número da O.S.
        if (docOsNumber) {
            docOsNumber.textContent   = `— O.S. #${String(osData.id).padStart(3, '0')}`;
            docOsNumber.style.display = 'inline';
        }
    } else {
        // Modo Criação (Nova Solicitação)
        solicitacaoAtualId = null;

        // Botões
        if (btnAbrir)     btnAbrir.style.display     = 'inline-flex';
        if (btnAtualizar) btnAtualizar.style.display = 'none';
        if (btnExportar)  btnExportar.style.display  = 'none';

        // Drop-down de Status oculta por padrão
        if (statusWrap)   statusWrap.style.display   = 'none';
        if (selectStatus) {
            selectStatus.value = 'ABERTA';
            _aplicarCorStatus(selectStatus);
        }

        // Título sem identificador
        if (docOsNumber) {
            docOsNumber.textContent   = '';
            docOsNumber.style.display = 'none';
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// MANIPULAÇÃO DA TABELA DE MATERIAIS (Formulário)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Adiciona uma nova linha de material no corpo da tabela do formulário.
 * @param {object|null} [dados=null] — Objeto com { material, descricao, un, qtd }
 */
function addLinha(dados = null) {
    const tbody = document.getElementById('tbody-materiais');
    if (!tbody) return;

    const rowId = `row-mat-${contador}`;
    const tr = document.createElement('tr');
    tr.id = rowId;

    const nome = dados?.material || '';
    const desc = dados?.descricao || '';
    const un   = (dados?.un || 'UN').toUpperCase();
    const qtd  = dados?.qtd !== undefined ? dados.qtd : 1;

    tr.innerHTML = `
        <td class="row-index">${contador}</td>
        <td><input type="text" name="material_nome[]" placeholder="Ex: MiniDio" value="${_escAttr(nome)}" required></td>
        <td><input type="text" name="material_desc[]" placeholder="Ex: 4 ou 6 FO" value="${_escAttr(desc)}" required></td>
        <td>
            <select name="material_un[]" class="short-input">
                <option value="UN" ${un === 'UN' ? 'selected' : ''}>UN</option>
                <option value="CX" ${un === 'CX' ? 'selected' : ''}>CX</option>
                <option value="M"  ${un === 'M'  ? 'selected' : ''}>M</option>
                <option value="PC" ${un === 'PC' || un === 'PÇ' ? 'selected' : ''}>PÇ</option>
                <option value="KG" ${un === 'KG' ? 'selected' : ''}>KG</option>
            </select>
        </td>
        <td><input type="number" name="material_qtd[]" value="${qtd}" min="1" class="short-input" required style="text-align:right;"></td>
        <td class="hide-on-export" style="text-align:center;">
            <button type="button" class="btn-del-row" title="Remover item"
                    onclick="removerLinha('${rowId}')">X</button>
        </td>
    `;

    tbody.appendChild(tr);
    contador++;
    _reordenarIndices();
    _atualizarContador();
}

/**
 * Remove uma linha da tabela pelo seu ID e reordena os índices visuais.
 * @param {string} rowId — ID do <tr> a ser removido.
 */
function removerLinha(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        _reordenarIndices();
        _atualizarContador();
    }
}

/** @private Reordena a coluna "#" de todas as linhas restantes. */
function _reordenarIndices() {
    document.querySelectorAll('#tbody-materiais tr').forEach((tr, i) => {
        const td = tr.querySelector('.row-index');
        if (td) td.textContent = i + 1;
    });
}

/** @private Atualiza o badge de contagem de materiais. */
function _atualizarContador() {
    const el = document.getElementById('item-counter');
    if (!el) return;
    const total = document.querySelectorAll('#tbody-materiais tr').length;
    el.textContent = `${total} item(ns) adicionado(s)`;
}

/**
 * Coleta os materiais da tabela em formato de array de objetos.
 * @returns {Array<{material: string, descricao: string, un: string, qtd: number}>}
 * @private
 */
function _coletarMateriais() {
    const materiais = [];
    document.querySelectorAll('#tbody-materiais tr').forEach(tr => {
        const nome = tr.querySelector('input[name="material_nome[]"]')?.value.trim();
        const desc = tr.querySelector('input[name="material_desc[]"]')?.value.trim() || '';
        const un   = tr.querySelector('select[name="material_un[]"]')?.value || 'UN';
        const qtd  = parseInt(tr.querySelector('input[name="material_qtd[]"]')?.value, 10) || 1;

        if (nome) {
            materiais.push({ material: nome, descricao: desc, un, qtd });
        }
    });
    return materiais;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DE STATUS — Classe CSS por estado
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Retorna a classe CSS correspondente ao status.
 * @param {string} status
 * @returns {string}
 */
function _classeStatus(status) {
    const s = (status || '').toUpperCase().trim();
    if (s === 'EM ANDAMENTO') return 'status-andamento';
    if (s === 'FINALIZADA')   return 'status-finalizada';
    return 'status-aberta';
}

/**
 * Aplica a classe de cor ao <select> de status do formulário.
 * @param {HTMLSelectElement} select
 */
function _aplicarCorStatus(select) {
    select.classList.remove('status-aberta', 'status-andamento', 'status-finalizada');
    select.classList.add(_classeStatus(select.value));
}

// ═══════════════════════════════════════════════════════════════════════════
// TOAST — Feedback visual
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Exibe uma notificação toast no canto inferior direito.
 * @param {string} mensagem — Texto a exibir.
 * @param {'success'|'error'|'info'} tipo — Tipo visual do toast.
 * @param {number} [duracao=3500] — Tempo em ms até auto-remover.
 */
function _mostrarToast(mensagem, tipo = 'info', duracao = 3500) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.textContent = mensagem;

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        toast.addEventListener('animationend', () => toast.remove());
    }, duracao);
}

// ═══════════════════════════════════════════════════════════════════════════
// INTEGRAÇÃO COM API — FLUXO DE CRIAÇÃO E ATUALIZAÇÃO DE O.S.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FLUXO DE CRIAÇÃO:
 * Dispara o POST /api/solicitacoes.
 * Ao sucesso, exibe confirm: se sim, ativa modo de edição (liberando PDF);
 * se não, limpa o formulário e retorna ao estado inicial.
 */
async function abrirOS() {
    const destino       = document.getElementById('destino')?.value.trim();
    const setor         = document.getElementById('setor')?.value.trim();
    const objetivo      = document.getElementById('objetivo')?.value.trim();
    const justificativa = document.getElementById('justificativa')?.value.trim();
    const observacoes   = document.getElementById('observacoes')?.value.trim();
    const dataCriacao   = document.getElementById('data-solicitacao')?.value;

    if (!destino || !objetivo) {
        _mostrarToast('Preencha os campos Destino e Objetivo.', 'error');
        return;
    }

    const materiais = _coletarMateriais();
    if (materiais.length === 0) {
        _mostrarToast('Adicione pelo menos um material com nome preenchido.', 'error');
        return;
    }

    const payload = {
        destino,
        setor: setor || null,
        objetivo,
        justificativa: justificativa || null,
        observacoes: observacoes || null,
        materiais,
        data_criacao: dataCriacao || null,
    };

    try {
        const response = await fetch(API_BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Erro HTTP ${response.status}`);
        }

        const novaOS = await response.json();
        _atualizarBadgeHistorico();

        // 1. PRIMEIRO: Limpa o formulário (retornando ao estado inicial)
        limparFormulario();

        // 2. LOGO EM SEGUIDA: Exibir confirm
        const osNumFormatado = String(novaOS.id).padStart(3, '0');
        const desejaExportar = confirm(`O.S. #${osNumFormatado} gerada com sucesso! Deseja exportar o PDF agora?`);

        // 3. Se SIM: Injeta os dados da recém-criada O.S. e dispara o PDF silenciosamente
        if (desejaExportar) {
            await exportarPDF(novaOS);
        }

    } catch (error) {
        console.error('[abrirOS]', error);
        _mostrarToast(`Falha ao abrir O.S.: ${error.message}`, 'error');
    }
}

/**
 * FLUXO DE ATUALIZAÇÃO:
 * Dispara o PUT /api/solicitacoes/{id} com os materiais atualizados (linhas adicionadas/removidas)
 * e atualiza o status caso tenha sido modificado.
 */
async function atualizarOS() {
    if (!solicitacaoAtualId) {
        _mostrarToast('Nenhuma O.S. carregada para atualização.', 'error');
        return;
    }

    const destino       = document.getElementById('destino')?.value.trim();
    const setor         = document.getElementById('setor')?.value.trim();
    const objetivo      = document.getElementById('objetivo')?.value.trim();
    const justificativa = document.getElementById('justificativa')?.value.trim();
    const observacoes   = document.getElementById('observacoes')?.value.trim();

    if (!destino || !objetivo) {
        _mostrarToast('Preencha os campos Destino e Objetivo.', 'error');
        return;
    }

    const materiais = _coletarMateriais();
    if (materiais.length === 0) {
        _mostrarToast('A O.S. deve conter pelo menos um material.', 'error');
        return;
    }

    const payload = {
        destino,
        setor: setor || null,
        objetivo,
        justificativa: justificativa || null,
        observacoes: observacoes || null,
        materiais,
    };

    try {
        // 1. Atualizar dados cadastrais e lista de materiais
        const response = await fetch(`${API_BASE}/${solicitacaoAtualId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Erro HTTP ${response.status}`);
        }

        const osAtualizada = await response.json();

        // 2. Se status do formulário for EM ANDAMENTO ou FINALIZADA, sincronizar
        const selectStatus = document.getElementById('select-status-form');
        if (selectStatus && selectStatus.value !== osAtualizada.status) {
            const novoStatus = selectStatus.value;
            if (novoStatus === 'EM ANDAMENTO' || novoStatus === 'FINALIZADA') {
                const respStatus = await fetch(`${API_BASE}/${solicitacaoAtualId}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: novoStatus }),
                });
                if (respStatus.ok) {
                    const osComStatus = await respStatus.json();
                    osAtualizada.status = osComStatus.status;
                }
            }
        }

        _mostrarToast(`O.S. #${solicitacaoAtualId} atualizada com sucesso!`, 'success');
        setModoVisualizacao('edicao', osAtualizada);
        _atualizarBadgeHistorico();

    } catch (error) {
        console.error('[atualizarOS]', error);
        _mostrarToast(`Falha ao atualizar O.S.: ${error.message}`, 'error');
    }
}

/** Compatibilidade retroativa */
const salvarSolicitacao = abrirOS;

// ═══════════════════════════════════════════════════════════════════════════
// FLUXO DE EDIÇÃO VIA HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Preenche o formulário com os dados de uma O.S. existente.
 * @param {object} s — Dados completos da solicitação
 */
function _preencherFormulario(s) {
    const dataInput   = document.getElementById('data-solicitacao');
    const solicitante = document.getElementById('solicitante');
    const destino     = document.getElementById('destino');
    const setor       = document.getElementById('setor');
    const objetivo    = document.getElementById('objetivo');
    const justif      = document.getElementById('justificativa');
    const obs         = document.getElementById('observacoes');
    const tbody       = document.getElementById('tbody-materiais');

    if (dataInput && s.data_criacao) dataInput.value = s.data_criacao;
    if (solicitante) {
        solicitante.value = s.solicitante_nome || solicitante.value;
    }
    if (destino)  destino.value  = s.destino || '';
    if (setor)    setor.value    = s.setor || '';
    if (objetivo) objetivo.value = s.objetivo || '';
    if (justif)   justif.value   = s.justificativa || '';
    if (obs)      obs.value      = s.observacoes || '';

    // Renderizar materiais existentes
    if (tbody) {
        tbody.innerHTML = '';
        contador = 1;
        if (Array.isArray(s.materiais) && s.materiais.length > 0) {
            s.materiais.forEach(mat => addLinha(mat));
        } else {
            addLinha();
        }
    }
}

/**
 * Carrega uma O.S. pelo ID para edição a partir do Histórico.
 * @param {number} id — ID da solicitação selecionada
 */
async function carregarParaEdicao(id) {
    let os = solicitacoesCache.find(item => item.id === id);

    if (!os) {
        try {
            const resp = await fetch(API_BASE);
            if (resp.ok) {
                const list = await resp.json();
                solicitacoesCache = list;
                os = list.find(item => item.id === id);
            }
        } catch (err) {
            console.error('[carregarParaEdicao] Erro ao buscar lista:', err);
        }
    }

    if (!os) {
        _mostrarToast(`Solicitação #${id} não encontrada.`, 'error');
        return;
    }

    _preencherFormulario(os);
    setModoVisualizacao('edicao', os);
    trocarAba('tab-nova');
    _mostrarToast(`O.S. #${id} carregada no formulário.`, 'info');
}

// ═══════════════════════════════════════════════════════════════════════════
// FILTROS E LISTAGEM DO HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aplica filtro de status no histórico e atualiza a interface.
 * @param {string} status — '' (Todas) ou 'ABERTA' | 'EM ANDAMENTO' | 'FINALIZADA'
 */
function filtrarHistorico(status) {
    filtroStatusAtual = status || '';

    // Atualiza botões visuais de filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        const btnStatus = btn.getAttribute('data-status') || '';
        if (btnStatus === filtroStatusAtual) {
            btn.classList.add('active');
            btn.style.backgroundColor = 'var(--accent-primary)';
            btn.style.color = '#ffffff';
            btn.style.borderColor = 'var(--accent-primary)';
        } else {
            btn.classList.remove('active');
            btn.style.backgroundColor = 'transparent';
            btn.style.color = 'var(--text-secondary)';
            btn.style.borderColor = 'var(--border-color)';
        }
    });

    carregarSolicitacoes(filtroStatusAtual);
}

/**
 * Busca as solicitações via GET passando o query parameter ?status= caso informado.
 * Renderiza o solicitante_nome na tabela.
 * @param {string|null} [statusFiltro=null]
 */
async function carregarSolicitacoes(statusFiltro = null) {
    const loading = document.getElementById('historico-loading');
    const vazio   = document.getElementById('historico-vazio');
    const wrapper = document.getElementById('historico-tabela-wrapper');
    const tbody   = document.getElementById('tbody-historico');

    if (statusFiltro !== null) {
        filtroStatusAtual = statusFiltro;
    }

    if (loading) loading.style.display = '';
    if (vazio)   vazio.style.display   = 'none';
    if (wrapper) wrapper.style.display = 'none';

    try {
        let url = API_BASE;
        if (filtroStatusAtual) {
            url += `?status=${encodeURIComponent(filtroStatusAtual)}`;
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Erro HTTP ${response.status}`);
        }

        const solicitacoes = await response.json();
        solicitacoesCache = solicitacoes;

        const badge = document.getElementById('tab-count-badge');
        if (badge) badge.textContent = solicitacoes.length;

        if (solicitacoes.length === 0) {
            if (loading) loading.style.display = 'none';
            if (vazio)   vazio.style.display   = '';
            return;
        }

        tbody.innerHTML = '';
        for (const s of solicitacoes) {
            const tr = document.createElement('tr');
            const statusClass = _classeStatus(s.status);
            tr.style.cursor = 'pointer';

            tr.innerHTML = `
                <td><span class="os-id">#${String(s.id).padStart(3, '0')}</span></td>
                <td>${s.data_criacao || '—'}</td>
                <td><strong>${_esc(s.solicitante_nome || '—')}</strong></td>
                <td>${_esc(s.destino)}</td>
                <td>${_esc(s.objetivo)}</td>
                <td>
                    <select class="select-status-sm ${statusClass}"
                            onchange="_aplicarCorStatusSm(this); atualizarStatus(${s.id}, this.value)"
                            onclick="event.stopPropagation();"
                            data-os-id="${s.id}">
                        <option value="ABERTA"       ${s.status === 'ABERTA'       ? 'selected' : ''}>ABERTA</option>
                        <option value="EM ANDAMENTO" ${s.status === 'EM ANDAMENTO' ? 'selected' : ''}>EM ANDAMENTO</option>
                        <option value="FINALIZADA"   ${s.status === 'FINALIZADA'   ? 'selected' : ''}>FINALIZADA</option>
                    </select>
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-action-sm" title="Editar O.S."
                                onclick="event.stopPropagation(); carregarParaEdicao(${s.id})">
                            Editar
                        </button>
                        <button class="btn-action-sm danger" title="Excluir O.S."
                                onclick="event.stopPropagation(); deletarSolicitacao(${s.id})">
                            Excluir
                        </button>
                    </div>
                </td>
            `;

            tr.addEventListener('click', (e) => {
                if (e.target.closest('button') || e.target.closest('select')) return;
                carregarParaEdicao(s.id);
            });

            tbody.appendChild(tr);
        }

        if (loading) loading.style.display = 'none';
        if (wrapper) wrapper.style.display = '';

    } catch (error) {
        console.error('[carregarSolicitacoes]', error);
        if (loading) loading.style.display = 'none';
        _mostrarToast(`Falha ao carregar histórico: ${error.message}`, 'error');
    }
}

/**
 * Atualiza o status de uma solicitação via PUT dedicado.
 * @param {number} id — ID da solicitação.
 * @param {string} novoStatus — Novo valor de status.
 */
async function atualizarStatus(id, novoStatus) {
    try {
        const response = await fetch(`${API_BASE}/${id}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: novoStatus }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Erro HTTP ${response.status}`);
        }

        _mostrarToast(`O.S. #${id} → ${novoStatus}`, 'success');

        if (solicitacaoAtualId === id) {
            const selectForm = document.getElementById('select-status-form');
            if (selectForm) {
                selectForm.value = novoStatus;
                _aplicarCorStatus(selectForm);
            }
        }

    } catch (error) {
        console.error('[atualizarStatus]', error);
        _mostrarToast(`Falha ao atualizar status: ${error.message}`, 'error');
        carregarSolicitacoes(filtroStatusAtual);
    }
}

/**
 * Exclui uma solicitação via DELETE (com confirmação).
 * @param {number} id — ID da solicitação.
 */
async function deletarSolicitacao(id) {
    if (!confirm(`Excluir permanentemente a O.S. #${id}?`)) return;

    try {
        const response = await fetch(`${API_BASE}/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `Erro HTTP ${response.status}`);
        }

        _mostrarToast(`O.S. #${id} excluída.`, 'info');

        if (solicitacaoAtualId === id) {
            limparFormulario();
        }

        carregarSolicitacoes(filtroStatusAtual);

    } catch (error) {
        console.error('[deletarSolicitacao]', error);
        _mostrarToast(`Falha ao excluir: ${error.message}`, 'error');
    }
}

/**
 * Busca a contagem de solicitações para atualizar o badge da aba.
 * @private
 */
async function _atualizarBadgeHistorico() {
    try {
        const response = await fetch(API_BASE);
        if (response.ok) {
            const data = await response.json();
            const badge = document.getElementById('tab-count-badge');
            if (badge) badge.textContent = data.length;
        }
    } catch { /* silencioso */ }
}

// ═══════════════════════════════════════════════════════════════════════════
// GESTÃO DE USUÁRIOS (APENAS ADMINISTRADOR)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Busca todos os usuários via GET e renderiza na tabela.
 */
async function carregarUsuarios() {
    const loading = document.getElementById('usuarios-loading');
    const tbody   = document.getElementById('tbody-usuarios');
    const counter = document.getElementById('usuarios-counter');
    if (!tbody) return;

    if (loading) loading.style.display = '';

    try {
        const response = await fetch(API_USUARIOS);
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        const usuarios = await response.json();
        if (counter) counter.textContent = `${usuarios.length} usuário(s)`;

        tbody.innerHTML = '';
        usuarios.forEach(u => {
            const tr = document.createElement('tr');
            const isInativo = (u.role || '').toLowerCase() === 'inativo';
            const statusClass = isInativo ? 'status-andamento' : 'status-aberta';
            const statusLabel = isInativo ? 'INATIVO' : 'ATIVO';

            tr.innerHTML = `
                <td><span class="os-id">#${String(u.id).padStart(3, '0')}</span></td>
                <td><strong>${_esc(u.username)}</strong></td>
                <td><span class="role-tag">${_esc(u.role)}</span></td>
                <td><span class="badge-status ${statusClass}">${statusLabel}</span></td>
                <td>
                    <div class="actions-cell">
                        <button type="button" class="btn-action-sm" title="Editar"
                                onclick="editarUsuario(${u.id}, '${_escAttr(u.username)}', '${_escAttr(u.role)}')">
                            Editar
                        </button>
                        <button type="button" class="btn-action-sm ${isInativo ? '' : 'danger'}" title="${isInativo ? 'Ativar' : 'Inativar'}"
                                onclick="alternarStatusUsuario(${u.id}, '${_escAttr(u.role)}')">
                            ${isInativo ? 'Ativar' : 'Inativar'}
                        </button>
                        <button type="button" class="btn-action-sm danger" title="Excluir"
                                onclick="deletarUsuario(${u.id})">
                            Excluir
                        </button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error('[carregarUsuarios]', err);
        _mostrarToast(`Falha ao carregar usuários: ${err.message}`, 'error');
    } finally {
        if (loading) loading.style.display = 'none';
    }
}

/**
 * Salva novo usuário (POST) ou atualiza existente (PUT).
 */
async function salvarUsuario() {
    const idInput   = document.getElementById('usuario-id');
    const userIn    = document.getElementById('usuario-username');
    const passIn    = document.getElementById('usuario-password');
    const roleIn    = document.getElementById('usuario-role');

    const id        = idInput?.value ? parseInt(idInput.value, 10) : null;
    const username  = userIn?.value.trim();
    const password  = passIn?.value.trim();
    const role      = roleIn?.value;

    if (!username) {
        _mostrarToast('Informe o nome de usuário.', 'error');
        return;
    }

    if (!id && (!password || password.length < 6)) {
        _mostrarToast('A senha inicial é obrigatória (mínimo 6 caracteres).', 'error');
        return;
    }

    try {
        if (!id) {
            // POST - Criar usuário
            const response = await fetch(API_USUARIOS, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password, role }),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${response.status}`);
            }

            _mostrarToast(`Usuário '${username}' criado com sucesso!`, 'success');
        } else {
            // PUT - Atualizar usuário
            const payload = { username, role };
            if (password) {
                payload.password = password;
            }

            const response = await fetch(`${API_USUARIOS}/${id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });

            if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err.detail || `HTTP ${response.status}`);
            }

            _mostrarToast(`Usuário #${id} atualizado com sucesso!`, 'success');
        }

        limparFormUsuario();
        carregarUsuarios();

    } catch (err) {
        console.error('[salvarUsuario]', err);
        _mostrarToast(`Erro ao salvar usuário: ${err.message}`, 'error');
    }
}

/**
 * Preenche o formulário de usuário para modo de edição.
 * @param {number} id
 * @param {string} username
 * @param {string} role
 */
function editarUsuario(id, username, role) {
    const idInput     = document.getElementById('usuario-id');
    const userIn      = document.getElementById('usuario-username');
    const passIn      = document.getElementById('usuario-password');
    const roleIn      = document.getElementById('usuario-role');
    const titulo      = document.getElementById('form-usuario-titulo');
    const btnSalvar   = document.getElementById('btn-salvar-usuario');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');

    if (idInput)   idInput.value   = id;
    if (userIn)    userIn.value    = username;
    if (passIn)    passIn.value    = '';
    if (roleIn)    roleIn.value    = role;
    if (titulo)    titulo.textContent = `Editar Usuário #${id} (${username})`;
    if (btnSalvar) btnSalvar.textContent = 'Salvar Alterações';
    if (btnCancelar) btnCancelar.style.display = 'inline-flex';

    userIn?.focus();
}

/**
 * Alterna a role de um usuário entre ativo ('solicitante') e 'inativo' via PUT.
 * @param {number} id
 * @param {string} roleAtual
 */
async function alternarStatusUsuario(id, roleAtual) {
    const novaRole = (roleAtual || '').toLowerCase() === 'inativo' ? 'solicitante' : 'inativo';
    const acao = novaRole === 'inativo' ? 'inativar' : 'ativar';

    if (!confirm(`Deseja realmente ${acao} este usuário?`)) return;

    try {
        const response = await fetch(`${API_USUARIOS}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ role: novaRole }),
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        _mostrarToast(`Usuário #${id} ${acao === 'inativar' ? 'inativado' : 'ativado'} com sucesso.`, 'success');
        carregarUsuarios();
    } catch (err) {
        console.error('[alternarStatusUsuario]', err);
        _mostrarToast(`Erro ao alterar status: ${err.message}`, 'error');
    }
}

/**
 * Remove permanentemente um usuário via DELETE.
 * @param {number} id
 */
async function deletarUsuario(id) {
    if (!confirm(`Excluir permanentemente o usuário #${id}?`)) return;

    try {
        const response = await fetch(`${API_USUARIOS}/${id}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || `HTTP ${response.status}`);
        }

        _mostrarToast(`Usuário #${id} excluído com sucesso.`, 'info');
        carregarUsuarios();
    } catch (err) {
        console.error('[deletarUsuario]', err);
        _mostrarToast(`Erro ao excluir: ${err.message}`, 'error');
    }
}

/**
 * Reseta o formulário de usuário para criação.
 */
function limparFormUsuario() {
    const idInput     = document.getElementById('usuario-id');
    const userIn      = document.getElementById('usuario-username');
    const passIn      = document.getElementById('usuario-password');
    const roleIn      = document.getElementById('usuario-role');
    const titulo      = document.getElementById('form-usuario-titulo');
    const btnSalvar   = document.getElementById('btn-salvar-usuario');
    const btnCancelar = document.getElementById('btn-cancelar-usuario');

    if (idInput)   idInput.value   = '';
    if (userIn)    userIn.value    = '';
    if (passIn)    passIn.value    = '';
    if (roleIn)    roleIn.value    = 'solicitante';
    if (titulo)    titulo.textContent = 'Cadastrar Novo Usuário';
    if (btnSalvar) btnSalvar.textContent = 'Salvar Usuário';
    if (btnCancelar) btnCancelar.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// FORMULÁRIO — Limpar / Reset (Retorna para Estado de Nova Solicitação)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Limpa todos os campos do formulário e restaura o estado inicial de Nova Solicitação.
 */
function limparFormulario() {
    const destino     = document.getElementById('destino');
    const setor       = document.getElementById('setor');
    const objetivo    = document.getElementById('objetivo');
    const justif      = document.getElementById('justificativa');
    const obs         = document.getElementById('observacoes');
    const dataInput   = document.getElementById('data-solicitacao');
    const tbody       = document.getElementById('tbody-materiais');

    if (destino)  destino.value  = '';
    if (setor)    setor.value    = '';
    if (objetivo) objetivo.value = '';
    if (justif)   justif.value   = '';
    if (obs)      obs.value      = '';

    if (dataInput) {
        dataInput.value = new Date().toISOString().slice(0, 10);
    }

    // Limpar tabela e recriar uma linha vazia
    if (tbody) tbody.innerHTML = '';
    contador = 1;
    addLinha();

    // Restaura visual para o modo de criação
    setModoVisualizacao('criacao');
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS DOM
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Aplica a classe de cor nos selects de status menores (tabela do histórico).
 * @param {HTMLSelectElement} select
 */
function _aplicarCorStatusSm(select) {
    select.classList.remove('status-aberta', 'status-andamento', 'status-finalizada');
    select.classList.add(_classeStatus(select.value));
}

/**
 * Escapa caracteres HTML para texto simples.
 * @param {string} str
 * @returns {string}
 * @private
 */
function _esc(str) {
    if (!str) return '—';
    const el = document.createElement('span');
    el.textContent = str;
    return el.innerHTML;
}

/**
 * Escapa caracteres HTML para atributos de input.
 * @param {*} val
 * @returns {string}
 * @private
 */
function _escAttr(val) {
    if (val === null || val === undefined) return '';
    return String(val)
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAÇÃO PARA PDF (BASEADA EM TEMPLATE IMPRESSO)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Injeta os dados da O.S. no template de impressão (#pdf-print-template).
 * Suporta injeção direta via objeto da O.S. (ex: recém-criada) ou fallback
 * para os valores atuais do formulário (#form-estoque).
 * @param {object|null} [dadosOS=null] — Objeto da O.S. ou null para ler do formulário.
 */
function injetarDadosPDF(dadosOS = null) {
    const printNumero   = document.getElementById('print-os-numero');
    const printStatus   = document.getElementById('print-os-status');
    const printData     = document.getElementById('print-data');
    const printSol      = document.getElementById('print-solicitante');
    const printDest     = document.getElementById('print-destino');
    const printSetor    = document.getElementById('print-setor');
    const printObj      = document.getElementById('print-objetivo');
    const printJust     = document.getElementById('print-justificativa');
    const printObs      = document.getElementById('print-observacoes');
    const printSigSol   = document.getElementById('print-sig-solicitante');
    const printTbody    = document.getElementById('print-tbody-materiais');

    let osId, status, dataSol, solicitante, destino, setor, objetivo, justificativa, observacoes, materiais;

    if (dadosOS) {
        osId          = dadosOS.id;
        status        = (dadosOS.status || 'ABERTA').toUpperCase();
        dataSol       = dadosOS.data_criacao || '';
        solicitante   = dadosOS.solicitante_nome || document.getElementById('solicitante')?.value || '';
        destino       = dadosOS.destino || '';
        setor         = dadosOS.setor || '';
        objetivo      = dadosOS.objetivo || '';
        justificativa = dadosOS.justificativa || '';
        observacoes   = dadosOS.observacoes || '';
        materiais     = Array.isArray(dadosOS.materiais) ? dadosOS.materiais : [];
    } else {
        osId          = solicitacaoAtualId;
        const sel     = document.getElementById('select-status-form');
        status        = (sel ? sel.value : 'ABERTA').toUpperCase();
        dataSol       = document.getElementById('data-solicitacao')?.value || '';
        solicitante   = document.getElementById('solicitante')?.value || '';
        destino       = document.getElementById('destino')?.value || '';
        setor         = document.getElementById('setor')?.value || '';
        objetivo      = document.getElementById('objetivo')?.value || '';
        justificativa = document.getElementById('justificativa')?.value || '';
        observacoes   = document.getElementById('observacoes')?.value || '';
        materiais     = _coletarMateriais();
    }

    let dataFormatada = dataSol;
    if (dataSol && dataSol.includes('-')) {
        const [ano, mes, dia] = dataSol.split('-');
        dataFormatada = `${dia}/${mes}/${ano}`;
    }

    const osLabel = osId ? `#${String(osId).padStart(3, '0')}` : 'S/N (NOVA)';
    if (printNumero) printNumero.textContent = osLabel;

    if (printStatus) {
        printStatus.textContent = status;
        printStatus.className = 'pdf-status-tag ' + _classeStatus(status);
    }

    if (printData)   printData.textContent   = dataFormatada || '—';
    if (printSol)    printSol.textContent    = solicitante || '—';
    if (printDest)   printDest.textContent   = destino || '—';
    if (printSetor)  printSetor.textContent  = setor || '—';
    if (printObj)    printObj.textContent    = objetivo || '—';
    if (printJust)   printJust.textContent   = justificativa || '—';
    if (printObs)    printObs.textContent    = observacoes || '—';
    if (printSigSol) printSigSol.textContent = solicitante || '';

    // Renderizar tabela de materiais no template impresso
    if (printTbody) {
        printTbody.innerHTML = '';
        if (materiais.length === 0) {
            printTbody.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; padding: 12px; color: #555;">
                        Nenhum material adicionado.
                    </td>
                </tr>
            `;
        } else {
            materiais.forEach((mat, idx) => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="text-align: center;">${idx + 1}</td>
                    <td><strong>${_esc(mat.material)}</strong></td>
                    <td>${_esc(mat.descricao || '—')}</td>
                    <td style="text-align: center;">${_esc(mat.un || 'UN')}</td>
                    <td style="text-align: right;">${mat.qtd}</td>
                `;
                printTbody.appendChild(tr);
            });
        }
    }
}

/**
 * Exporta o documento formal como PDF a partir do #pdf-print-template.
 * Dispara a geração de forma silenciosa sem alterar os dados da tela principal.
 * @param {object|null} [dadosOS=null] — Objeto da O.S. para injeção direta sem afetar tela.
 */
async function exportarPDF(dadosOS = null) {
    const template  = document.getElementById('pdf-print-template');
    const container = document.querySelector('.container');
    const navbar    = document.querySelector('.app-navbar');

    if (!template) {
        console.error('[exportarPDF] Elemento #pdf-print-template não encontrado.');
        _mostrarToast('Erro ao exportar PDF: template não encontrado.', 'error');
        return;
    }

    // 1. Injetar dados no template (diretamente do objeto da O.S. ou do formulário)
    injetarDadosPDF(dadosOS);

    // 2. Ocultar interface temporariamente e exibir template limpo
    if (container) container.style.display = 'none';
    if (navbar)    navbar.style.display    = 'none';
    template.style.display = 'block';

    // 3. Configurações de exportação do PDF
    const dataHoje = new Date().toISOString().slice(0, 10);
    const osId = dadosOS?.id || solicitacaoAtualId;
    const osIdentificador = osId ? `_OS_${String(osId).padStart(3, '0')}` : '';
    const opt = {
        margin:      [10, 10, 10, 10],
        filename:    `solicitacao_estoque${osIdentificador}_${dataHoje}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    try {
        await html2pdf().set(opt).from(template).save();
        _mostrarToast('PDF exportado com sucesso!', 'success');
    } catch (err) {
        console.error('[exportarPDF] Erro ao gerar PDF:', err);
        _mostrarToast('Falha ao exportar PDF.', 'error');
    } finally {
        // 4. Restaurar a visualização da tela principal intacta
        template.style.display = 'none';
        if (container) container.style.display = '';
        if (navbar)    navbar.style.display    = '';
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// INICIALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Inicializa no modo Nova Solicitação
    limparFormulario();

    // Listener para o select de status do formulário
    const selectStatus = document.getElementById('select-status-form');
    if (selectStatus) {
        selectStatus.addEventListener('change', () => _aplicarCorStatus(selectStatus));
    }

    // Carregar contagem do badge
    _atualizarBadgeHistorico();
});
