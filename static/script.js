/**
 * Controle de Linhas da Tabela de Materiais e Exportação de PDF
 */

let rowCounter = 0;

/**
 * Adiciona uma nova linha de material na tabela
 */
function addLinha() {
    rowCounter++;
    const tbody = document.getElementById("tbody-materiais");
    const tr = document.createElement("tr");
    tr.id = `row-mat-${rowCounter}`;

    tr.innerHTML = `
        <td class="row-index">${rowCounter}</td>
        <td>
            <input type="text" name="material_nome[]" placeholder="Nome do item / código" required>
        </td>
        <td>
            <input type="text" name="material_desc[]" placeholder="Descrição, modelo ou marca">
        </td>
        <td>
            <select name="material_un[]">
                <option value="UN">UN</option>
                <option value="CX">CX</option>
                <option value="M">M</option>
                <option value="PC">PÇ</option>
                <option value="KG">KG</option>
            </select>
        </td>
        <td>
            <input type="number" name="material_qtd[]" min="1" value="1" required style="text-align: right;">
        </td>
        <td class="hide-on-export" style="text-align: center;">
            <button type="button" class="btn-del-row" title="Remover item" onclick="removerLinha('${tr.id}')">Excluir</button>
        </td>
    `;

    tbody.appendChild(tr);
    atualizarContador();
}

/**
 * Remove uma linha da tabela e atualiza os índices
 */
function removerLinha(rowId) {
    const row = document.getElementById(rowId);
    if (row) {
        row.remove();
        reordenarIndices();
        atualizarContador();
    }
}

/**
 * Reordena o índice visual das linhas (#)
 */
function reordenarIndices() {
    const linhas = document.querySelectorAll("#tbody-materiais tr");
    linhas.forEach((tr, index) => {
        const tdIndex = tr.querySelector(".row-index");
        if (tdIndex) {
            tdIndex.textContent = index + 1;
        }
    });
    rowCounter = linhas.length;
}

/**
 * Atualiza o contador de itens no topo da tabela
 */
function atualizarContador() {
    const counterElement = document.getElementById("item-counter");
    if (counterElement) {
        const total = document.querySelectorAll("#tbody-materiais tr").length;
        counterElement.textContent = `${total} item(ns) adicionado(s)`;
    }
}

/**
 * Exporta a área da requisição (#pdf-area) para PDF com html2pdf.js
 */
function exportarPDF() {
    const element = document.getElementById("pdf-area");
    if (!element) return;

    // Configurações do html2pdf.js
    const opt = {
        margin: [10, 10, 10, 10],
        filename: `solicitacao_estoque_${new Date().toISOString().slice(0, 10)}.pdf`,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
            scale: 2,
            useCORS: true,
            backgroundColor: "#121212"
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" }
    };

    // Gera o PDF a partir do elemento
    html2pdf().set(opt).from(element).save();
}

// Inicializa com uma linha pronta para preenchimento
document.addEventListener("DOMContentLoaded", () => {
    addLinha();
});
