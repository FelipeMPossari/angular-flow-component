import {
    Component, AfterViewInit, ViewChild, ElementRef,
    HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Cell } from '@antv/x6';

import * as Models from './flow.models';
import { getGraphOptions, LABEL_STYLE, PORT_GROUPS, validateConnectionRule } from './flow-graph.config';
import { FlowUtils } from './flow.utils';

@Component({
    selector: 'app-flow-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './flow-editor.component.html',
    styleUrls: ['./flow-editor.component.css']
})
export class FlowEditorComponent implements AfterViewInit {
    @ViewChild('container', { static: true }) container!: ElementRef;

    // --- INPUTS ---
    @Input() tools: Models.FlowTool[] = [];
    // @Input() properties REMOVIDO: O legado que gerencia as propriedades do IF agora
    @Input() control: any; // A Ponte é a única coisa que importa agora

    @Output() saveGraph = new EventEmitter<Models.WorkflowDefinition>();

    // --- ESTADO ---
    private graph!: Graph;
    selectedCell: Cell | null = null;

    // UI (Só sobrou a sidebar de ferramentas e o modal de alerta)
    showActions = true;
    modalState: Models.ModalState = { visible: false, type: 'alert', title: '', message: '', confirmLabel: 'OK', pendingAction: null };

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

