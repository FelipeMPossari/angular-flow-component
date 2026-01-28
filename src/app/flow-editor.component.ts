import { Component, AfterViewInit, ViewChild, ElementRef, HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Shape, Cell } from '@antv/x6';

// Interfaces definidas acima (ou importadas)
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

@Component({
    selector: 'app-flow-editor', // Nome da tag para usar em outros lugares
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './flow-editor.component.html',
    styleUrls: ['./flow-editor.component.css']
})
export class FlowEditorComponent implements AfterViewInit {
    @ViewChild('container', { static: true }) container!: ElementRef;

    // --- INPUTS: O MUNDO EXTERNO ENVIA ISSO ---
    @Input() tools: FlowTool[] = [];           // Lista de ferramentas (Slack, Sheets...)
    @Input() properties: PropertyOption[] = []; // Lista para o IF (Status, Nome...)

    // --- OUTPUTS: SE PRECISAR EXPORTAR O JSON ---
    @Output() saveGraph = new EventEmitter<any>();

    private graph!: Graph;
    selectedCell: Cell | null = null;

    // Modal State
    showModal = false;
    editingNode: any = null;

    // Query Builder State
    selectedProperty: PropertyOption | null = null;
    selectedOperator: string = '';
    conditionValue: any = '';

    // Operadores estáticos (podem virar Input também se quiser muita flexibilidade)
    operatorsByType: any = {
        string: [{ id: 'eq', label: 'Igual a' }, { id: 'contains', label: 'Contém' }, { id: 'ne', label: 'Diferente de' }],
        number: [{ id: 'eq', label: '=' }, { id: 'gt', label: '>' }, { id: 'lt', label: '<' }, { id: 'gte', label: '>=' }],
        date: [{ id: 'eq', label: 'Em' }, { id: 'before', label: 'Antes de' }, { id: 'after', label: 'Depois de' }],
        boolean: [{ id: 'true', label: 'É Verdadeiro' }, { id: 'false', label: 'É Falso' }]
    };
    availableOperators: any[] = [];

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

