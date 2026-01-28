# 📘 Documentação do Editor de Fluxo (Flow Editor)

Este projeto implementa um editor visual de fluxos altamente customizável utilizando **Angular** e a biblioteca gráfica **AntV X6**.

O sistema é composto por um componente reutilizável (`FlowEditorComponent`) e um componente pai (`AppComponent`) que fornece os dados e configurações.

---

## 📂 Estrutura dos Arquivos

### 1. `src/app/flow-editor.component.ts` (O Cérebro 🧠)
Este é o arquivo principal da lógica. Ele é um *Dumb Component*, ou seja, não conhece as regras de negócio externas, apenas desenha o que recebe.

#### **Responsabilidades:**
* **Inicialização (`initGraph`):** Configura o grid, zoom (mousewheel), pan e o roteador de conexões (Manhattan/Rounded).
* **Validação de Conexões (`validateConnection`):**
    * 🚫 Impede conexão Entrada → Entrada.
    * 🚫 Impede conexão Saída → Saída.
    * ✅ Permite apenas Saída → Entrada.
* **Criação de Nós (`addNode`):** Padroniza o tamanho dos nós (160x70px) e define se é um nó de Lógica (IF) ou Ação (Genérico).
* **Query Builder (`openModal`, `saveCondition`):** Gerencia a lógica do modal de condições (Propriedade → Operador → Valor) e persiste os dados dentro do nó (`data.conditionData`).

#### **🛠️ Guia de Manutenção:**
* **Para mudar regras de conexão:** Edite `validateConnection` dentro de `initGraph`.
* **Para alterar tamanho/cor dos nós:** Edite as variáveis `nodeWidth`, `nodeHeight` e os atributos `attrs` dentro de `addNode`.
* **Para adicionar operadores (ex: Regex):** Edite o objeto `operatorsByType`.

---

### 2. `src/app/flow-editor.component.html` (O Esqueleto 💀)
Define a estrutura visual do editor.

#### **Responsabilidades:**
* **Sidebar Dinâmica:** Itera sobre a lista de ferramentas recebida via `@Input() tools` para criar os botões.
* **Canvas:** A `div` onde o gráfico SVG é renderizado.
* **Modal Inteligente:** Utiliza `*ngIf` para exibir inputs dinâmicos (número, texto, data) baseados no tipo da propriedade selecionada.

#### **🛠️ Guia de Manutenção:**
* **Para reordenar a sidebar:** Altere a ordem dos elementos HTML.
* **Para adicionar novos campos no Modal:** Insira novos `.form-group` e vincule-os com `[(ngModel)]` no TypeScript.

---

### 3. `src/app/flow-editor.component.css` (O Estilo 👕)
Garante o layout responsivo e a estética "Clean".

#### **Responsabilidades:**
* **Layout:** Mantém a sidebar fixa e o gráfico ocupando o restante da tela (`flex: 1`).
* **Estilo do Modal:** Centralização, backdrop escuro e animações (`fadeIn`).
* **Prevenção de Seleção:** `user-select: none` na sidebar para melhorar a experiência de arrastar.

#### **🛠️ Guia de Manutenção:**
* **Ajustar largura da sidebar:** Altere a classe `.sidebar`.
* **Mudar cores dos botões:** Edite `.save-btn` ou `button`.

---

### 4. `src/app/app.component.ts` (O Controlador 💼)
Componente pai que consome o editor. É aqui que você define o que o sistema "sabe" fazer.

#### **Responsabilidades:**
* **Configuração de Ferramentas:** Define o array `myTools` (ex: Slack, Typeform, WhatsApp).
* **Configuração de Propriedades:** Define o array `myIfProperties` (ex: Status, Data, Email) que alimenta o modal do IF.

#### **🛠️ Guia de Manutenção:**
* **Adicionar nova integração (ex: WhatsApp):**
    Basta adicionar um objeto na lista `myTools`. Não é necessário mexer no editor!
    ```typescript
    { id: 'whatsapp', label: 'WhatsApp', icon: '📱' }
    ```
* **Adicionar nova variável para o IF:**
    Adicione na lista `myIfProperties`.

---

## 💡 Resumo das Regras de Negócio

### 1. Conexões
O sistema garante a integridade do fluxo através das portas:
* **in (Esquerda):** Só aceita conexões de entrada.
* **out / trueOut / falseOut (Direita/Baixo):** Só aceitam conexões de saída.

### 2. Visualização
* **Tamanho dos Nós:** Padronizado em **160px (L) x 70px (A)** para garantir que as linhas fiquem retas.
* **Cores:**
    * 🟨 **Lógica (IF):** Fundo amarelo claro, borda laranja.
    * ⬜ **Ação:** Fundo branco, borda cinza.

### 3. Persistência de Dados
Todos os dados de configuração (qual ferramenta é, qual a condição do IF) são salvos dentro da propriedade `data` de cada célula do X6.
* Para exportar o fluxo, basta chamar `this.graph.toJSON()`.
* Para importar, basta chamar `this.graph.fromJSON(dados)`.