# Gerenciador de Templates

Aplicativo para gerenciar templates de contratos e documentos com suporte a variaveis `[[nome_variavel]]` e importacao/exportacao de DOCX.

## Como rodar localmente

**Requisitos:** Node.js 18+ e npm (ou pnpm/yarn)

```bash
npm install
npm run dev
```

Acesse http://localhost:5173 no navegador.

## Funcionalidades

- Criar e editar templates de texto com variaveis `[[nome_variavel]]`
- Importar arquivos `.docx` — lacunas `[campo]`, `****`, `**/**/****` e `R$ ***` sao convertidas automaticamente em variaveis
- Preencher variaveis e visualizar o documento final
- Exportar como `.docx` com variaveis substituidas
- Exportar como PDF via impressao do navegador
- Modo claro/escuro
- Dados salvos localmente no navegador (localStorage)
