import { Component } from '@angular/core';
import { FlowEditorComponent, FlowTool, PropertyOption, ToolSchema } from './flow-editor.component';

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [FlowEditorComponent],
    template: `
    <app-flow-editor 
      [tools]="myTools" 
      [properties]="myIfProperties"
      [schemas]="myToolSchemas" 
      (saveGraph)="handleSave($event)">
    </app-flow-editor>
  `
})
export class AppComponent {

    // 1. Ferramentas (Barra Lateral)
    myTools: FlowTool[] = [
        { id: 'slack', label: 'Slack', icon: '💬' },
        { id: 'email', label: 'Send Email', icon: '📧' },
        { id: 'api', label: 'HTTP Request', icon: '🌐' }
    ];

    // 2. Propriedades (Para o IF)
    myIfProperties: PropertyOption[] = [
        { id: 'score', label: 'Pontuação', type: 'number' }
    ];

    // 3. ESQUEMAS DINÂMICOS (O Segredo!)
    // Aqui você define quais campos aparecem para cada ferramenta
    myToolSchemas: ToolSchema[] = [
        {
            type: 'slack',
            fields: [
                { name: 'channel', label: 'Canal de Envio', type: 'text', placeholder: '#geral', required: true },
                { name: 'message', label: 'Mensagem', type: 'textarea', placeholder: 'Digite sua mensagem...' },
                { name: 'is_bot', label: 'Enviar como Bot?', type: 'boolean' }
            ]
        },
        {
            type: 'email',
            fields: [
                { name: 'to', label: 'Destinatário', type: 'text', placeholder: 'cliente@email.com' },
                { name: 'subject', label: 'Assunto', type: 'text', required: true },
                { name: 'body', label: 'Corpo do Email', type: 'textarea' },
                {
                    name: 'priority', label: 'Prioridade', type: 'select',
                    options: [
                        { label: 'Baixa', value: 'low' },
                        { label: 'Alta', value: 'high' }
                    ]
                }
            ]
        },
        {
            type: 'api',
            fields: [
                { name: 'url', label: 'URL da API', type: 'text', placeholder: 'https://api.exemplo.com' },
                {
                    name: 'method', label: 'Método HTTP', type: 'select',
                    options: [{ label: 'GET', value: 'GET' }, { label: 'POST', value: 'POST' }]
                },
                { name: 'headers', label: 'Headers (JSON)', type: 'textarea' }
            ]
        }
    ];

    handleSave(json: any) {
        console.log('JSON Final:', json);
    }
}