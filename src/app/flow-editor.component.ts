import {
    Component, AfterViewInit, ViewChild, ElementRef,
    HostListener, NgZone, ChangeDetectorRef, Input, Output, EventEmitter, SimpleChanges
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Graph, Cell } from '@antv/x6';

// Imports dos nossos arquivos auxiliares
import * as Models from './flow.models';
import { getGraphOptions, LABEL_STYLE, PORT_GROUPS, validateConnectionRule } from './flow-graph.config';
import { FlowUtils } from './flow.utils';         // <--- NOVO
import { OPERATORS_BY_TYPE } from './flow.constants'; // <--- NOVO

@Component({
    selector: 'app-flow-editor',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './flow-editor.component.html',
    styleUrls: ['./flow-editor.component.css']
})
export class FlowEditorComponent implements AfterViewInit {
    @ViewChild('container', { static: true }) container!: ElementRef;

    // --- INPUTS & OUTPUTS ---
    @Input() tools: Models.FlowTool[] = [];
    @Input() properties: Models.PropertyOption[] = [];
    @Input() schemas: Models.ToolSchema[] = [];
    @Input() control: any;
    @Output() saveGraph = new EventEmitter<Models.WorkflowDefinition>();

    // --- ESTADO ---
    private graph!: Graph;
    selectedCell: Cell | null = null;

    // UI
    showActions = true;
    showConfig = false;
    configMaximized = false;
    uiConfigSections: Models.ToolSection[] = [];

    modalState: Models.ModalState = { visible: false, type: 'alert', title: '', message: '', confirmLabel: 'OK', pendingAction: null };

    // Edição
    editingNode: any = null;
    editingNodeLabel: string = '';
    dynamicValues: any = {};
    currentSchema: Models.ToolSchema | null = null;

