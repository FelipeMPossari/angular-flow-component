import { Component, AfterViewInit, ViewChild, ElementRef, HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Shape, Cell } from '@antv/x6';

// Interfaces
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
    selector: 'app-flow-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './flow-editor.component.html',
    styleUrls: ['./flow-editor.component.css']
})
export class FlowEditorComponent implements AfterViewInit {
    @ViewChild('container', { static: true }) container!: ElementRef;

    @Input() tools: FlowTool[] = [];
    @Input() properties: PropertyOption[] = [];
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

                allowBlank: false,
                highlight: true,

                // --- VALIDAÇÃO DE CONEXÕES ---
                // Agora recebemos as Views para poder checar duplicidade
                validateConnection: ({ sourceView, targetView, sourceMagnet, targetMagnet }) => {
                    // 1. Validação Básica: Precisa ter origem e destino
                    if (!sourceMagnet || !targetMagnet || !sourceView || !targetView) {
                        return false;
                    }

                    // 2. Validação de Grupo (Entrada/Saída)
                    const sourceGroup = sourceMagnet.getAttribute('port-group');
                    const targetGroup = targetMagnet.getAttribute('port-group');

                    // Origem deve ser SAÍDA
                    if (sourceGroup === 'in') return false;

                    // Destino deve ser ENTRADA
                    if (targetGroup !== 'in') return false;

                    // 3. Validação de Duplicidade (NOVA)
                    // Impede criar uma aresta se ela já existe (Mesmo SourcePort -> Mesmo TargetPort)

                    const sourcePortId = sourceMagnet.getAttribute('port');
                    const targetPortId = targetMagnet.getAttribute('port');
                    const targetNodeId = targetView.cell.id;

                    // Pega todas as arestas que saem do nó de origem
                    const outgoingEdges = this.graph.getOutgoingEdges(sourceView.cell);

                    if (outgoingEdges) {
                        // Verifica se alguma aresta já conecta na mesma porta do mesmo nó destino
                        const isDuplicate = outgoingEdges.some(edge => {
                            const target = edge.getTargetCell();
                            // A aresta pode estar conectada a um ponto solto, então validamos se tem target
                            if (target && target.id === targetNodeId) {
                                const edgeTargetPort = edge.getTargetPortId();
                                const edgeSourcePort = edge.getSourcePortId();

                                // Se for a mesma porta de origem E a mesma porta de destino = DUPLICADA
                                return edgeTargetPort === targetPortId && edgeSourcePort === sourcePortId;
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

    // --- LÓGICA DE CRIAÇÃO (COM TEXT WRAP) ---
    addNode(type: string, toolLabel?: string) {
        const x = 100 + Math.random() * 200;
        const y = 100 + Math.random() * 200;

        const nodeWidth = 160;
        const nodeHeight = 70;

        const labelStyle = {
            fill: '#333',
            fontSize: 14,
            fontFamily: 'Segoe UI',
            fontWeight: 600,
            textAnchor: 'middle',
            refX: 0.5,
            refY: 0.5,
            textWrap: {
                width: nodeWidth - 20,
                height: nodeHeight - 10,
                ellipsis: true,
                breakWord: false
            }
        };

        if (type === 'if') {
            this.graph.addNode({
                x, y,
                width: nodeWidth, height: nodeHeight,
                data: { type: 'if' },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: {
                    body: { fill: '#fffbe6', stroke: '#faad14', strokeWidth: 2, rx: 6, ry: 6 },
                    label: { text: 'IF', ...labelStyle }
                },
                ports: {
                    groups: {
                        in: { position: 'left', attrs: { circle: { r: 5, magnet: true, stroke: '#faad14', fill: '#fff', strokeWidth: 2 } } },
                        trueOut: { position: 'right', label: { position: { name: 'top', args: { y: -8 } } }, attrs: { circle: { r: 5, magnet: true, stroke: '#52c41a', fill: '#f6ffed', strokeWidth: 2 } } },
                        falseOut: { position: 'bottom', label: { position: { name: 'right', args: { x: 10 } } }, attrs: { circle: { r: 5, magnet: true, stroke: '#ff4d4f', fill: '#fff1f0', strokeWidth: 2 } } },
                    },
                    items: [{ group: 'in' }, { group: 'trueOut' }, { group: 'falseOut' }],
                },
            });
            return;
        }

        this.graph.addNode({
            x, y,
            width: nodeWidth, height: nodeHeight,
            data: { type: type },
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
            this.closeModal();
        }
    }

    closeModal() {
        this.showModal = false;
        this.editingNode = null;
        this.cdr.detectChanges();
    }

    // --- SELEÇÃO ---
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