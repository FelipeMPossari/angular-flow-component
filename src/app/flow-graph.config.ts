import { Shape } from '@antv/x6';

export const LABEL_STYLE = {
    fill: '#333',
    fontSize: 12,
    fontFamily: 'Segoe UI',
    fontWeight: 600,
    textAnchor: 'middle',
    refX: 0.5,
    refY: 0.5,
    textWrap: {
        width: 150,
        height: 60,
        ellipsis: true,
        breakWord: false
    }
};

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

export const validateConnectionRule = ({ edge, sourceView, targetView, sourceMagnet, targetMagnet, graph }: any) => {
    if (!sourceMagnet || !targetMagnet || !sourceView || !targetView) return false;

    const sourceGroup = sourceMagnet.getAttribute('port-group');
    const targetGroup = targetMagnet.getAttribute('port-group');

    // 1. Sentido Obrigatório (Saída para Entrada)
    if (sourceGroup === 'in') return false;
    if (targetGroup !== 'in') return false;

    const sourceNode = sourceView.cell;
    const targetNode = targetView.cell;
    const sourceType = sourceNode.getData()?.type;
    const targetType = targetNode.getData()?.type;
    const sourcePortId = sourceMagnet.getAttribute('port');

    // 2. Bloqueio dinâmico (A porta foi ocultada visualmente via evento)
    if (sourceNode.getPortProp(sourcePortId, 'disabled')) return false;

    // 3. Ações NUNCA podem ter saída (elas são folhas da árvore)
    // Liberamos o 'start' caso ele seja lido aqui
    if (sourceType !== 'if' && sourceType !== 'and' && sourceType !== 'or' && sourceType !== 'start') return false;

    // 4. Condição não liga em Condição (Força o uso de AND/OR para encadear)
    if (sourceType === 'if' && targetType === 'if') return false;

    // 5. PORTAS LÓGICAS NÃO LIGAM EM CONDIÇÕES (Evita paradoxos e curto-circuitos na query)
    if ((sourceType === 'and' || sourceType === 'or') && targetType === 'if') return false;

    // 6. Condição só liga em AND/OR pela porta TRUE
    if (sourceType === 'if' && (targetType === 'and' || targetType === 'or'))
        if (sourcePortId === 'falseOut') return false;

    // 7. ENTRADA ÚNICA PARA AÇÕES (Forçar o uso do OR)
    if (targetType !== 'if' && targetType !== 'and' && targetType !== 'or') {
        const incomingEdges = graph.getIncomingEdges(targetNode) || [];
        const actionAlreadyHasInput = incomingEdges.some((e: any) => e.id !== edge.id);
        if (actionAlreadyHasInput) return false;
    }

    // 8. PREVENÇÃO DE LOOP INFINITO (Grafo Acíclico)
    const predecessors = graph.getPredecessors(sourceNode) || [];
    const isLoop = predecessors.some((p: any) => p.id === targetNode.id);
    if (isLoop) return false;

    return true;
};

export const getGraphOptions = (container: HTMLElement) => ({
    container: container,
    grid: { size: 20, visible: true, type: 'mesh', args: { color: '#e0e0e0' } },
    panning: true,
    mousewheel: {
        enabled: true,
        modifiers: ['ctrl', 'meta'] as ('ctrl' | 'meta')[],
    },
    interacting: true, // Removido o bloqueio do nó start
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
        validateConnection: validateConnectionRule
    },
});