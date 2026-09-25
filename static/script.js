/**
 * @fileoverview Lógica de manipulação do DOM e exportação PDF
 * para o MVP de Solicitação de Estoque — Quick Telecom.
 * @author Quick Telecom Dev Team
 * @version 1.1.0
 */

'use strict';

// ─── Estado do Módulo ────────────────────────────────────────────────────────

/** @type {number} Contador global para IDs únicos de linha */
let contador = 1;

// ─── Manipulação da Tabela de Materiais ──────────────────────────────────────

/**
 * Adiciona uma nova linha de material no corpo da tabela.
 * Cada linha recebe um ID único e um índice sequencial visível.
 */
function addLinha() {
    const tbody = document.getElementById('tbody-materiais');
    if (!tbody) return;

    const rowId = `row-mat-${contador}`;
    const tr    = document.createElement('tr');
    tr.id       = rowId;

    tr.innerHTML = `
        <td class="row-index">${contador}</td>
        <td><input type="text" name="material_nome[]" placeholder="Ex: MiniDio" required></td>
        <td><input type="text" name="material_desc[]" placeholder="Ex: 4 ou 6 FO" required></td>
        <td>
            <select name="material_un[]" class="short-input">
                <option value="UN">UN</option>
                <option value="CX">CX</option>
                <option value="M">M</option>
                <option value="PC">PÇ</option>
                <option value="KG">KG</option>
            </select>
        </td>
        <td><input type="number" name="material_qtd[]" value="1" min="1" class="short-input" required style="text-align:right;"></td>
        <td class="hide-on-export" style="text-align:center;">
            <button type="button" class="btn-del-row" title="Remover item"
                    onclick="removerLinha('${rowId}')">X</button>
        </td>
    `;

    tbody.appendChild(tr);
    contador++;
    _atualizarContador();
}

/**
 * Remove uma linha da tabela pelo seu ID e reordena os índices visuais.
 * @param {string} rowId - ID da linha (`<tr>`) a ser removida.
 */
function removerLinha(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        _reordenarIndices();
        _atualizarContador();
    }
}

/**
 * Reordena a coluna "#" de todas as linhas restantes após uma remoção.
 * @private
 */
function _reordenarIndices() {
    document.querySelectorAll('#tbody-materiais tr').forEach((tr, i) => {
        const td = tr.querySelector('.row-index');
        if (td) td.textContent = i + 1;
    });
}

/**
 * Atualiza o contador de itens exibido acima da tabela.
 * @private
 */
function _atualizarContador() {
    const el = document.getElementById('item-counter');
    if (!el) return;
    const total = document.querySelectorAll('#tbody-materiais tr').length;
    el.textContent = `${total} item(ns) adicionado(s)`;
}

// ─── Exportação para PDF ─────────────────────────────────────────────────────

/**
 * Congela o valor atual de cada campo no DOM para que html2canvas capture
 * o conteúdo digitado pelo usuário mesmo em campos desabilitados ou clonados.
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
 * Aplica o estilo "formulário impresso" nos campos, removendo bordas e
 * fundos de input para que o PDF pareça um documento preenchido à mão.
 * @param {NodeListOf<HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement>} fields
 * @returns {Array<{field: HTMLElement, snapshot: object}>} Snapshot dos estilos originais.
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
        field.style.color           = '#f5f5f5';  // mantém legível no PDF dark
        field.style.outline         = 'none';
        field.style.boxShadow       = 'none';

        return { field, snapshot };
    });
}

/**
 * Restaura os estilos inline originais de cada campo após a geração do PDF.
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
 *
 * Fluxo:
 * 1. Oculta elementos `.hide-on-export`.
 * 2. Fixa valores dos campos no DOM.
 * 3. Remove bordas/backgrounds para visual "formulário impresso".
 * 4. Gera e salva o PDF.
 * 5. Restaura o layout original.
 */
function exportarPDF() {
    const element = document.getElementById('pdf-area');
    if (!element) {
        console.warn('[exportarPDF] Elemento #pdf-area não encontrado.');
        return;
    }

    // 1. Ocultar elementos que não devem aparecer no PDF
    const elementosOcultos = element.querySelectorAll('.hide-on-export');
    elementosOcultos.forEach(el => { el.style.display = 'none'; });

    // 2. Fixar valores nos atributos do DOM para html2canvas capturar
    const campos = element.querySelectorAll('input, textarea');
    _fixarValoresCampos(campos);

    // 3. Estilo "formulário impresso" — remover bordas e backgrounds
    const todosOsCampos = element.querySelectorAll('input, textarea, select');
    const snapshots     = _aplicarEstiloImpressao(todosOsCampos);

    // 4. Configurações do html2pdf
    const dataHoje = new Date().toISOString().slice(0, 10);
    const opt = {
        margin:      10,
        filename:    `solicitacao_estoque_${dataHoje}.pdf`,
        image:       { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, backgroundColor: '#121212' },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
    };

    // 5. Gerar PDF e restaurar layout após conclusão
    html2pdf()
        .set(opt)
        .from(element)
        .save()
        .then(() => {
            elementosOcultos.forEach(el => { el.style.display = ''; });
            _restaurarEstilos(snapshots);
        })
        .catch(err => {
            console.error('[exportarPDF] Erro ao gerar PDF:', err);
            elementosOcultos.forEach(el => { el.style.display = ''; });
            _restaurarEstilos(snapshots);
        });
}

// ─── Inicialização ───────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    addLinha();
});
