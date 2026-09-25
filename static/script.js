/**
 * @fileoverview Lógica de manipulação do DOM, integração com API RESTful
 * e exportação PDF para o MVP Quicker Compras — Quicker Telecom.
 * @author Quicker Telecom Dev Team
 * @version 2.1.0
 */

'use strict';

// ═══════════════════════════════════════════════════════════════════════════
// CONSTANTES E ESTADO
// ═══════════════════════════════════════════════════════════════════════════

const API_BASE = '/api/solicitacoes';

/** @type {number} Contador global para IDs únicos de linha de material */
let contador = 1;

/** @type {number|null} ID da O.S. atualmente em edição (null = Nova Solicitação) */
let solicitacaoAtualId = null;

/** @type {Array<object>} Cache local das solicitações carregadas */
let solicitacoesCache = [];

// ═══════════════════════════════════════════════════════════════════════════
// SISTEMA DE ABAS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Alterna a aba ativa no dashboard.
 * Ao abrir a aba de histórico, dispara o carregamento das solicitações.
 * @param {string} tabId — ID da seção a ativar ('tab-nova' ou 'tab-historico')
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
    }
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
// INTEGRAÇÃO COM API — FLUXO DE CRIAÇÃO E ATUALIZAÇÃO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * FLUXO DE CRIAÇÃO:
 * Dispara o POST /api/solicitacoes.
 * Em caso de sucesso, transita imediatamente para o estado de edição da O.S. criada.
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
        _mostrarToast(`O.S. #${novaOS.id} aberta com sucesso!`, 'success');

        // Transitar para o estado de edição com os dados retornados
        setModoVisualizacao('edicao', novaOS);
        _preencherFormulario(novaOS);
        _atualizarBadgeHistorico();

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
 * Preenche o formulário com os dados de uma O.S. existente e troca a view para o estado de edição.
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
    if (solicitante && s.solicitante_nome) solicitante.value = s.solicitante_nome;
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

    // Preenche o formulário e ativa o modo de edição
    _preencherFormulario(os);
    setModoVisualizacao('edicao', os);

    // Navega para a aba do formulário
    trocarAba('tab-nova');
    _mostrarToast(`O.S. #${id} carregada no formulário.`, 'info');
}

/**
 * Busca todas as solicitações via GET e renderiza na tabela do histórico.
 */
async function carregarSolicitacoes() {
    const loading = document.getElementById('historico-loading');
    const vazio   = document.getElementById('historico-vazio');
    const wrapper = document.getElementById('historico-tabela-wrapper');
    const tbody   = document.getElementById('tbody-historico');

    if (loading) loading.style.display = '';
    if (vazio)   vazio.style.display   = 'none';
    if (wrapper) wrapper.style.display = 'none';

    try {
        const response = await fetch(API_BASE);

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

        solicitacoes.sort((a, b) => b.id - a.id);

        tbody.innerHTML = '';
        for (const s of solicitacoes) {
            const tr = document.createElement('tr');
            const statusClass = _classeStatus(s.status);
            tr.style.cursor = 'pointer';

            tr.innerHTML = `
                <td><span class="os-id">#${String(s.id).padStart(3, '0')}</span></td>
                <td>${s.data_criacao || '—'}</td>
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

            // Ao clicar na linha da O.S., também carrega para edição
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

        // Se for a O.S. atualmente aberta no formulário, sincroniza o select
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
        carregarSolicitacoes();
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

        // Se a O.S. excluída estava aberta no formulário, resetar para nova solicitação
        if (solicitacaoAtualId === id) {
            limparFormulario();
        }

        carregarSolicitacoes();

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
            solicitacoesCache = data;
            const badge = document.getElementById('tab-count-badge');
            if (badge) badge.textContent = data.length;
        }
    } catch { /* silencioso */ }
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
// EXPORTAÇÃO PARA PDF
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Congela os valores dos campos no DOM para html2canvas capturar.
 * @param {NodeListOf<HTMLInputElement|HTMLTextAreaElement>} fields
 * @private
 */
function _fixarValoresCampos(fields) {
    fields.forEach(field => {
        if (field.tagName === 'TEXTAREA') {
            field.innerHTML = field.value;
        } else {
            field.setAttribute('value', field.value);
        }
    });
}

/**
 * Aplica estilo "formulário impresso" removendo bordas e backgrounds.
 * @param {NodeListOf<HTMLElement>} fields
 * @returns {Array<{field: HTMLElement, snapshot: object}>}
 * @private
 */
function _aplicarEstiloImpressao(fields) {
    return Array.from(fields).map(field => {
        const snapshot = {
            border:          field.style.border,
            backgroundColor: field.style.backgroundColor,
            color:           field.style.color,
            outline:         field.style.outline,
            boxShadow:       field.style.boxShadow,
        };
        field.style.border          = 'none';
        field.style.backgroundColor = 'transparent';
        field.style.color           = '#f5f5f5';
        field.style.outline         = 'none';
        field.style.boxShadow       = 'none';
        return { field, snapshot };
    });
}

/**
 * Restaura os estilos inline originais dos campos.
 * @param {Array<{field: HTMLElement, snapshot: object}>} snapshots
 * @private
 */
function _restaurarEstilos(snapshots) {
    snapshots.forEach(({ field, snapshot }) => {
        Object.assign(field.style, snapshot);
    });
}

/**
 * Exporta a área `#pdf-area` como PDF usando html2pdf.js.
 */
async function exportarPDF() {
    const element = document.getElementById('pdf-area');
    if (!element) {
        console.warn('[exportarPDF] Elemento #pdf-area não encontrado.');
        return;
    }

    const elementosOcultos = element.querySelectorAll('.hide-on-export');
    elementosOcultos.forEach(el => { el.style.display = 'none'; });

    const selectRestore = [];
    element.querySelectorAll('select').forEach(select => {
        const span = document.createElement('span');
        const texto = select.options[select.selectedIndex]?.text || select.value;

        span.textContent = texto;
        span.className   = `badge-status ${_classeStatus(select.value)}`;
        span.setAttribute('data-pdf-placeholder', 'true');

        select.parentNode.insertBefore(span, select);
        select.style.display = 'none';

        selectRestore.push({ select, span });
    });

    const campos = element.querySelectorAll('input, textarea');
    _fixarValoresCampos(campos);

    const snapshots = _aplicarEstiloImpressao(campos);

    const dataHoje = new Date().toISOString().slice(0, 10);
    const osIdentificador = solicitacaoAtualId ? `_OS_${String(solicitacaoAtualId).padStart(3, '0')}` : '';
    const opt = {
        margin:      10,
        filename:    `solicitacao_estoque${osIdentificador}_${dataHoje}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#121212' },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    try {
        await html2pdf().set(opt).from(element).save();
        _mostrarToast('PDF exportado com sucesso!', 'success');
    } catch (err) {
        console.error('[exportarPDF] Erro ao gerar PDF:', err);
        _mostrarToast('Falha ao exportar PDF.', 'error');
    } finally {
        elementosOcultos.forEach(el => { el.style.display = ''; });
        _restaurarEstilos(snapshots);

        selectRestore.forEach(({ select, span }) => {
            select.style.display = '';
            span.remove();
        });
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