    // #region 1. Lifecycle
    ngAfterViewInit() {
        this.initGraph();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['control'] && this.control) {
            this.control.getExportData = this.getExportData.bind(this);
            this.control.importData = this.importData.bind(this);
            this.control.clearCanvas = this.clearCanvas.bind(this);
            this.control.updateNodeData = this.apiUpdateNodeData.bind(this);
        }
    }

    private initGraph() {
        const options = getGraphOptions(this.container.nativeElement);
        options.connecting.validateConnection = (args: any) => validateConnectionRule({ ...args, graph: this.graph });
        this.graph = new Graph(options);
        this.registerEvents();
    }

    private registerEvents() {
        this.graph.on('node:click', ({ node }) => this.ngZone.run(() => this.selectCell(node)));
        this.graph.on('edge:click', ({ edge }) => this.ngZone.run(() => this.selectCell(edge)));
        this.graph.on('blank:click', () => this.ngZone.run(() => this.resetSelection()));

        // --- DUPLO CLIQUE: AGORA É SEMPRE RESPONSABILIDADE DO LEGADO ---
        this.graph.on('node:dblclick', ({ node }) => {
            this.ngZone.run(() => {
                this.fireLegacyModal(node);
            });
        });

        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());
    }
    // #endregion

    // #region 2. Manipulação de Nós
    addNode(type: string, toolLabel?: string, position?: { x: number, y: number }) {
        const x = position ? position.x : 100 + Math.random() * 200;
        const y = position ? position.y : 100 + Math.random() * 200;
        const finalX = position ? x - 80 : x;
        const finalY = position ? y - 35 : y;

        const commonAttrs = { label: { text: toolLabel || (type === 'if' ? 'IF' : type), ...LABEL_STYLE } };

        if (type === 'if') {
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                // Padronizamos: tudo fica dentro de 'config', inclusive a condição
                data: { type: 'if', config: {} },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#fffbe6', stroke: '#faad14', strokeWidth: 2, rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }] },
            });
        } else {
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                data: { type: type, label: toolLabel || type, config: {} },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#ffffff', stroke: '#ccc', strokeWidth: 2, strokeDasharray: '5,5', rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }] },
            });
        }
    }

    onDragStart(event: DragEvent, type: string, label: string = '') {
        event.dataTransfer?.setData('application/json', JSON.stringify({ type, label }));
    }

    onDragOver(event: DragEvent) { event.preventDefault(); }

    onDrop(event: DragEvent) {
        event.preventDefault();
        const dataString = event.dataTransfer?.getData('application/json');
        if (!dataString) return;
        try {
            const { type, label } = JSON.parse(dataString);
            const { x, y } = this.graph.clientToLocal(event.clientX, event.clientY);
            this.addNode(type, label, { x, y });
        } catch (e) { console.error(e); }
    }
    // #endregion

    // #region 3. A Ponte Legada

    // Método único para disparar edição
    fireLegacyModal(node: any) {
        if (this.control && this.control.onEditNode) {
            const data = node.getData();
            console.log("📡 Chamando Legado para editar nó:", node.id, data.type);

            // Enviamos ID, TIPO e a mochila CONFIG
            // Se for IF, o 'config' conterá { property: '...', operator: '...', value: '...' }
            this.control.onEditNode(node.id, data.type, data.config || {});
        } else {
            console.warn("⚠️ Método 'onEditNode' não definido no control!");
        }
    }

    // O Legado chama isso para devolver os dados
    public apiUpdateNodeData(nodeId: string, newConfig: any, newLabel?: string) {
        const cell = this.graph.getCellById(nodeId);
        if (cell && cell.isNode()) {
            const currentData = cell.getData();

            // Se for IF, atualizamos o label visualmente para ficar fácil de ler no gráfico
            let displayLabel = newLabel || currentData.label;

            // Opcional: Se o legado mandar um label específico já formatado, usamos ele.
            // Se não, mantemos o anterior.

            cell.setData({
                ...currentData,
                config: newConfig, // Atualiza a mochila
                label: displayLabel
            });

            if (displayLabel) {
                cell.attr('label/text', displayLabel);
            }

            console.log(`✅ Nó ${nodeId} atualizado com sucesso.`);
        }
    }

    toggleActions() { this.showActions = !this.showActions; }
    // #endregion

    // #region 4. IO e Validação
    public getExportData() {
        // Validação Simplificada: O Angular apenas verifica se tem arestas soltas
        // A validação de "Campo Obrigatório" agora é responsabilidade da Modal do Legado antes de salvar.

        const fullGraph = this.graph.toJSON();
        const logicData = {
            nodes: fullGraph.cells.filter((c: any) => c.shape !== 'edge').map((n: any) => ({
                id: n.id,
                type: n.data?.type,
                label: n.data?.label,
                config: n.data?.config || {} // Tudo está aqui dentro agora
            })),
            edges: fullGraph.cells.filter((c: any) => c.shape === 'edge').map((e: any) => ({
                source: e.source.cell, target: e.target.cell, sourcePort: e.source.port
            }))
        };
        return { logic: logicData, graph: fullGraph };
    }

    public importData(data: any) {
        try {
            const graphData = typeof data === 'string' ? JSON.parse(data) : data;
            if (!graphData) return false;
            this.graph.fromJSON(graphData);
            this.graph.zoomToFit({ padding: 20, maxScale: 1 });
            this.showSystemAlert('Sucesso', 'Projeto carregado!', 'success');
            return true;
        } catch {
            this.showSystemAlert('Erro', 'Arquivo inválido.', 'warning');
            return false;
        }
    }

    public clearCanvas() {
        this.showSystemConfirm('Limpar', 'Deseja apagar tudo?', () => this.graph.clearCells());
    }

    // Arquivos
    saveProjectFile() { FlowUtils.downloadJson(this.graph.toJSON()); }
    triggerFileInput() { document.getElementById('fileInput')?.click(); }
    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        FlowUtils.readJsonFile(file).then(json => this.importData(json));
        event.target.value = '';
    }
    // #endregion

    // #region 5. Utilitários UI
    selectCell(cell: Cell) {
        this.resetSelection();
        this.selectedCell = cell;
        const style = { stroke: '#ff9c6e', strokeWidth: 3 };
        cell.isNode() ? cell.attr('body', style) : cell.attr('line', style);
    }

    resetSelection() {
        if (this.selectedCell) {
            if (this.selectedCell.isNode()) {
                const isIf = this.selectedCell.getData()?.type === 'if';
                this.selectedCell.attr('body', { stroke: isIf ? '#faad14' : '#ccc', strokeWidth: 2 });
            } else if (this.selectedCell.isEdge()) {
                this.selectedCell.attr('line', { stroke: '#5F95FF', strokeWidth: 2 });
            }
        }
        this.selectedCell = null;
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent) {
        if ((event.key === 'Delete' || event.key === 'Backspace') && this.selectedCell) {
            this.graph.removeCell(this.selectedCell);
            this.selectedCell = null;
        }
    }

    private showSystemAlert(title: string, message: string, type: string = 'info') {
        this.modalState = { visible: true, type, title, message, confirmLabel: 'Entendi', pendingAction: null };
        this.cdr.detectChanges();
    }

    private showSystemConfirm(title: string, message: string, onConfirm: () => void) {
        this.modalState = { visible: true, type: 'confirm', title, message, confirmLabel: 'Sim', pendingAction: onConfirm };
    }

    confirmModalAction() { this.modalState.pendingAction?.(); this.closeModal(); }
    closeModal() {
        this.modalState.visible = false; this.modalState.pendingAction = null;
        this.cdr.detectChanges();
    }
    // #endregion
}