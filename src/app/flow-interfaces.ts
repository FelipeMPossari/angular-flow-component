export interface FlowTool {
    id: string;      // ex: 'slack', 'discord'
    label: string;   // ex: 'Slack', 'Discord'
    icon?: string;   // URL de ícone (opcional) ou emoji
    color?: string;  // Cor da borda (opcional)
}

export interface PropertyOption {
    id: string;
    label: string;
    type: 'string' | 'number' | 'date' | 'boolean';
}