    // IF e Relations
    selectedProperty: Models.PropertyOption | null = null;
    selectedOperator: string = '';
    conditionValue: any = '';
    availableOperators: any[] = [];
    relationState: any = {};

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
        }

        if (changes['properties'] && this.properties) {
            this.properties = this.properties.map(prop => ({
                ...prop,
                type: FlowUtils.normalizeType(prop.type) // <--- Usando Utils
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
        this.graph.on('node:dblclick', ({ node }) => this.ngZone.run(() => { this.openConfigSidebar(node); this.cdr.detectChanges(); }));

        this.graph.on('edge:mouseenter', ({ edge }) => {
            edge.addTools([{ name: 'button-remove', args: { distance: '50%', offset: 0, onClick: () => edge.remove() } }]);
        });
        this.graph.on('edge:mouseleave', ({ edge }) => edge.removeTools());
    }
    // #endregion

    // #region 2. Nós (Add/Drag)
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
                data: { type: type, label: toolLabel || type },
                markup: [{ tagName: 'rect', selector: 'body' }, { tagName: 'text', selector: 'label' }],
                attrs: { body: { fill: '#ffffff', stroke: '#ccc', strokeWidth: 2, strokeDasharray: '5,5', rx: 6, ry: 6 }, ...commonAttrs },
                ports: { groups: PORT_GROUPS, items: [{ group: 'in', id: 'in' }, { group: 'out', id: 'out' }] },
            });
        }
    }

    onDragStart(event: DragEvent, type: string, label: string = '') {
        event.dataTransfer?.setData('application/json', JSON.stringify({ type, label }));
    }

    onDragOver(event: DragEvent) {
        event.preventDefault();
    }

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

    // #region 3. Configuração
    openConfigSidebar(node: any) {
        this.editingNode = node;
        const data = node.getData();

        // Resets
        this.selectedProperty = null;
        this.availableOperators = [];
        this.selectedOperator = '';
        this.conditionValue = '';
        this.editingNodeLabel = '';
        this.dynamicValues = {};
        this.currentSchema = null;

        if (data.type === 'if') {
            if (data.conditionData) {
                this.selectedProperty = this.properties.find(p => p.id === data.conditionData.propertyId) || null;
                if (this.selectedProperty) {
                    this.updateOperators();
                    this.selectedOperator = data.conditionData.operator;
                    this.conditionValue = data.conditionData.value;
                }
            }
        } else {
            this.editingNodeLabel = node.attr('label/text') || data.label || '';
            const schema = this.schemas.find(s => s.type === data.type);
            if (schema) {
                this.currentSchema = schema;
                this.prepareFormSections(schema);
                this.dynamicValues = { ...(data.config || {}) };
                setTimeout(() => this.loadSavedLabels(), 50);
            }
        }
        this.showConfig = true;
    }

    saveConfiguration() {
        if (!this.editingNode) return;
        const currentData = this.editingNode.getData();

        if (currentData.type === 'if') {
            if (this.selectedProperty && this.selectedOperator) {
                const opLabel = this.availableOperators.find((op: any) => op.id === this.selectedOperator)?.label;
                let displayText = `${this.selectedProperty.label}\n${opLabel}`;
                if (this.selectedProperty.type !== 'boolean') displayText += ` ${this.conditionValue}`;

                this.editingNode.setData({ ...currentData, conditionData: { propertyId: this.selectedProperty.id, operator: this.selectedOperator, value: this.conditionValue } });
                this.editingNode.attr('label/text', displayText);
            }
        } else {
            this.editingNode.attr('label/text', this.editingNodeLabel);
            this.editingNode.setData({ ...currentData, label: this.editingNodeLabel, config: this.dynamicValues });
        }
        this.closeConfig();
    }

    closeConfig() {
        this.showConfig = false;
        this.editingNode = null;
        setTimeout(() => { this.configMaximized = false; }, 300);
        this.cdr.detectChanges();
    }

    private prepareFormSections(schema: Models.ToolSchema) {
        this.uiConfigSections = [];
        if (!schema) return;
        this.uiConfigSections = schema.sections || (schema.fields ? [{ title: 'Geral', fields: schema.fields, expanded: true }] : []);
    }

    onPropertyChange() {
        this.selectedOperator = '';
        this.conditionValue = '';
        this.updateOperators();
    }

    updateOperators() {
        if (this.selectedProperty) {
            // <--- Usando CONSTANTE importada
            this.availableOperators = OPERATORS_BY_TYPE[this.selectedProperty.type] || [];
        }
    }

    toggleActions() { this.showActions = !this.showActions; }
    toggleMaximize() { this.configMaximized = !this.configMaximized; }
    // #endregion

    // #region 4. Relations (API)
    loadRelationData(field: Models.ToolField, isScroll = false) {
        if (!this.control?.searchRelation) return;
        const key = field.property;
        const state = this.relationState[key];
        if (state.loading || (isScroll && !state.hasMore)) return;

        state.loading = true;
        this.control.searchRelation(field.class, state.search, state.page, field.filter || {})
            .then((response: any) => {
                state.options = state.page === 1 ? response.items : [...state.options, ...response.items];
                state.hasMore = response.hasMore;
                state.page++;
                state.loading = false;
            })
            .catch(() => state.loading = false);
    }

    onRelationSearch(field: Models.ToolField, event: any) {
        const key = field.property;
        this.relationState[key].search = event.target.value;
        this.relationState[key].page = 1;
        this.relationState[key].hasMore = true;
        if (this.relationState[key].timeout) clearTimeout(this.relationState[key].timeout);
        this.relationState[key].timeout = setTimeout(() => this.loadRelationData(field), 500);
    }

    onRelationScroll(field: Models.ToolField, event: any) {
        if (event.target.scrollHeight - event.target.scrollTop <= event.target.clientHeight + 20) {
            this.loadRelationData(field, true);
        }
    }

    selectRelationItem(field: Models.ToolField, item: any) {
        const key = field.property;
        this.dynamicValues[key] = item.id;
        this.relationState[key].selectedLabel = item.label;
        this.relationState[key].open = false;
    }

    toggleRelation(field: Models.ToolField) {
        const key = field.property;
        if (!this.relationState[key]) {
            this.relationState[key] = { options: [], page: 1, loading: false, open: false, search: '', hasMore: true };
            this.loadRelationData(field);
        }
        this.relationState[key].open = !this.relationState[key].open;
    }

    private loadSavedLabels() {
        if (!this.dynamicValues || !this.uiConfigSections) return;
        this.uiConfigSections.forEach(section => {
            section.fields?.forEach((field: any) => {
                if (field.type === 'relation' && this.dynamicValues[field.property]) {
                    const key = field.property;
                    if (!this.relationState[key]) this.relationState[key] = { options: [], open: false, selectedLabel: null };
                    if (this.relationState[key].selectedLabel) return;

                    this.relationState[key].selectedLabel = `Carregando...`;
                    this.control?.getRelationLabel?.(field.class, this.dynamicValues[key])
                        .then((res: any) => { this.relationState[key].selectedLabel = res.label; this.cdr.detectChanges(); });
                }
            });
        });
    }
    // #endregion

    // #region 5. IO e Validação
    public getExportData() {
        if (!this.validateProject()) return null; // Validação

        const fullGraph = this.graph.toJSON();
        const logicData = {
            nodes: fullGraph.cells.filter((c: any) => c.shape !== 'edge').map((n: any) => ({
                id: n.id, type: n.data?.type, label: n.data?.label,
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
            this.showSystemAlert('Sucesso', 'Projeto importado!', 'success');
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

            if (data.type === 'if') {
                const c = data.conditionData;
                if (!c || !c.propertyId || !c.operator) {
                    this.handleValidationError(node, 'Configure a regra do IF.');
                    return false;
                }
            } else {
                const schema = this.schemas.find(s => s.type === data.type);
                if (schema) {
                    let allFields: any[] = [];
                    if (schema.sections) schema.sections.forEach(s => allFields.push(...s.fields));
                    else if (schema.fields) allFields = schema.fields;

                    const config = data.config || {};
                    for (const field of allFields) {
                        if (field.required) {
                            const val = config[field.property];
                            if (val === undefined || val === null || val === '' || (Array.isArray(val) && val.length === 0)) {
                                this.handleValidationError(node, `Campo "${field.label}" obrigatório.`);
                                return false;
                            }
                        }
                    }
                }
            }
        }
        return true;
    }

    handleValidationError(node: any, message: string) {
        this.selectCell(node);
        this.graph.centerCell(node);
        this.showSystemAlert('Atenção', message, 'warning');
    }

    // --- Usando Utils para arquivos ---
    saveProjectFile() {
        FlowUtils.downloadJson(this.graph.toJSON());
    }

    triggerFileInput() { document.getElementById('fileInput')?.click(); }

    onFileSelected(event: any) {
        const file = event.target.files[0];
        if (!file) return;
        FlowUtils.readJsonFile(file)
            .then(json => this.importData(json))
            .catch(() => this.showSystemAlert('Erro', 'Erro ao ler arquivo.', 'warning'));
        event.target.value = '';
    }
    // #endregion

    // #region 6. Utilitários UI
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