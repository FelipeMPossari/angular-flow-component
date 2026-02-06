import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FlowEditorComponent } from './flow-editor.component';
import { FlowTool, WorkflowDefinition } from './flow.models';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [CommonModule, FlowEditorComponent],
    template: `
    <div style="height: 100vh; width: 100vw; display: flex; flex-direction: column;">
      
      <div style="padding: 10px; background: #333; color: white; display: flex; gap: 10px; align-items: center;">
        <strong>Ambiente de Teste (Container)</strong>
        <button (click)="testarExportacao()">💾 Logar JSON no Console</button>
      </div>

      <div style="flex: 1; position: relative;">
        <app-flow-editor
          [tools]="tools"
          [control]="flowAPI"
          (saveGraph)="onSave($event)">
        </app-flow-editor>
      </div>

    </div>
  `
})
export class AppComponent {

    // 1. Ferramentas Disponíveis
    tools: FlowTool[] = [
        { id: 'enviar_email', label: 'Enviar E-mail', icon: '✉️' },
        { id: 'criar_tarefa', label: 'Criar Tarefa', icon: '✅' },
        { id: 'aprovacao', label: 'Aprovação Gestor', icon: 'd' },
        { id: 'api_request', label: 'Chamada API', icon: '🔌' }
    ];

    // REMOVIDO: properties (O legado gerencia isso agora)

    // 2. A PONTE (flowAPI)
    flowAPI: any = {
        onEditNode: (nodeId: string, type: string, currentConfig: any) => {
            console.log(`%c 📡 LEGADO RECEBEU CHAMADA DE EDIÇÃO:`, 'color: orange; font-weight: bold');
            console.log(`ID: ${nodeId} | Tipo: ${type}`);

            // Simula a abertura da modal do seu legado
            const novoLabel = prompt(`Simulando Modal do Legado para [${type}].\nDigite um novo nome:`, currentConfig.label || type);

            if (novoLabel !== null) {
                // Simula o retorno de dados da modal
                // Se for IF, o legado deve retornar { property: '...', operator: '...', value: '...' }
                const novosDados = {
                    ...currentConfig,
                    editadoEm: new Date().toISOString() // Apenas um exemplo
                };

                // Devolve pro Angular atualizar o visual
                if (this.flowAPI.updateNodeData) {
                    this.flowAPI.updateNodeData(nodeId, novosDados, novoLabel);
                }
            }
        },
        // Métodos placeholder que o componente vai preencher
        getExportData: () => { },
        importData: (json: any) => { },
        clearCanvas: () => { },
        updateNodeData: (id: string, config: any, label?: string) => { }
    };

    testarExportacao() {
        if (this.flowAPI.getExportData) {
            console.log('📦 JSON EXPORTADO:', this.flowAPI.getExportData());
        }
    }

    onSave(graph: WorkflowDefinition) {
        console.log('Evento saveGraph:', graph);
    }
}