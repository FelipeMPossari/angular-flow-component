import { Component } from '@angular/core';
import { FlowEditorComponent, FlowTool, PropertyOption } from './flow-editor.component'; // Importe o componente e interfaces

@Component({
    selector: 'app-root',
    standalone: true,
    imports: [FlowEditorComponent], // Importe o componente criado
    template: `
    <app-flow-editor 
      [tools]="myTools" 
      [properties]="myIfProperties">
    </app-flow-editor>
  `
})
export class AppComponent {

    // 1. Defina as ferramentas disponíveis no seu sistema
    myTools: FlowTool[] = [
        { id: 'typeform', label: 'Typeform', icon: '📝' },
        { id: 'slack', label: 'Slack', icon: '💬' },
        { id: 'sheets', label: 'Sheets', icon: '📊' },
        { id: 'email', label: 'Send Email', icon: '📧' }, // Exemplo novo fácil de adicionar
        { id: 'api', label: 'HTTP Request', icon: '🌐' }
    ];

    // 2. Defina as propriedades disponíveis para o "IF"
    myIfProperties: PropertyOption[] = [
        { id: 'lead_score', label: 'Pontuação do Lead', type: 'number' },
        { id: 'email_addr', label: 'Email do Cliente', type: 'string' },
        { id: 'signup_date', label: 'Data de Cadastro', type: 'date' },
        { id: 'is_active', label: 'Usuário Ativo?', type: 'boolean' }
    ];

}