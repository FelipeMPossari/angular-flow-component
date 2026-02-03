import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { FlowEditorComponent } from './app/flow-editor.component';

// Configuração básica da aplicação (providers, rotas se tivesse, etc)
const appConfig: ApplicationConfig = {
    providers: [
        provideZoneChangeDetection({ eventCoalescing: true })
    ]
};

(async () => {
    // 1. Cria a instância da aplicação (sem renderizar na tela ainda)
    const app = await createApplication(appConfig);

    // 2. Transforma o componente Angular em Web Component
    const el = createCustomElement(FlowEditorComponent, { injector: app.injector });

    // 3. Define o nome da tag HTML customizada
    // Vamos manter o nome que usamos na diretiva do AngularJS: 'flow-editor-element'
    if (!customElements.get('flow-editor-element')) {
        customElements.define('flow-editor-element', el);
    }
})();