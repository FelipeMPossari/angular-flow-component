import { Component, AfterViewInit, ViewChild, ElementRef, HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Shape, Cell } from '@antv/x6';

// --- INTERFACES DE DADOS ---

export interface FlowTool {
    id: string;
    label: string;
    icon?: string;
}

export interface PropertyOption {
    id: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
}

// Interfaces para o Formulário Dinâmico
export interface ToolField {
    name: string;        // Chave do JSON (ex: 'channel_id')
    label: string;       // Texto visível
    type: 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'date';
    placeholder?: string;
    required?: boolean;
    options?: { label: string; value: any }[]; // Apenas para select
}

export interface ToolSchema {
    type: string;        // ID da ferramenta (ex: 'slack')
    fields: ToolField[]; // Campos do formulário
}

// Interface do JSON final para o Backend
export interface WorkflowNode {
    id: string;
    type: string;
    config?: any;
    next?: string;
    nextTrue?: string;
    nextFalse?: string;
}

export interface WorkflowDefinition {
    startNodeId: string | null;
    nodes: WorkflowNode[];
}

@Component({
    selector: 'app-flow-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './flow-editor.component.html',
    styleUrls: ['./flow-editor.component.css']
})
export class FlowEditorComponent implements AfterViewInit {
    @ViewChild('container', { static: true }) container!: ElementRef;

    // --- INPUTS (O Pai fornece) ---
    @Input() tools: FlowTool[] = [];
    @Input() properties: PropertyOption[] = [];
    @Input() schemas: ToolSchema[] = []; // Schemas dos formulários dinâmicos

    // --- OUTPUT (Para o Pai) ---
    @Output() saveGraph = new EventEmitter<WorkflowDefinition>();

    private graph!: Graph;
    selectedCell: Cell | null = null;

    // Controle de Visibilidade das Sidebars
    showActions = true;  // Sidebar Esquerda (Ferramentas)
    showConfig = false; // Sidebar Direita (Configuração)

    editingNode: any = null;

    // --- VARIÁVEIS PARA EDIÇÃO DO 'IF' ---
    selectedProperty: PropertyOption | null = null;
    selectedOperator: string = '';
    conditionValue: any = '';

    operatorsByType: any = {
        string: [{ id: 'eq', label: 'Igual a' }, { id: 'contains', label: 'Contém' }, { id: 'ne', label: 'Diferente de' }],
        number: [{ id: 'eq', label: '=' }, { id: 'gt', label: '>' }, { id: 'lt', label: '<' }, { id: 'gte', label: '>=' }],
        date: [{ id: 'eq', label: 'Em' }, { id: 'before', label: 'Antes de' }, { id: 'after', label: 'Depois de' }],
        boolean: [{ id: 'true', label: 'É Verdadeiro' }, { id: 'false', label: 'É Falso' }]
    };
    availableOperators: any[] = [];

    // --- VARIÁVEIS PARA EDIÇÃO DINÂMICA (GENÉRICA) ---
    currentSchema: ToolSchema | null = null;
    dynamicValues: any = {};
    editingNodeLabel: string = '';

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

    ngAfterViewInit() {
        this.initGraph();
    }

    toggleActions() {
        this.showActions = !this.showActions;
    }

    private initGraph() {
        this.graph = new Graph({
            container: this.container.nativeElement,
            grid: { size: 20, visible: true, type: 'mesh', args: { color: '#e0e0e0' } },
            panning: true,
            mousewheel: { enabled: true, modifiers: ['ctrl', 'meta'] },
            connecting: {
                router: 'manhattan',
                connector: { name: 'rounded', args: { radius: 8 } },
                anchor: 'center',
                connectionPoint: 'boundary',
                snap: true,
                allowBlank: false,
                highlight: true,

                // --- VALIDAÇÃO DE CONEXÕES ---
                validateConnection: ({ sourceView, targetView, sourceMagnet, targetMagnet }) => {
                    if (!sourceMagnet || !targetMagnet || !sourceView || !targetView) return false;

                    const sourceGroup = sourceMagnet.getAttribute('port-group');
                    const targetGroup = targetMagnet.getAttribute('port-group');

                    // 1. Sentido Obrigatório: Saída -> Entrada
                    if (sourceGroup === 'in') return false;
                    if (targetGroup !== 'in') return false;

                    // 2. Unicidade: Não permitir duplicar a mesma conexão
                    const sourcePortId = sourceMagnet.getAttribute('port');
                    const targetPortId = targetMagnet.getAttribute('port');
                    const targetNodeId = targetView.cell.id;

                    const outgoingEdges = this.graph.getOutgoingEdges(sourceView.cell);
                    if (outgoingEdges) {
                        const isDuplicate = outgoingEdges.some(edge => {
                            const target = edge.getTargetCell();
                            if (target && target.id === targetNodeId) {
                                return edge.getTargetPortId() === targetPortId && edge.getSourcePortId() === sourcePortId;
                            }
                            return false;
                        });
                        if (isDuplicate) return false;
                    }

                    return true;
                },
                createEdge() {
                    return new Shape.Edge({
                        attrs: {
                            line: { stroke: '#5F95FF', strokeWidth: 2, targetMarker: { name: 'block', width: 12, height: 8 } }
                        },
                        zIndex: 0
                    });
                },
            },
        });

        this.registerEvents();
    }

