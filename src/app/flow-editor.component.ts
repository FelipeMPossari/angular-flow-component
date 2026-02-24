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

    @Input() tools: Models.FlowTool[] = [];
    @Input() control: any;

    @Output() saveGraph = new EventEmitter<Models.WorkflowDefinition>();

    private graph!: Graph;
    selectedCell: Cell | null = null;
    showActions = true;
    modalState: Models.ModalState = { visible: false, type: 'alert', title: '', message: '', confirmLabel: 'OK', pendingAction: null };

    constructor(private ngZone: NgZone, private cdr: ChangeDetectorRef) { }

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

        this.graph.on('node:dblclick', ({ node }) => {
            this.ngZone.run(() => {
                const type = node.getData()?.type;
                if (type === 'and' || type === 'or') return;
                this.resetSelection();
                this.fireLegacyModal(node);
            });
        });

        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());

        // Esconde a porta falseOut quando ligar num AND/OR e limpa linhas órfãs
        this.graph.on('edge:connected', ({ edge }) => {
            const source = edge.getSourceCell() as Cell;
            const target = edge.getTargetCell() as Cell;
            if (!source || !target || !source.isNode() || !target.isNode()) return;

            const sourceType = source.getData()?.type;
            const targetType = target.getData()?.type;
            const sourcePort = edge.getSourcePortId();

            if (sourceType === 'if' && (targetType === 'and' || targetType === 'or'))
                if (sourcePort === 'trueOut') {

                    // 1. Busca se tem alguma linha presa na porta falsa e destrói ela
                    const outgoingEdges = this.graph.getOutgoingEdges(source) || [];
                    outgoingEdges.filter(e => e.getSourcePortId() === 'falseOut').forEach(e => this.graph.removeCell(e));

                    // 2. Some com a bolinha vermelha visualmente
                    source.setPortProp('falseOut', 'attrs/circle/style', { display: 'none' });
                    source.setPortProp('falseOut', 'disabled', true);
                }
        });

        // Restaura a porta falseOut quando a linha for removida
        this.graph.on('edge:removed', ({ edge }) => {
            const sourceInfo = edge.getSource() as any;
            if (!sourceInfo || !sourceInfo.cell) return;

            const sourceNode = this.graph.getCellById(sourceInfo.cell);
            if (!sourceNode || !sourceNode.isNode()) return;

            const sourceType = sourceNode.getData()?.type;
            const sourcePort = sourceInfo.port;

            if (sourceType === 'if' && sourcePort === 'trueOut') {
                // VERIFICAÇÃO DE LINHA FANTASMA:
                // Pega todas as linhas que ainda estão saindo deste nó
                const outgoingEdges = this.graph.getOutgoingEdges(sourceNode) || [];

                // Checa se ainda existe alguma linha saindo do trueOut ligada a um AND/OR
                const isStillConnected = outgoingEdges.some(e => {
                    const targetNode = e.getTargetCell();
                    if (!targetNode || !targetNode.isNode()) return false;

                    const tType = targetNode.getData()?.type;
                    return e.getSourcePortId() === 'trueOut' && (tType === 'and' || tType === 'or');
                });

                // Se não houver mais nenhuma ligação real, aí sim devolvemos a porta
                if (!isStillConnected) {
                    sourceNode.setPortProp('falseOut', 'attrs/circle/style', { display: '' });
                    sourceNode.setPortProp('falseOut', 'disabled', false);
                }
            }
        });
    }

    addNode(type: string, toolLabel?: string, position?: { x: number, y: number }) {
        const x = position ? position.x : 100 + Math.random() * 200;
        const y = position ? position.y : 100 + Math.random() * 200;
        const finalX = position ? x - 80 : x;
        const finalY = position ? y - 35 : y;

        const commonAttrs = { label: { text: toolLabel || type.toUpperCase(), ...LABEL_STYLE } };

        if (type === 'if') {
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                data: { type: 'if', config: {} },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#fffbe6', stroke: '#faad14', strokeWidth: 2, rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }] },
            });
        } else if (type === 'and' || type === 'or') {
            const isAnd = type === 'and';
            this.graph.addNode({
                x: finalX, y: finalY, width: 80, height: 30,
                data: { type, config: {} },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: {
                    body: { fill: isAnd ? '#d1e7dd' : '#cfe2ff', stroke: isAnd ? '#0f5132' : '#084298', strokeWidth: 2, rx: 6, ry: 6 },
                    label: { text: isAnd ? 'E' : 'OU', fill: isAnd ? '#0f5132' : '#084298', fontWeight: 'bold' }
                },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'trueOut', id: 'trueOut' }, { group: 'falseOut', id: 'falseOut' }] },
            });
        } else {
            // AÇÕES: Apenas porta de entrada
            this.graph.addNode({
                x: finalX, y: finalY, width: 160, height: 70,
                data: { type: type, label: toolLabel || type, config: {} },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#ffffff', stroke: '#ccc', strokeWidth: 2, strokeDasharray: '5,5', rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }] },
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

    fireLegacyModal(node: any) {
        if (!this.control?.onEditNode) {
            console.warn("⚠️ Método 'onEditNode' não definido no control!");
            return;
        }
        const data = node.getData();
        this.control.onEditNode(node.id, data.type, data.config || {});
    }

    public apiUpdateNodeData(nodeId: string, newConfig: any, newLabel?: string) {
        const cell = this.graph.getCellById(nodeId);
        if (cell && cell.isNode()) {
            const currentData = cell.getData();
            let displayLabel = newLabel || currentData.label;

            cell.setData({ ...currentData, config: newConfig, label: displayLabel });
            if (displayLabel) cell.attr('label/text', displayLabel);
        }
    }

    toggleActions() { this.showActions = !this.showActions; }

    public getExportData() {
        const fullGraph = this.graph.toJSON();

        const logicData = {
            nodes: fullGraph.cells
                .filter((c: any) => c.shape !== 'edge')
                .map((n: any) => ({
                    id: n.id,
                    type: n.data?.type,
                    label: n.data?.label,
                    config: n.data?.config || {}
                })),

            edges: fullGraph.cells
                .filter((c: any) => c.shape === 'edge')
                .map((e: any) => ({
                    id: e.id,
                    source: e.source.cell,
                    target: e.target.cell,
                    sourcePort: e.source.port,
                    targetPort: e.target.port
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
            return true;
        } catch {
            return false;
        }
    }

    public confirmClearCanvas() {
        this.showSystemConfirm('Limpar Fluxo', 'Tem certeza que deseja apagar todo o fluxo desenhado? Esta ação não pode ser desfeita.', () => this.clearCanvas());
    }

    public clearCanvas() {
        this.graph.clearCells();
    }

    private showSystemConfirm(title: string, message: string, onConfirm: () => void) {
        this.modalState = {
            visible: true,
            type: 'confirm',
            title,
            message,
            confirmLabel: 'Sim',
            pendingAction: onConfirm
        };
        // Opcional, mas recomendado para garantir que a tela atualize na mesma hora
        this.cdr.detectChanges();
    }

    saveProjectFile() { FlowUtils.downloadJson(this.graph.toJSON()); }
    triggerFileInput() { document.getElementById('fileInput')?.click(); }
    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        FlowUtils.readJsonFile(file).then(json => this.importData(json));
        event.target.value = '';
    }

    selectCell(cell: Cell) {
        this.resetSelection();
        this.selectedCell = cell;
        const style = { stroke: '#ff9c6e', strokeWidth: 3 };
        cell.isNode() ? cell.attr('body', style) : cell.attr('line', style);
    }

    resetSelection() {
        if (this.selectedCell) {
            if (this.selectedCell.isNode()) {
                const type = this.selectedCell.getData()?.type;
                const stroke = type === 'if' ? '#faad14' : (type === 'and' ? '#0f5132' : (type === 'or' ? '#084298' : '#ccc'));
                this.selectedCell.attr('body', { stroke: stroke, strokeWidth: 2 });
            } else if (this.selectedCell.isEdge()) {
                this.selectedCell.attr('line', { stroke: '#5F95FF', strokeWidth: 2 });
            }
        }
        this.selectedCell = null;
    }

    @HostListener('window:keydown', ['$event'])
    handleKeyDown(event: KeyboardEvent) {
        if ((event.key === 'Delete') && this.selectedCell) {
            this.graph.removeCell(this.selectedCell);
            this.selectedCell = null;
        }
    }

    confirmModalAction() { this.modalState.pendingAction?.(); this.closeModal(); }

    closeModal() {
        this.modalState.visible = false; this.modalState.pendingAction = null;
        this.cdr.detectChanges();
    }
}