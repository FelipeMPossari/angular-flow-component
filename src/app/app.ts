import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowEditorComponent } from './flow-editor.component';
import { FlowTool, PropertyOption, WorkflowDefinition } from './flow.models';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, FlowEditorComponent], // Importa o componente do editor
    template: `
    <div style="height: 100vh; width: 100vw; display: flex; flex-direction: column;">
      
      <div style="padding: 10px; background: #333; color: white; display: flex; gap: 10px; align-items: center;">
        <strong>Ambiente de Teste (Container)</strong>
        <button (click)="testarExportacao()">💾 Logar JSON no Console</button>
      </div>

      <div style="flex: 1; position: relative;">
        <app-flow-editor
          [tools]="tools"
          [properties]="properties"
          [control]="flowAPI"
          (saveGraph)="onSave($event)">
        </app-flow-editor>
      </div>

    </div>
  `
})
export class App {

    // 1. Ferramentas Disponíveis (Ações)
    tools: FlowTool[] = [
        { id: 'enviar_email', label: 'Enviar E-mail', icon: '✉️' },
        { id: 'criar_tarefa', label: 'Criar Tarefa', icon: '✅' },
        { id: 'aprovacao', label: 'Aprovação Gestor', icon: 'd' },
        { id: 'api_request', label: 'Chamada API', icon: '🔌' }
    ];

    // 2. Propriedades para o IF (Variáveis do processo)
    properties: PropertyOption[] = [
        { id: 'valor_total', label: 'Valor do Pedido', type: 'number' },
        { id: 'solicitante_cargo', label: 'Cargo do Solicitante', type: 'string' },
        { id: 'data_criacao', label: 'Data de Criação', type: 'date' },
        { id: 'aprovado_rh', label: 'Aprovado pelo RH?', type: 'boolean' }
    ];

    // 3. A PONTE (flowAPI)
    // Esse objeto simula o seu 'vm.flowAPI' do AngularJS
    flowAPI: any = {

        /**
         * MÉTODO QUE O EDITOR CHAMA QUANDO DÃO DOUBLE-CLICK NUMA AÇÃO
         * Aqui o seu sistema Legado abre a modal.
         */
        onEditNode: (nodeId: string, type: string, currentConfig: any) => {

            console.log(`%c 📡 LEGADO RECEBEU CHAMADA DE EDIÇÃO:`, 'color: orange; font-weight: bold');
            console.log(`ID: ${nodeId} | Tipo: ${type}`);
            console.log('Dados Atuais:', currentConfig);

            // --- SIMULAÇÃO DA MODAL ABRINDO E SALVANDO ---
            // Como não temos modal aqui, vamos usar um prompt simples para testar
            // No seu sistema real, isso seria MinhaModalService.abrir(...)

            const novoLabel = prompt(`Simulando Modal do Legado para [${type}].\nDigite um novo nome para o passo:`, currentConfig.label || type);

            if (novoLabel !== null) {
                // Usuário clicou em "OK" na "Modal"

                const novosDados = {
                    ...currentConfig,
                    editadoEm: new Date().toISOString(),
                    dadoExtra: 'Isso veio do Legado'
                };

                console.log(`%c ✅ LEGADO SALVANDO NO EDITOR...`, 'color: green; font-weight: bold');

                // Chama o método que o Editor injetou dentro deste objeto
                if (this.flowAPI.updateNodeData) {
                    this.flowAPI.updateNodeData(nodeId, novosDados, novoLabel);
                } else {
                    console.error('Erro: updateNodeData não foi injetado pelo componente!');
                }
            } else {
                console.log('Edição cancelada pelo usuário.');
            }
        },

        // Estes métodos serão sobrescritos (injetados) pelo FlowEditorComponent
        // quando ele carregar (ngOnChanges). Deixamos vazios por enquanto.
        getExportData: () => { },
        importData: (json: any) => { },
        clearCanvas: () => { },
        updateNodeData: (id: string, config: any, label?: string) => { }
    };

    // 4. Teste de Exportação
    testarExportacao() {
        if (this.flowAPI.getExportData) {
            const data = this.flowAPI.getExportData();
            console.log('📦 JSON EXPORTADO:', data);
            alert('JSON exportado no Console (F12)');
        } else {
            alert('Editor ainda não carregou a API.');
        }
    }

    onSave(graph: WorkflowDefinition) {
        console.log('Evento saveGraph disparado:', graph);
    }
}