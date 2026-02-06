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
import { OPERATORS_BY_TYPE } from './flow.constants';

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
    @Input() properties: Models.PropertyOption[] = [];
    // @Input() schemas -> REMOVIDO
    @Input() control: any; // Ponte com o Legado (Agora essencial para abrir a modal)

    @Output() saveGraph = new EventEmitter<Models.WorkflowDefinition>();

    // --- ESTADO ---
    private graph!: Graph;
    selectedCell: Cell | null = null;

    // UI
    showActions = true;
    showConfig = false;     // Controla a sidebar do IF
    configMaximized = false;
    modalState: Models.ModalState = { visible: false, type: 'alert', title: '', message: '', confirmLabel: 'OK', pendingAction: null };

    // Edição (IF)
    editingNode: any = null;
    selectedProperty: Models.PropertyOption | null = null;
    selectedOperator: string = '';
    conditionValue: any = '';
    availableOperators: any[] = [];

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

    // #region 1. Lifecycle e Inicialização
    ngAfterViewInit() {
        this.initGraph();
    }

    ngOnChanges(changes: SimpleChanges): void {
        // Conecta os métodos que o Legado pode chamar
        if (changes['control'] && this.control) {
            this.control.getExportData = this.getExportData.bind(this);
            this.control.importData = this.importData.bind(this);
            this.control.clearCanvas = this.clearCanvas.bind(this);
            this.control.updateNodeData = this.apiUpdateNodeData.bind(this); // NOVO: Para o legado atualizar o nó após a modal
        }

        if (changes['properties'] && this.properties) {
            this.properties = this.properties.map(prop => ({
                ...prop,
                type: FlowUtils.normalizeType(prop.type)
            }));
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

        // --- LÓGICA DO DUPLO CLIQUE (A GRANDE MUDANÇA) ---
        this.graph.on('node:dblclick', ({ node }) => {
            this.ngZone.run(() => {
                const type = node.getData()?.type;

                if (type === 'if') {
                    // Se for IF, abre a sidebar interna do Angular (como antes)
                    this.openIfConfig(node);
                } else {
                    // Se for Ação, chama o Legado para abrir a Modal dele
                    this.fireLegacyModal(node);
                }
            });
        });

        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());
    }
    // #endregion

    // #region 2. Manipulação de Nós (Add/Drag)
    addNode(type: string, toolLabel?: string, position?: { x: number, y: number }) {
        const x = position ? position.x : 100 + Math.random() * 200;
        const y = position ? position.y : 100 + Math.random() * 200;
        const finalX = position ? x - 80 : x;
        const finalY = position ? y - 35 : y;

        const commonAttrs = { label: { text: toolLabel || (type === 'if' ? 'IF' : type), ...LABEL_STYLE } };

        if (type === 'if') {
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                data: { type: 'if' },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#fffbe6', stroke: '#faad14', strokeWidth: 2, rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }] },
            });
        } else {
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                // Iniciamos a config vazia. O legado vai preencher via 'updateNodeData' se quiser.
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

    // #region 3. Configuração (Apenas IF) e Ponte Legada

    // Abre a sidebar APENAS para o IF
    openIfConfig(node: any) {
        this.editingNode = node;
        const data = node.getData();

        // Reseta estados
        this.selectedProperty = null;
        this.availableOperators = [];
        this.selectedOperator = '';
        this.conditionValue = '';

        if (data.conditionData) {
            this.selectedProperty = this.properties.find(p => p.id === data.conditionData.propertyId) || null;
            if (this.selectedProperty) {
                this.updateOperators();
                this.selectedOperator = data.conditionData.operator;
                this.conditionValue = data.conditionData.value;
            }
        }

        this.showConfig = true;
        this.cdr.detectChanges();
    }

    // Chama o Legado
    fireLegacyModal(node: any) {
        if (this.control && this.control.onEditNode) {
            const data = node.getData();
            console.log("📡 Chamando Legado para editar nó:", node.id);
            // Passamos ID, Tipo e a Configuração Atual (que pode estar vazia ou cheia)
            this.control.onEditNode(node.id, data.type, data.config || {});
        } else {
            console.warn("⚠️ Método 'onEditNode' não definido no control!");
            this.showSystemAlert("Aviso", "Edição indisponível (Ponte desconectada).");
        }
    }

    // Salva a sidebar do IF
    saveConfiguration() {
        if (!this.editingNode) return;
        const currentData = this.editingNode.getData();

        // Só temos lógica de salvar para IF agora
        if (currentData.type === 'if') {
            if (this.selectedProperty && this.selectedOperator) {
                const opLabel = this.availableOperators.find((op: any) => op.id === this.selectedOperator)?.label;
                let displayText = `${this.selectedProperty.label}\n${opLabel}`;
                if (this.selectedProperty.type !== 'boolean') displayText += ` ${this.conditionValue}`;

                this.editingNode.setData({
                    ...currentData,
                    conditionData: { propertyId: this.selectedProperty.id, operator: this.selectedOperator, value: this.conditionValue }
                });
                this.editingNode.attr('label/text', displayText);
            }
        }
        this.closeConfig();
    }

    closeConfig() {
        this.showConfig = false;
        this.editingNode = null;
        this.cdr.detectChanges();
    }

    // Método chamado PELO LEGADO quando a modal fecha e salva
    public apiUpdateNodeData(nodeId: string, newConfig: any, newLabel?: string) {
        const cell = this.graph.getCellById(nodeId);
        if (cell && cell.isNode()) {
            const currentData = cell.getData();

            // Atualiza os dados internos
            cell.setData({
                ...currentData,
                config: newConfig,
                label: newLabel || currentData.label
            });

            // Atualiza visualmente o texto se mudou
            if (newLabel) {
                cell.attr('label/text', newLabel);
            }

            console.log(`✅ Nó ${nodeId} atualizado pelo Legado.`);
        }
    }

    onPropertyChange() {
        this.selectedOperator = '';
        this.conditionValue = '';
        this.updateOperators();
    }

    updateOperators() {
        if (this.selectedProperty) {
            this.availableOperators = OPERATORS_BY_TYPE[this.selectedProperty.type] || [];
        }
    }

    toggleActions() { this.showActions = !this.showActions; }
    toggleMaximize() { this.configMaximized = !this.configMaximized; }
    // #endregion

    // #region 4. Validação e Exportação
    public getExportData() {
        if (!this.validateProject()) return null;

        const fullGraph = this.graph.toJSON();
        const logicData = {
            nodes: fullGraph.cells.filter((c: any) => c.shape !== 'edge').map((n: any) => ({
                id: n.id,
                type: n.data?.type,
                label: n.data?.label,
                // Para IF: manda conditionData. Para Ação: manda o config (que veio do legado)
                config: n.data?.type === 'if' ? (n.data.conditionData || {}) : (n.data?.config || {})
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

    validateProject(): boolean {
        const nodes = this.graph.getNodes();
        for (const node of nodes) {
            const data = node.getData();
            if (data.type === 'start') continue;

            // Validação APENAS para o IF (que é nossa responsabilidade)
            if (data.type === 'if') {
                const c = data.conditionData;
                if (!c || !c.propertyId || !c.operator) {
                    this.handleValidationError(node, 'Configure a regra do IF.');
                    return false;
                }
            }
            // Ações comuns: Assumimos que o legado validou na modal dele ou permitimos salvar incompleto
        }
        return true;
    }

    handleValidationError(node: any, message: string) {
        this.selectCell(node);
        this.graph.centerCell(node);
        this.showSystemAlert('Atenção', message, 'warning');
    }

    // Arquivos locais
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
        if (!this.showConfig && (event.key === 'Delete' || event.key === 'Backspace') && this.selectedCell) {
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