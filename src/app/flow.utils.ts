export class FlowUtils {

    /**
     * Converte tipos do C# (.NET) para tipos simples do Frontend
     */
    static normalizeType(cSharpType: string): string {
        if (!cSharpType) return 'string';
        const type = cSharpType.toLowerCase();

        if (['int', 'decimal', 'double', 'float', 'byte', 'long'].some(t => type.includes(t))) {
            return 'number';
        }
        if (type.includes('date') || type.includes('time')) {
            return 'date';
        }
        if (type.includes('bool')) {
            return 'boolean';
        }
        return 'string';
    }

    /**
     * Gera e baixa um arquivo JSON no navegador
     */
    static downloadJson(data: any, filenamePrefix: string = 'fluxo') {
        const jsonString = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);

        const a = document.createElement('a');
        a.href = url;
        a.download = `${filenamePrefix}-${Date.now()}.json`;
        a.click();

        window.URL.revokeObjectURL(url);
    }

    /**
     * Lê um arquivo JSON enviado por input file
     */
    static readJsonFile(file: File): Promise<any> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e: any) => {
                try {
                    const json = JSON.parse(e.target.result);
                    resolve(json);
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = (error) => reject(error);
            reader.readAsText(file);
        });
    }
}