    ngAfterViewInit() {
        this.initGraph();
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

                // --- NOVO: REGRAS DE VALIDAÇÃO DE CONEXÃO ---
                allowBlank: false, // Impede soltar a linha no "nada"
                highlight: true,   // Ilumina quando a conexão é válida

                validateConnection({ sourceMagnet, targetMagnet }) {
                    // Se não houver imã (porta) de origem ou destino, não conecta
                    if (!sourceMagnet || !targetMagnet) {
                        return false;
                    }

                    // Pega o nome do grupo das portas ('in', 'out', 'trueOut', 'falseOut')
                    // O X6 adiciona automaticamente o atributo 'port-group' no HTML da porta
                    const sourceGroup = sourceMagnet.getAttribute('port-group');
                    const targetGroup = targetMagnet.getAttribute('port-group');

                    // Regra 1: Impedir conexão se a origem for uma ENTRADA
                    // (O fluxo deve sempre sair de um Output e chegar num Input)
                    if (sourceGroup === 'in') {
                        return false;
                    }

                    // Regra 2: Impedir conexão se o destino for uma SAÍDA
                    // (Não podemos ligar uma saída diretamente em outra saída)
                    if (targetGroup !== 'in') {
                        return false;
                    }

                    // Se passou pelas regras (Origem é Saída E Destino é Entrada), permite!
                    return true;
                },

                createEdge() {
                    return new Shape.Edge({
                        attrs: {
                            line: {
                                stroke: '#5F95FF',
                                strokeWidth: 2,
                                targetMarker: { name: 'block', width: 12, height: 8 }
                            }
                        },
                        // Adiciona zIndex para garantir que a linha fique visível
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

        // Clique Duplo apenas no IF
        this.graph.on('node:dblclick', ({ node }) => {
            const data = node.getData();
            if (data && data.type === 'if') {
                this.ngZone.run(() => {
                    this.openModal(node);
                    this.cdr.detectChanges();
                });
            }
        });

        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());
    }

    // --- LÓGICA DE CRIAÇÃO (AGORA GENÉRICA) ---

    // --- LÓGICA DE CRIAÇÃO (CORRIGIDA) ---
    addNode(type: string, toolLabel?: string) {
        const x = 100 + Math.random() * 200;
        const y = 100 + Math.random() * 200;

        // 1. Definição de Tamanho Padrão para TODOS os nós
        // Isso garante que as portas fiquem alinhadas e as linhas retas
        const nodeWidth = 160;
        const nodeHeight = 70;

        // Estilo de fonte padrão
        const fontStyle = {
            fill: '#333',
            fontSize: 14,
            fontFamily: 'Segoe UI',
            fontWeight: 600,
            textAnchor: 'middle',
            refX: 0.5,
            refY: 0.5
        };

        // 2. NÓ IF
        if (type === 'if') {
            this.graph.addNode({
                x, y,
                width: nodeWidth, height: nodeHeight, // Usa o tamanho padrão
                data: { type: 'if' },
                markup: [
                    { tagName: 'rect', selector: 'body' },
                    { tagName: 'text', selector: 'label' }
                ],
                attrs: {
                    body: {
                        fill: '#fffbe6',
                        stroke: '#faad14',
                        strokeWidth: 2,
                        rx: 6, ry: 6
                    },
                    label: {
                        text: 'IF',
                        ...fontStyle
                    }
                },
                ports: {
                    groups: {
                        in: {
                            position: 'left',
                            attrs: { circle: { r: 5, magnet: true, stroke: '#faad14', fill: '#fff', strokeWidth: 2 } }
                        },
                        trueOut: {
                            position: 'right',
                            label: { position: { name: 'top', args: { y: -8 } } },
                            attrs: { circle: { r: 5, magnet: true, stroke: '#52c41a', fill: '#f6ffed', strokeWidth: 2 } }
                        },
                        falseOut: {
                            position: 'bottom',
                            label: { position: { name: 'right', args: { x: 10 } } },
                            attrs: { circle: { r: 5, magnet: true, stroke: '#ff4d4f', fill: '#fff1f0', strokeWidth: 2 } }
                        },
                    },
                    items: [
                        { group: 'in' },
                        { group: 'trueOut' },
                        { group: 'falseOut' }
                    ],
                },
            });
            return;
        }

        // 3. NÓS GENÉRICOS
        this.graph.addNode({
            x, y,
            width: nodeWidth, height: nodeHeight, // Usa o MESMO tamanho padrão
            data: { type: type },
            markup: [
                { tagName: 'rect', selector: 'body' },
                { tagName: 'text', selector: 'label' }
            ],
            attrs: {
                body: {
                    fill: '#ffffff',
                    stroke: '#ccc',
                    strokeWidth: 2,
                    strokeDasharray: '5,5',
                    rx: 6, ry: 6,
                    filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.05))'
                },
                label: {
                    text: toolLabel || type,
                    ...fontStyle
                }
            },
            ports: {
                groups: {
                    in: { position: 'left', attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } } },
                    out: { position: 'right', attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } } },
                },
                items: [{ group: 'in' }, { group: 'out' }],
            },
        });
    }

    // --- MODAL QUERY BUILDER ---

    openModal(node: any) {
        this.editingNode = node;
        const data = node.getData();

        this.selectedProperty = null;
        this.availableOperators = [];
        this.selectedOperator = '';
        this.conditionValue = '';

        if (data.conditionData) {
            // Re-hidrata o modal com dados salvos
            this.selectedProperty = this.properties.find(p => p.id === data.conditionData.propertyId) || null;
            if (this.selectedProperty) {
                this.updateOperators();
                this.selectedOperator = data.conditionData.operator;
                this.conditionValue = data.conditionData.value;
            }
        }
        this.showModal = true;
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

    saveCondition() {
        if (this.editingNode && this.selectedProperty && this.selectedOperator) {
            const currentData = this.editingNode.getData();

            const opLabel = this.availableOperators.find(op => op.id === this.selectedOperator)?.label;
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
            this.closeModal();
        }
    }

    closeModal() {
        this.showModal = false;
        this.editingNode = null;
        this.cdr.detectChanges();
    }

    // --- SELEÇÃO E DELEÇÃO ---
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
        if (!this.showModal && (event.key === 'Delete' || event.key === 'Backspace')) {
            if (this.selectedCell) {
                this.graph.removeCell(this.selectedCell);
                this.selectedCell = null;
            }
        }
    }
}