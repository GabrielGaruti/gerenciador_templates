#  Gerenciador de Templates

Aplicativo web para criação, gerenciamento e preenchimento de templates de contratos e documentos `.docx`. Permite definir variáveis em documentos Word, armazená-los como templates e exportar cópias preenchidas com os dados informados.

---

##  Funcionalidades

- **Criar templates manualmente** — escreva o texto do contrato diretamente no editor com variáveis no formato `[[nome_variavel]]`
- **Importar `.docx`** — faz upload de documentos Word existentes e converte automaticamente lacunas nos formatos abaixo em variáveis:
  - `[Campo]` → `[[campo]]`
  - `****` → `[[mascara_1]]`
  - `**/**/****` → `[[data_1]]`
  - `R$ ***,**` → `R$ [[valor_1]]`
  - Campos SDT nativos do Word (os com `*****` coloridos) → `[[nome_do_campo]]`
- **Transformar seleção em variável** — selecione um trecho no editor e converta-o em `[[variavel]]` com um clique
- **Renomear e remover variáveis** — atualiza todas as ocorrências no documento de uma vez
- **Localizar variável no texto** — destaca e rola até a variável no editor
- **Formulário de preenchimento** — gera campos dinamicamente para cada variável detectada, com contagem de ocorrências
- **Preview em tempo real** — visualize o documento final com as variáveis substituídas
- **Exportar `.docx`** — substitui as variáveis e baixa o arquivo Word com a formatação original preservada
- **Exportar PDF** — abre janela de impressão do navegador com o texto final
- **Copiar texto** — copia o conteúdo preenchido para a área de transferência
- **Modo claro/escuro** — alternável pelo botão na barra superior
- **Persistência local** — templates e valores salvos automaticamente no `localStorage` do navegador

---

##  Tecnologias

| Tecnologia | Versão | Uso |
|---|---|---|
| React | 19 | Interface do usuário |
| TypeScript | 5.7 | Tipagem estática |
| Vite | 6 | Bundler e dev server |
| [Docxtemplater](https://docxtemplater.com/) | 3.58 | Substituição de variáveis no `.docx` |
| [PizZip](https://github.com/open-xml-templating/pizzip) | 3.2 | Leitura e escrita do ZIP interno do `.docx` |
| [FileSaver.js](https://github.com/eligrey/FileSaver.js/) | 2 | Download do arquivo gerado |
| [Lucide React](https://lucide.dev/) | 0.475 | Ícones |
| DOMParser / XMLSerializer | nativo | Normalização do XML do Word |

---

##  Como rodar localmente

**Requisitos:** Node.js 18+ e npm (ou pnpm/yarn)

```bash
# Instalar dependências
npm install

# Rodar em desenvolvimento
npm run dev
```

Acesse [http://localhost:5173](http://localhost:5173) no navegador.

```bash
# Build para produção
npm run build

# Preview do build
npm run preview
```

---

## 📐 Como usar

### 1. Criar um template do zero

Clique em **Novo template**, escreva o texto no editor e use `[[nome_variavel]]` para marcar os campos dinâmicos.
