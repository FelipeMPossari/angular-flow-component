// flow.models.ts

// --- DADOS BÁSICOS (Barra lateral esquerda) ---
export interface FlowTool {
    id: string;
    label: string;
    icon?: string;
}

// --- IF / CONDIÇÕES ---
export interface PropertyOption {
    id: string;
    label: string;
    type: string;
    originalType?: string;
}

// --- EXPORTAÇÃO E FLUXO ---
export interface WorkflowNode {
    id: string;
    type: string;
    label?: string;     // Adicionei label explícito aqui
    config?: any;       // Um objeto genérico, já que o legado vai gerenciar o conteúdo
    next?: string;
    nextTrue?: string;
    nextFalse?: string;
}

export interface WorkflowDefinition {
    startNodeId: string | null;
    nodes: WorkflowNode[];
}

// --- INTERFACE DO MODAL DO SISTEMA (Alertas internos) ---
export interface ModalState {
    visible: boolean;
    type: string; // 'alert', 'confirm', 'warning', 'info'
    title: string;
    message: string;
    confirmLabel: string;
    pendingAction: (() => void) | null;
}