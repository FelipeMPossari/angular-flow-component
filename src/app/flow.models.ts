// flow.models.ts

// --- DADOS BÁSICOS ---
export interface FlowTool {
    id: string;
    label: string;
    icon?: string;
}

export interface PropertyOption {
    id: string;
    label: string;
    type: string;
    originalType?: string; // Opcional para exibição visual
}

// --- FORMULÁRIO DINÂMICO ---
export interface ToolField {
    property: string; // Identificador principal
    name?: string;    // Legado
    label: string;
    type: 'text' | 'number' | 'select' | 'boolean' | 'textarea' | 'date' | 'relation';
    placeholder?: string;
    required?: boolean;
    options?: { label: string; value: any }[]; // Para selects
    class?: string;   // Para relation
    filter?: any;     // Para relation
}

export interface ToolSection {
    title: string;
    fields: ToolField[];
    expanded?: boolean;
}

export interface ToolSchema {
    type: string;
    fields?: ToolField[];    // Legado
    sections?: ToolSection[]; // Novo formato
}

// --- EXPORTAÇÃO E FLUXO ---
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

// --- INTERFACE DO MODAL ---
export interface ModalState {
    visible: boolean;
    type: string; // 'alert', 'confirm', 'warning', 'info'
    title: string;
    message: string;
    confirmLabel: string;
    pendingAction: (() => void) | null;
}