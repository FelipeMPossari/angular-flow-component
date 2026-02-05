export const OPERATORS_BY_TYPE: any = {
    string: [
        { id: 'eq', label: 'Igual a' },
        { id: 'contains', label: 'Contém' },
        { id: 'ne', label: 'Diferente de' }
    ],
    number: [
        { id: 'eq', label: '=' },
        { id: 'gt', label: '>' },
        { id: 'lt', label: '<' },
        { id: 'gte', label: '>=' }
    ],
    date: [
        { id: 'eq', label: 'Em' },
        { id: 'before', label: 'Antes de' },
        { id: 'after', label: 'Depois de' }
    ],
    boolean: [
        { id: 'true', label: 'É Verdadeiro' },
        { id: 'false', label: 'É Falso' }
    ]
};