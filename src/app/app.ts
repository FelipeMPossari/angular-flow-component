import { Component } from '@angular/core';
import { FlowEditorComponent, FlowTool, PropertyOption, ToolSchema } from './flow-editor.component';

@Component({
    selector: 'app-root',
    standalone: true, // Se seu projeto for full standalone
    // Se não for standalone, remova essa linha e o imports abaixo, e deixe o AppModule gerenciar
    imports: [FlowEditorComponent],
    template: `
    <app-flow-editor 
      [tools]="mockTools" 
      [properties]="mockProperties"
      [schemas]="mockSchemas" 
      (saveGraph)="onSave($event)">
    </app-flow-editor>
  `,
    styles: []
})
export class AppComponent {

    // 1. Ferramentas de Teste
    mockTools: FlowTool[] = [
        { id: 'slack', label: 'Slack', icon: '💬' },
        { id: 'email', label: 'E-mail', icon: '📧' },
        { id: 'api', label: 'HTTP Request', icon: '🌐' }
    ];

    // 2. Propriedades pro IF
    mockProperties: PropertyOption[] = [
        { id: 'valor_total', label: 'Valor do Pedido', type: 'number' },
        { id: 'vip', label: 'Cliente VIP?', type: 'boolean' },
        { id: 'cidade', label: 'Cidade', type: 'string' }
    ];

    // 3. SCHEMAS (O Teste de Fogo do Menu Lateral)
    mockSchemas: ToolSchema[] = [
        {
            type: 'slack',
            fields: [
                { name: 'channel', label: 'Canal (#)', type: 'text', placeholder: '#geral', required: true },
                { name: 'msg', label: 'Mensagem', type: 'textarea' }
            ]
        },
        {
            type: 'email',
            fields: [
                { name: 'destinatario', label: 'Para:', type: 'text' },
                { name: 'assunto', label: 'Assunto', type: 'text' },
                {
                    name: 'prioridade', label: 'Prioridade', type: 'select',
                    options: [{ label: 'Alta', value: 1 }, { label: 'Baixa', value: 0 }]
                }
            ]
        }
    ];

    onSave(json: any) {
        console.log('📦 JSON PRONTO PARA O BACKEND:', json);
        alert('JSON gerado! Olhe o console (F12).');
    }
}