    private registerEvents() {
        this.graph.on('node:click', ({ node }) => this.ngZone.run(() => this.selectCell(node)));
        this.graph.on('edge:click', ({ edge }) => this.ngZone.run(() => this.selectCell(edge)));
        this.graph.on('blank:click', () => this.ngZone.run(() => this.resetSelection()));

        // Clique Duplo: Abre Sidebar de Configuração (Para qualquer nó)
        this.graph.on('node:dblclick', ({ node }) => {
            this.ngZone.run(() => {
                this.openConfigSidebar(node);
                this.cdr.detectChanges();
            });
        });

        // Ferramenta de deletar na aresta (hover)
        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());
    }

    // --- CRIAÇÃO DE NÓS ---
    addNode(type: string, toolLabel?: string) {
        const x = 100 + Math.random() * 200;
        const y = 100 + Math.random() * 200;

        const nodeWidth = 160;
        const nodeHeight = 70;

        // Estilo com TextWrap (Reticências)
        const labelStyle = {
            fill: '#333', fontSize: 14, fontFamily: 'Segoe UI', fontWeight: 600,
            textAnchor: 'middle', refX: 0.5, refY: 0.5,
            textWrap: {
                width: nodeWidth - 20,
                height: nodeHeight - 10,
                ellipsis: true,
                breakWord: false
            }
        };

        // 1. NÓ IF
        if (type === 'if') {
            this.graph.addNode({
                x, y, width: nodeWidth, height: nodeHeight,
                data: { type: 'if' },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: {
                    body: { fill: '#fffbe6', stroke: '#faad14', strokeWidth: 2, rx: 6, ry: 6 },
                    label: { text: 'IF', ...labelStyle }
                },
                ports: {
                    groups: {
                        in: { position: 'left', attrs: { circle: { r: 5, magnet: true, stroke: '#faad14', fill: '#fff', strokeWidth: 2 } } },
                        trueOut: { position: 'right', attrs: { circle: { r: 5, magnet: true, stroke: '#52c41a', fill: '#f6ffed', strokeWidth: 2 } } },
                        falseOut: { position: 'bottom', attrs: { circle: { r: 5, magnet: true, stroke: '#ff4d4f', fill: '#fff1f0', strokeWidth: 2 } } },
                    },
                    // IMPORTANTE: IDs definidos para exportação funcionar
                    items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }],
                },
            });
            return;
        }

        // 2. NÓS GENÉRICOS
        this.graph.addNode({
            x, y, width: nodeWidth, height: nodeHeight,
            data: { type: type, label: toolLabel || type }, // Salva o label original nos dados
            markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
            attrs: {
                body: {
                    fill: '#ffffff', stroke: '#ccc', strokeWidth: 2, strokeDasharray: '5,5',
                    rx: 6, ry: 6, filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))'
                },
                label: { text: toolLabel || type, ...labelStyle }
            },
            ports: {
                groups: {
                    in: { position: 'left', attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } } },
                    out: { position: 'right', attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } } },
                },
                // IMPORTANTE: IDs definidos
                items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }],
            },
        });
    }

    // --- LÓGICA DO MENU LATERAL DE CONFIGURAÇÃO ---

    openConfigSidebar(node: any) {
        this.editingNode = node;
        const data = node.getData();

        // Reseta estados
        this.selectedProperty = null;
        this.availableOperators = [];
        this.selectedOperator = '';
        this.conditionValue = '';
        this.editingNodeLabel = '';

        this.currentSchema = null;
        this.dynamicValues = {};

        // CASO 1: NÓ IF
        if (data.type === 'if') {
            if (data.conditionData) {
                this.selectedProperty = this.properties.find(p => p.id === data.conditionData.propertyId) || null;
                if (this.selectedProperty) {
                    this.updateOperators();
                    this.selectedOperator = data.conditionData.operator;
                    this.conditionValue = data.conditionData.value;
                }
            }
        }
        // CASO 2: NÓS GENÉRICOS (Dinâmicos)
        else {
            // Carrega Label atual
            this.editingNodeLabel = node.attr('label/text') || data.label || '';

            // Busca Schema compatível
            const schema = this.schemas.find(s => s.type === data.type);

            if (schema) {
                this.currentSchema = schema;
                // Carrega valores salvos ou inicia vazio
                this.dynamicValues = { ...(data.config || {}) };
            }
        }

        this.showConfig = true; // Abre o menu
    }

    onPropertyChange() {
        this.selectedOperator = '';
        this.conditionValue = '';
        this.updateOperators();
    }

    updateOperators() {
        if (this.selectedProperty) {
            this.availableOperators = this.operatorsByType[this.selectedProperty.type] || [];
        }
    }

    saveConfiguration() {
        if (!this.editingNode) return;
        const currentData = this.editingNode.getData();

        // SALVAR IF
        if (currentData.type === 'if') {
            if (this.selectedProperty && this.selectedOperator) {
                const opLabel = this.availableOperators.find((op: any) => op.id === this.selectedOperator)?.label;
                let displayText = `${this.selectedProperty.label}\n${opLabel}`;
                if (this.selectedProperty.type !== 'boolean') {
                    displayText += ` ${this.conditionValue}`;
                }

                this.editingNode.setData({
                    ...currentData,
                    conditionData: {
                        propertyId: this.selectedProperty.id,
                        operator: this.selectedOperator,
                        value: this.conditionValue
                    }
                });
                this.editingNode.attr('label/text', displayText);
            }
        }
        // SALVAR GENÉRICO
        else {
            // Atualiza visual
            this.editingNode.attr('label/text', this.editingNodeLabel);

            // Atualiza dados
            this.editingNode.setData({
                ...currentData,
                label: this.editingNodeLabel,
                config: this.dynamicValues // Salva o form dinâmico
            });
        }

        this.closeConfig();
    }

    closeConfig() {
        this.showConfig = false;
        this.editingNode = null;
        this.cdr.detectChanges();
    }

    // --- PERSISTÊNCIA E EXPORTAÇÃO ---

    saveProjectFile() {
        const data = this.graph.toJSON();
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `fluxo-${new Date().getTime()}.json`;
        a.click();
        window.URL.revokeObjectURL(url);
    }

    triggerFileInput() {
        const fileInput = document.getElementById('fileInput') as HTMLInputElement;
        if (fileInput) fileInput.click();
    }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e: any) => {
            try {
                const jsonData = JSON.parse(e.target.result);
                this.graph.clearCells();
                this.graph.fromJSON(jsonData);
                this.graph.centerContent();
                alert('Projeto carregado com sucesso!');
            } catch (error) {
                alert('Erro ao carregar arquivo. Verifique se é um JSON válido.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    clearCanvas() {
        if (confirm('Tem certeza que deseja limpar todo o fluxo?')) {
            this.graph.clearCells();
        }
    }

    exportGraph() {
        const nodes: WorkflowNode[] = [];
        const allCells = this.graph.getNodes();
        const allEdges = this.graph.getEdges();

        allCells.forEach(cell => {
            const data = cell.getData();
            const nodeId = cell.id;

            const nodeJson: WorkflowNode = {
                id: nodeId,
                type: data.type,
                // Se IF -> conditionData; Se Genérico -> config (do form dinâmico)
                config: data.type === 'if' ? (data.conditionData || {}) : (data.config || {})
            };

            const outgoingEdges = allEdges.filter(edge => edge.getSourceCellId() === nodeId);

            if (data.type === 'if') {
                const trueEdge = outgoingEdges.find(edge => edge.getSourcePortId() === 'trueOut');
                const falseEdge = outgoingEdges.find(edge => edge.getSourcePortId() === 'falseOut');
                if (trueEdge) nodeJson.nextTrue = trueEdge.getTargetCellId();
                if (falseEdge) nodeJson.nextFalse = falseEdge.getTargetCellId();
            } else {
                const edge = outgoingEdges.find(edge => edge.getSourcePortId() === 'out');
                if (edge) nodeJson.next = edge.getTargetCellId();
            }
            nodes.push(nodeJson);
        });

        const targetIds = new Set(allEdges.map(e => e.getTargetCellId()));
        const startNode = nodes.find(n => !targetIds.has(n.id));

        const finalPayload: WorkflowDefinition = {
            startNodeId: startNode ? startNode.id : null,
            nodes: nodes
        };

        console.log('JSON EXPORTADO (Lógica Pura):', finalPayload);
        this.saveGraph.emit(finalPayload);
        alert('JSON Gerado no Console (F12)!');
    }

    // --- UTILITÁRIOS DE SELEÇÃO ---
    selectCell(cell: Cell) {
        this.resetSelection();
        this.selectedCell = cell;
        if (cell.isNode()) {
            cell.attr('body/stroke', '#ff9c6e');
            cell.attr('body/strokeWidth', 3);
        } else if (cell.isEdge()) {
            cell.attr('line/stroke', '#ff9c6e');
            cell.attr('line/strokeWidth', 3);
        }
    }

    resetSelection() {
        if (this.selectedCell) {
            if (this.selectedCell.isNode()) {
                const isIf = this.selectedCell.getData()?.type === 'if';
                this.selectedCell.attr('body/stroke', isIf ? '#faad14' : '#ccc');
                this.selectedCell.attr('body/strokeWidth', 2);
            } else if (this.selectedCell.isEdge()) {
                this.selectedCell.attr('line/stroke', '#5F95FF');
                this.selectedCell.attr('line/strokeWidth', 2);
            }
        }
        this.selectedCell = null;
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent) {
        // Só deleta se não estiver editando (showConfig false)
        if (!this.showConfig && (event.key === 'Delete' || event.key === 'Backspace')) {
            if (this.selectedCell) {
                this.graph.removeCell(this.selectedCell);
                this.selectedCell = null;
            }
        }
    }
}