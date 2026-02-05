// flow-graph.config.ts
import { Shape } from '@antv/x6';

// Estilos padronizados para Labels
export const LABEL_STYLE = {
    fill: '#333',
    fontSize: 14,
    fontFamily: 'Segoe UI',
    fontWeight: 600,
    textAnchor: 'middle',
    refX: 0.5,
    refY: 0.5,
    textWrap: {
        width: 140,
        height: 60,
        ellipsis: true,
        breakWord: false
    }
};

// Definição das Portas (Bolinhas de conexão)
export const PORT_GROUPS = {
    in: {
        position: 'left',
        attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } }
    },
    out: {
        position: 'right',
        attrs: { circle: { r: 5, magnet: true, stroke: '#5F95FF', fill: '#fff', strokeWidth: 2 } }
    },
    trueOut: {
        position: 'right',
        attrs: { circle: { r: 5, magnet: true, stroke: '#52c41a', fill: '#f6ffed', strokeWidth: 2 } }
    },
    falseOut: {
        position: 'bottom',
        attrs: { circle: { r: 5, magnet: true, stroke: '#ff4d4f', fill: '#fff1f0', strokeWidth: 2 } }
    },
};

// Regra de Validação de Conexões (Lógica complexa isolada)
export const validateConnectionRule = ({ sourceView, targetView, sourceMagnet, targetMagnet, graph }: any) => {
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

    const outgoingEdges = graph.getOutgoingEdges(sourceView.cell);
    if (outgoingEdges) {
        const isDuplicate = outgoingEdges.some((edge: any) => {
            const target = edge.getTargetCell();
            if (target && target.id === targetNodeId) {
                return edge.getTargetPortId() === targetPortId && edge.getSourcePortId() === sourcePortId;
            }
            return false;
        });
        if (isDuplicate) return false;
    }

    return true;
};

// Configuração Geral do X6
export const getGraphOptions = (container: HTMLElement) => ({
    container: container,
    grid: { size: 20, visible: true, type: 'mesh', args: { color: '#e0e0e0' } },
    panning: true,
    mousewheel: {
        enabled: true,
        modifiers: ['ctrl', 'meta'] as ('ctrl' | 'meta')[],
    },
    connecting: {
        router: 'manhattan',
        connector: { name: 'rounded', args: { radius: 8 } },
        anchor: 'center',
        connectionPoint: 'boundary',
        snap: true,
        allowBlank: false,
        highlight: true,
        createEdge() {
            return new Shape.Edge({
                attrs: {
                    line: { stroke: '#5F95FF', strokeWidth: 2, targetMarker: { name: 'block', width: 12, height: 8 } }
                },
                zIndex: 0
            });
        },
        // A validação será injetada no componente pois precisa do contexto 'this' se usar variaveis locais,
        // mas como isolamos a lógica pura acima, podemos usar assim:
        validateConnection: validateConnectionRule
    },
});