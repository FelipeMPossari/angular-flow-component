import {
    Component, AfterViewInit, ViewChild, ElementRef,
    HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, SimpleChanges
} from '@angular/core';
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
    name: string;
    label: string;
    type: 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'date';
    placeholder?: string;
    required?: boolean;
    options?: { label: string; value: any }[];
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
    @Input() control: any;

    // --- OUTPUT (Para o Pai) ---
    @Output() saveGraph = new EventEmitter<WorkflowDefinition>();

    private graph!: Graph;
    public uiConfigSections: any[] = [];
    public configMaximized: boolean = false;

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

    public toggleMaximize() {
        this.configMaximized = !this.configMaximized;
    }

    private prepareFormSections(schema: any) {
        this.uiConfigSections = []; // Limpa anterior

        if (!schema) return;

        // CENÁRIO A: O JSON já tem seções (Formato Novo)
        // Esperamos algo como: { type: 'email', sections: [ { title: 'Geral', fields: [] } ] }
        if (schema.sections && Array.isArray(schema.sections)) {
            this.uiConfigSections = schema.sections;
        }
        // CENÁRIO B: O JSON é antigo (só tem 'fields')
        // A gente cria uma seção "Geral" falsa para não quebrar o layout
        else if (schema.fields && Array.isArray(schema.fields)) {
            this.uiConfigSections = [
                {
                    title: 'Configurações Gerais',
                    fields: schema.fields,
                    expanded: true // Para vir aberto por padrão
                }
            ];
        }
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

    public getExportData() {
        // 1. Pega o JSON Completo (Visual + Dados)
        // Esse serve para você salvar no banco e conseguir reabrir o fluxograma identico depois
        const fullGraph = this.graph.toJSON();

        // 2. Pega o JSON de Lógica (Limpo)
        // Esse serve para o seu backend processar o fluxo (C#, Node, etc)
        const logicData = {
            nodes: fullGraph.cells
                .filter((cell: any) => cell.shape !== 'edge') // Pega só os nós
                .map((node: any) => ({
                    id: node.id,
                    type: node.data?.type,    // Ex: 'action', 'if', 'start'
                    label: node.data?.label,  // O nome visual
                    config: node.data         // Os valores preenchidos (formulários)
                })),
            edges: fullGraph.cells
                .filter((cell: any) => cell.shape === 'edge') // Pega só as linhas
                .map((edge: any) => ({
                    source: edge.source.cell, // ID do nó de origem
                    target: edge.target.cell, // ID do nó de destino
                    sourcePort: edge.source.port, // Qual bolinha saiu (útil para IFs)
                }))
        };

        const result = {
            logic: logicData,
            graph: fullGraph
        };

        console.log('📦 Dados Gerados:', result);
        return result;
    }

    /**
   * Recebe o JSON completo (formato X6/Graph) e desenha na tela.
   * @param data Pode ser um Objeto JSON ou uma String JSON.
   */
    public importData(data: any) {
        console.log("📥 Recebendo dados para importação...", data);

        try {
            // 1. Garante que é um objeto (se vier string do banco, converte)
            const graphData = typeof data === 'string' ? JSON.parse(data) : data;

            // 2. Verifica se o JSON é válido para o X6
            // (Geralmente o JSON salvo tem a propriedade 'cells')
            if (!graphData || (!graphData.cells && !Array.isArray(graphData))) {
                console.warn("⚠️ O JSON fornecido não parece ser um gráfico válido do X6.");
                return false;
            }

            // 3. Carrega no Gráfico (O X6 faz a mágica)
            this.graph.fromJSON(graphData);

            // 4. Centraliza o conteúdo para ficar bonito
            this.graph.zoomToFit({ padding: 20, maxScale: 1 });

            console.log("✅ Importação concluída com sucesso!");
            return true;

        } catch (error) {
            console.error("❌ Erro ao importar dados:", error);
            return false;
        }
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['control'] && this.control) {
            this.control.getExportData = this.getExportData.bind(this);
            this.control.importData = this.importData.bind(this);
            this.control.clearCanvas = this.clearCanvas.bind(this);
        }
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
    addNode(type: string, toolLabel?: string, position?: { x: number, y: number }) {

        // Se passou posição (drop), usa ela. Se não (clique), gera aleatório.
        const x = position ? position.x : 100 + Math.random() * 200;
        const y = position ? position.y : 100 + Math.random() * 200;

        const nodeWidth = 160;
        const nodeHeight = 70;

        // Centraliza o nó no mouse quando soltar (opcional, ajusta o pivô para o centro)
        const finalX = position ? x - (nodeWidth / 2) : x;
        const finalY = position ? y - (nodeHeight / 2) : y;

        const labelStyle = {
            fill: '#333', fontSize: 14, fontFamily: 'Segoe UI', fontWeight: 600,
            textAnchor: 'middle', refX: 0.5, refY: 0.5,
            textWrap: { width: nodeWidth - 20, height: nodeHeight - 10, ellipsis: true, breakWord: false }
        };

        if (type === 'if') {
            this.graph.addNode({
                x: finalX, y: finalY, width: nodeWidth, height: nodeHeight, // Usa finalX/Y
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
                    items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }],
                },
            });
            return;
        }

        this.graph.addNode({
            x: finalX, y: finalY, width: nodeWidth, height: nodeHeight, // Usa finalX/Y
            data: { type: type, label: toolLabel || type },
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
                items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }],
            },
        });
    }

    // --- 2. NOVOS MÉTODOS PARA DRAG AND DROP ---

    onDragStart(event: DragEvent, type: string, label: string = '') {
        if (event.dataTransfer) {
            // Guarda os dados do botão que está sendo arrastado
            event.dataTransfer.setData('application/json', JSON.stringify({ type, label }));
            event.dataTransfer.effectAllowed = 'copy';

            // Opcional: Define uma imagem "fantasma" personalizada se quiser
            // event.dataTransfer.setDragImage(imgElement, 0, 0);
        }
    }

    onDragOver(event: DragEvent) {
        // É OBRIGATÓRIO prevenir o default para permitir o Drop
        event.preventDefault();
        if (event.dataTransfer) {
            event.dataTransfer.dropEffect = 'copy';
        }
    }

    onDrop(event: DragEvent) {
        event.preventDefault();
        if (!event.dataTransfer) return;

        const dataString = event.dataTransfer.getData('application/json');
        if (!dataString) return;

        try {
            const { type, label } = JSON.parse(dataString);

            // A MÁGICA: Converte coordenadas da tela (px) para coordenadas do grafo (X6)
            // Isso considera zoom, pan e scroll
            const { x, y } = this.graph.clientToLocal(event.clientX, event.clientY);

            this.addNode(type, label, { x, y });
        } catch (e) {
            console.error('Erro ao processar drop', e);
        }
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
                this.prepareFormSections(schema);
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

    public closeConfig() {
        // 1. Inicia a animação de fechar (slide out)
        this.showConfig = false;

        // 2. Limpa a variável do nó que estava sendo editado
        this.editingNode = null;

        // 3. Aguarda a animação terminar (300ms) para resetar o tamanho
        // Isso evita que a janela "encolha" visualmente antes de sumir
        setTimeout(() => {
            this.configMaximized = false;
        }, 300);

        // 4. Força a detecção de mudanças do Angular
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