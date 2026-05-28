import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  FileUp,
  ListChecks,
  Moon,
  PanelLeft,
  Pencil,
  Printer,
  Save,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Wand2,
  X,
} from 'lucide-react';
import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { saveAs } from 'file-saver';

const STORAGE_KEY = 'text-template-manager.templates.v1';
const THEME_KEY = 'text-template-manager.theme.v1';

const sampleText = `CONTRATO DE PRESTACAO DE SERVICOS

Pelo presente instrumento particular, de um lado [[cliente]], inscrito no documento [[documento_cliente]], com sede/endereco em [[endereco_cliente]], doravante denominado CONTRATANTE.

De outro lado [[fornecedor]], doravante denominado CONTRATADO, as partes resolvem celebrar o presente contrato.

1. OBJETO
O presente contrato tem por objeto a prestacao de servicos descritos em [[escopo]], pelo valor total de [[valor_projeto]].

2. PRAZO
Os servicos terao inicio em [[data_inicio]] e termino previsto em [[data_fim]].

3. PAGAMENTO
O pagamento sera realizado por [[cliente]] conforme as condicoes acordadas entre as partes.

E por estarem justas e contratadas, firmam o presente instrumento.`;

function uid() {
  return crypto.randomUUID?.() ?? String(Date.now());
}

function loadTemplates() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    if (Array.isArray(saved) && saved.length) {
      return saved;
    }
  } catch {
    return [];
  }

  return [
    {
      id: uid(),
      name: 'Contrato de prestacao de servicos',
      description: 'Modelo inicial com variaveis dinamicas.',
      content: sampleText,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

function extractVariables(content: string) {
  const matches = [...content.matchAll(/\[\[\s*([a-zA-Z0-9_.-]+)\s*\]\]/g)];
  const counts = new Map<string, number>();
  matches.forEach((match) => counts.set(match[1], (counts.get(match[1]) || 0) + 1));
  return [...counts.entries()].map(([name, count]) => ({ name, count }));
}

function fillTemplate(content: string, values: Record<string, string>) {
  return content.replace(/\[\[\s*([a-zA-Z0-9_.-]+)\s*\]\]/g, (_, key) => values[key] ?? '');
}

function serializeTemplates(nextTemplates: Template[]) {
  return nextTemplates.map((template) => template);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sanitizeVariableName(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/[{}]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^\w.-]/g, '_')
    .replace(/_+/g, '_');
}

function normalizeLegalPlaceholders(content: string) {
  let fieldIndex = 1;
  let dateIndex = 1;
  let moneyIndex = 1;
  let maskIndex = 1;
  const namedFields = new Map<string, string>();

  const nextFieldName = (prefix = 'campo') => `${prefix}_${fieldIndex++}`;
  const uniqueNamedField = (rawName: string) => {
    const baseName = sanitizeVariableName(rawName.toLowerCase()) || nextFieldName();
    if (!namedFields.has(rawName)) namedFields.set(rawName, baseName);
    return namedFields.get(rawName)!;
  };

  return content
    .replace(/\*\*\/\*\*\/\*\*\*\*/g, () => `[[data_${dateIndex++}]]`)
    .replace(/R\$\s*[\d*.,]+/g, (match) => {
      if (!match.includes('*')) return match;
      return `R$ [[valor_${moneyIndex++}]]`;
    })
    .replace(/\[([^\]]{1,80})\]/g, (_, rawName) => {
      const cleanName = rawName.trim();
      if (!cleanName || cleanName === '•') return `[[${nextFieldName()}]]`;
      return `[[${uniqueNamedField(cleanName)}]]`;
    })
    .replace(/\*{2,}(?=%|\s*meses|\s*parcelas)?/g, () => `[[mascara_${maskIndex++}]]`);
}

const DOCX_PART_PATTERN = /^(word\/(document|header\d*|footer\d*|footnotes|endnotes)\.xml)$/;

function normalizeDocxTemplate(zip: PizZip) {
  const partNames = Object.keys(zip.files).filter((name) => DOCX_PART_PATTERN.test(name));

  let dateIndex = 1;
  let moneyIndex = 1;
  let maskIndex = 1;
  let fieldIndex = 1;
  const namedFields = new Map<string, string>();

  const uniqueField = (rawName: string) => {
    const base = sanitizeVariableName(rawName.toLowerCase()) || `campo_${fieldIndex++}`;
    if (!namedFields.has(rawName)) namedFields.set(rawName, base);
    return namedFields.get(rawName)!;
  };

  const applyNormalizations = (text: string) =>
    text
      .replace(/\[([^\]<]{1,80})\]/g, (_, raw) => {
        const clean = raw.trim();
        if (!clean || clean === '•') return `[[campo_${fieldIndex++}]]`;
        return `[[${uniqueField(clean)}]]`;
      })
      .replace(/\*\*\/\*\*\/\*\*\*\*/g, () => `[[data_${dateIndex++}]]`)
      .replace(/R\$\s*[\d*.,]+/g, (m) => (m.includes('*') ? `R$ [[valor_${moneyIndex++}]]` : m))
      .replace(/\*{2,}/g, () => `[[mascara_${maskIndex++}]]`);

  partNames.forEach((partName) => {
    const xml = zip.file(partName)?.asText();
    if (!xml) return;

    const patched = xml.replace(/<w:p[ >][\s\S]*?<\/w:p>/g, (para) => {
      const parts: string[] = [];
      para.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (_, t) => {
        parts.push(t);
        return '';
      });

      const fullText = parts.join('');
      if (!fullText) return para;
      if (!/\[[^\]<]{0,80}\]|\*{2,}/.test(fullText)) return para;

      const normalized = applyNormalizations(fullText);
      if (normalized === fullText) return para;

      let first = true;
      return para.replace(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g, (match) => {
        if (first) {
          first = false;
          const tagBase = match.match(/^<w:t[^>]*/)?.[0] ?? '<w:t';
          const needsPreserve = normalized.startsWith(' ') || normalized.endsWith(' ');
          const openTag =
            needsPreserve && !tagBase.includes('xml:space')
              ? `${tagBase} xml:space="preserve">`
              : `${tagBase}>`;
          return `${openTag}${normalized}</w:t>`;
        }
        const tagBase = match.match(/^<w:t[^>]*/)?.[0] ?? '<w:t';
        return `${tagBase}></w:t>`;
      });
    });

    zip.file(partName, patched);
  });
}

function extractTextFromZip(zip: PizZip) {
  const partNames = Object.keys(zip.files).filter((name) => DOCX_PART_PATTERN.test(name));
  const NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const blocks: string[] = [];

  partNames.forEach((partName) => {
    const xml = zip.file(partName)?.asText();
    if (!xml) return;

    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const body = doc.getElementsByTagNameNS(NS, 'body')[0];
    if (!body) return;

    body.childNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const el = node as Element;
      if (el.localName === 'p') {
        const text = getParagraphText(el);
        if (text) blocks.push(text);
      }
      if (el.localName === 'tbl') {
        const rows = [...el.getElementsByTagNameNS(NS, 'tr')].map((row) =>
          [...row.getElementsByTagNameNS(NS, 'tc')]
            .map((cell) =>
              [...cell.getElementsByTagNameNS(NS, 'p')]
                .map((p) => getParagraphText(p))
                .filter(Boolean)
                .join(' '),
            )
            .join(' | '),
        );
        if (rows.length) blocks.push(rows.join('\n'));
      }
    });
  });

  return blocks.join('\n\n');
}

function getParagraphText(paragraph: Element) {
  const parts: string[] = [];

  const walk = (node: Node) => {
    if (!node) return;
    if (node.nodeType === Node.TEXT_NODE) {
      parts.push(node.textContent || '');
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;
    if (el.localName === 'tab') { parts.push('\t'); return; }
    if (el.localName === 'br' || el.localName === 'cr') { parts.push('\n'); return; }
    el.childNodes.forEach(walk);
  };

  walk(paragraph);
  return parts.join('').replace(/\s+/g, ' ').trim();
}

function validateDocxPlaceholders(file: File, extractedText: string) {
  const invalid: string[] = [];
  const pattern = /\[\[|\]\]/g;
  let balance = 0;
  let match;

  while ((match = pattern.exec(extractedText || ''))) {
    if (match[0] === '[[') { balance += 1; continue; }
    balance -= 1;
    if (balance < 0) {
      invalid.push('Fechamento ]] encontrado sem abertura [[ correspondente.');
      balance = 0;
    }
  }

  if (balance > 0) invalid.push('Existe ao menos uma variavel com [[ sem fechamento correspondente.');
  if (invalid.length) console.warn(`[DOCX] Possiveis variaveis invalidas em ${file.name}:`, invalid);
}

function highlightVariables(content: string) {
  const parts = content.split(/(\[\[\s*[a-zA-Z0-9_.-]+\s*\]\])/g);
  return parts.map((part, index) => {
    if (/^\[\[\s*[a-zA-Z0-9_.-]+\s*\]\]$/.test(part)) {
      return <mark className="variable-token" key={`${part}-${index}`}>{part}</mark>;
    }
    return <React.Fragment key={`${part}-${index}`}>{part}</React.Fragment>;
  });
}

interface ModalState {
  type: string;
  id?: string;
  templateName?: string;
  selected?: string;
  name?: string;
  disabled?: boolean;
  start?: number;
  end?: number;
  currentName?: string;
  nextName?: string;
  replacement?: string;
}

interface Template {
  id: string;
  name: string;
  description: string;
  content: string;
  originalBase64?: string;
  filledValues?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

function AppModal({
  modal,
  onClose,
  onConfirm,
  onChange,
}: {
  modal: ModalState | null;
  onClose: () => void;
  onConfirm: () => void;
  onChange: (m: ModalState) => void;
}) {
  if (!modal) return null;

  const titles: Record<string, string> = {
    deleteTemplate: 'Excluir template',
    transformVariable: 'Transformar em variavel',
    renameVariable: 'Renomear variavel',
    deleteVariable: 'Remover variavel',
  };

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-heading">
          <strong id="modal-title">{titles[modal.type]}</strong>
          <button className="icon-button" onClick={onClose} title="Fechar" aria-label="Fechar">
            <X size={16} />
          </button>
        </div>

        {modal.type === 'deleteTemplate' && (
          <>
            <p>Tem certeza que deseja excluir <strong>{modal.templateName}</strong>? Essa acao remove o modelo da lista local.</p>
            <div className="modal-actions">
              <button onClick={onClose}>Cancelar</button>
              <button className="danger-action" onClick={onConfirm}><Trash2 size={17} /> Excluir</button>
            </div>
          </>
        )}

        {modal.type === 'transformVariable' && (
          <>
            {modal.disabled ? (
              <>
                <p>Selecione uma palavra ou trecho do texto antes de transformar em variavel.</p>
                <div className="modal-actions">
                  <button className="confirm-action" onClick={onClose}>Entendi</button>
                </div>
              </>
            ) : (
              <>
                <p>O trecho selecionado sera substituido por uma variavel no formato padrao.</p>
                <blockquote>{modal.selected}</blockquote>
                <label className="modal-field">
                  <span>Nome da variavel</span>
                  <input
                    autoFocus
                    value={modal.name}
                    onChange={(e) => onChange({ ...modal, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
                  />
                </label>
                <div className="modal-actions">
                  <button onClick={onClose}>Cancelar</button>
                  <button className="confirm-action" onClick={onConfirm}><Check size={17} /> Aplicar</button>
                </div>
              </>
            )}
          </>
        )}

        {modal.type === 'renameVariable' && (
          <>
            <p>Todas as ocorrencias de <strong>{`[[${modal.currentName}]]`}</strong> serao atualizadas.</p>
            <label className="modal-field">
              <span>Novo nome</span>
              <input
                autoFocus
                value={modal.nextName}
                onChange={(e) => onChange({ ...modal, nextName: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
              />
            </label>
            <div className="modal-actions">
              <button onClick={onClose}>Cancelar</button>
              <button className="confirm-action" onClick={onConfirm}><Check size={17} /> Renomear</button>
            </div>
          </>
        )}

        {modal.type === 'deleteVariable' && (
          <>
            <p>Remova <strong>{`[[${modal.name}]]`}</strong> de todas as ocorrencias. Se deixar vazio, as marcacoes serao apagadas.</p>
            <label className="modal-field">
              <span>Substituir por</span>
              <input
                autoFocus
                value={modal.replacement}
                placeholder="Texto opcional"
                onChange={(e) => onChange({ ...modal, replacement: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') onConfirm(); }}
              />
            </label>
            <div className="modal-actions">
              <button onClick={onClose}>Cancelar</button>
              <button className="danger-action" onClick={onConfirm}><Trash2 size={17} /> Remover</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default function App() {
  const [templates, setTemplates] = useState<Template[]>(loadTemplates as () => Template[]);
  const [activeId, setActiveId] = useState<string | null>(() => (loadTemplates() as Template[])[0]?.id ?? null);
  const [mode, setMode] = useState('edit');
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [values, setValues] = useState<Record<string, string>>({});
  const [modal, setModal] = useState<ModalState | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeTemplate = templates.find((t) => t.id === activeId) ?? templates[0];
  const variables = useMemo(() => extractVariables(activeTemplate?.content || ''), [activeTemplate?.content]);
  const finalText = useMemo(() => fillTemplate(activeTemplate?.content || '', values), [activeTemplate?.content, values]);

  useEffect(() => { setValues(activeTemplate?.filledValues ?? {}); }, [activeTemplate?.id]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  function persist(nextTemplates: Template[]) {
    setTemplates(nextTemplates);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serializeTemplates(nextTemplates)));
  }

  function updateTemplate(patch: Partial<Template>) {
    const now = new Date().toISOString();
    persist(templates.map((t) => t.id === activeTemplate.id ? { ...t, ...patch, updatedAt: now } : t));
  }

  function createTemplate() {
    const newTemplate: Template = {
      id: uid(),
      name: 'Novo template',
      description: 'Sem descricao',
      content: 'Digite ou cole o texto do contrato aqui.\n\nUse variaveis como [[cliente]] e [[valor]].',
      filledValues: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persist([newTemplate, ...templates]);
    setActiveId(newTemplate.id);
    setMode('edit');
    setValues({});
  }

  async function importDocx(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const zip = new PizZip(arrayBuffer);
      normalizeDocxTemplate(zip);
      const rawText = extractTextFromZip(zip);
      validateDocxPlaceholders(file, rawText);

      const normalizedBuffer = zip.generate({ type: 'arraybuffer' });
      const bytes = new Uint8Array(normalizedBuffer);
      let binary = '';
      for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
      const originalBase64 = btoa(binary);

      const newTemplate: Template = {
        id: uid(),
        name: file.name.replace(/\.docx$/i, ''),
        description: 'Importado de DOCX com lacunas convertidas em variaveis.',
        content: rawText,
        originalBase64,
        filledValues: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      persist([newTemplate, ...templates]);
      setActiveId(newTemplate.id);
      setMode('edit');
      setValues({});
    } catch (error) {
      console.warn('Erro ao importar DOCX:', error);
      alert('Erro ao importar DOCX. Verifique se o arquivo e valido.');
    }
  }

  function convertCurrentTemplatePlaceholders() {
    updateTemplate({ content: normalizeLegalPlaceholders(activeTemplate.content) });
  }

  function deleteTemplate(id: string) {
    const template = templates.find((t) => t.id === id);
    if (!template) return;
    setModal({ type: 'deleteTemplate', id, templateName: template.name });
  }

  function confirmDeleteTemplate() {
    if (!modal || modal.type !== 'deleteTemplate') return;
    const next = templates.filter((t) => t.id !== modal.id);
    persist(next);
    setActiveId(next[0]?.id ?? null);
    setModal(null);
  }

  function transformSelection() {
    const textarea = editorRef.current;
    if (!textarea) return;
    const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd);
    if (!selected.trim()) {
      setModal({ type: 'transformVariable', selected: 'Nenhum trecho selecionado', name: '', disabled: true });
      return;
    }
    setModal({
      type: 'transformVariable',
      selected,
      start: textarea.selectionStart,
      end: textarea.selectionEnd,
      name: sanitizeVariableName(selected.toLowerCase()) || 'nova_variavel',
    });
  }

  function confirmTransformSelection() {
    if (!modal || modal.type !== 'transformVariable' || modal.disabled) { setModal(null); return; }
    const cleanName = sanitizeVariableName(modal.name!);
    if (!cleanName) return;
    const nextContent =
      activeTemplate.content.slice(0, modal.start) +
      `[[${cleanName}]]` +
      activeTemplate.content.slice(modal.end);
    updateTemplate({ content: nextContent });
    setModal(null);
    requestAnimationFrame(() => editorRef.current?.focus());
  }

  function renameVariable(name: string) {
    setModal({ type: 'renameVariable', currentName: name, nextName: name });
  }

  function confirmRenameVariable() {
    if (!modal || modal.type !== 'renameVariable') return;
    const nextName = sanitizeVariableName(modal.nextName!);
    if (!nextName) return;
    const regex = new RegExp(`\\[\\[\\s*${escapeRegExp(modal.currentName!)}\\s*\\]\\]`, 'g');
    updateTemplate({ content: activeTemplate.content.replace(regex, `[[${nextName}]]`) });
    setValues((current) => {
      if (!(modal.currentName! in current)) return current;
      const next = { ...current, [nextName]: current[modal.currentName!] };
      delete next[modal.currentName!];
      updateTemplate({ filledValues: next });
      return next;
    });
    setModal(null);
  }

  function deleteVariable(name: string) {
    setModal({ type: 'deleteVariable', name, replacement: values[name] ?? '' });
  }

  function confirmDeleteVariable() {
    if (!modal || modal.type !== 'deleteVariable') return;
    const regex = new RegExp(`\\[\\[\\s*${escapeRegExp(modal.name!)}\\s*\\]\\]`, 'g');
    updateTemplate({ content: activeTemplate.content.replace(regex, modal.replacement!) });
    setValues((current) => {
      const next = { ...current };
      delete next[modal.name!];
      updateTemplate({ filledValues: next });
      return next;
    });
    setModal(null);
  }

  function locateVariable(name: string) {
    setMode('edit');
    requestAnimationFrame(() => {
      const textarea = editorRef.current;
      if (!textarea) return;
      const needle = `[[${name}]]`;
      const index = textarea.value.indexOf(needle);
      if (index < 0) return;
      textarea.focus();
      textarea.setSelectionRange(index, index + needle.length);
      const lineHeight = 24;
      const before = textarea.value.slice(0, index).split('\n').length;
      textarea.scrollTop = Math.max(0, before * lineHeight - textarea.clientHeight / 2);
    });
  }

  function copyFinalText() { navigator.clipboard.writeText(finalText); }

  async function exportDocx() {
    if (!activeTemplate?.originalBase64) { alert('Nenhum DOCX original encontrado.'); return; }
    try {
      const binary = atob(activeTemplate.originalBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const zip = new PizZip(bytes.buffer);
      const doc = new Docxtemplater(zip, {
        paragraphLoop: true,
        linebreaks: true,
        delimiters: { start: '[[', end: ']]' },
        nullGetter: () => '',
      });
      doc.setData(values);
      doc.render();
      const blob = doc.getZip().generate({
        type: 'blob',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      saveAs(blob, `${activeTemplate.name || 'documento'}.docx`);
    } catch (error) {
      console.error(error);
      alert('Erro ao gerar DOCX');
    }
  }

  function exportPdf() {
    const printWindow = window.open('', '_blank')!;
    printWindow.document.write(`
      <html>
        <head>
          <title>${activeTemplate.name}</title>
          <style>body{font-family:Arial,sans-serif;line-height:1.65;padding:48px;color:#17202a}pre{white-space:pre-wrap;font-family:inherit}</style>
        </head>
        <body><pre>${finalText.replace(/[&<>]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]??c))}</pre></body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  if (!activeTemplate) {
    return (
      <main className="empty-state">
        <FileText size={48} />
        <h1>Nenhum template cadastrado</h1>
        <button className="primary-button" onClick={createTemplate}>
          <FilePlus2 size={18} /> Criar template
        </button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="template-list">
        <div className="brand">
          <FileText size={24} />
          <div>
            <strong>Templates</strong>
            <span>Contratos e documentos</span>
          </div>
        </div>

        <button className="primary-button full" onClick={createTemplate}>
          <FilePlus2 size={18} /> Novo template
        </button>
        <button className="secondary-button full" onClick={() => fileInputRef.current?.click()}>
          <FileUp size={18} /> Importar DOCX
        </button>
        <input ref={fileInputRef} className="hidden-file" type="file" accept=".docx" onChange={importDocx} />

        <div className="template-scroll">
          {templates.map((template) => (
            <article
              className={`template-item ${template.id === activeTemplate.id ? 'active' : ''}`}
              key={template.id}
              onClick={() => { setActiveId(template.id); setValues({}); }}
            >
              <div>
                <strong>{template.name}</strong>
                <span>{extractVariables(template.content).length} variaveis</span>
              </div>
              <button
                className="icon-button danger"
                title="Excluir template"
                onClick={(e) => { e.stopPropagation(); deleteTemplate(template.id); }}
              >
                <Trash2 size={16} />
              </button>
            </article>
          ))}
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="template-title">
            <input
              value={activeTemplate.name}
              onChange={(e) => updateTemplate({ name: e.target.value })}
              aria-label="Nome do template"
            />
            <span>Salvo localmente no navegador em JSON</span>
          </div>
          <div className="actions">
            <button
              className="theme-toggle"
              onClick={() => setTheme((c) => c === 'dark' ? 'light' : 'dark')}
              title={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
              aria-label={theme === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro'}
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <button className={mode === 'edit' ? 'active' : ''} onClick={() => setMode('edit')}>
              <Edit3 size={17} /> Editor
            </button>
            <button className={mode === 'fill' ? 'active' : ''} onClick={() => setMode('fill')}>
              <ListChecks size={17} /> Preencher
            </button>
            <button className={mode === 'preview' ? 'active' : ''} onClick={() => setMode('preview')}>
              <Eye size={17} /> Preview
            </button>
          </div>
        </header>

        <div className={`content-grid mode-${mode}`}>
          <section className="editor-pane">
            {mode === 'edit' && (
              <>
                <div className="editor-toolbar">
                  <button onClick={transformSelection}><Wand2 size={17} /> Transformar em variavel</button>
                  <button onClick={convertCurrentTemplatePlaceholders}><Sparkles size={17} /> Converter lacunas</button>
                  <button onClick={() => persist(templates)}><Save size={17} /> Salvar JSON</button>
                </div>
                <textarea
                  ref={editorRef}
                  className="text-editor"
                  value={activeTemplate.content}
                  onChange={(e) => updateTemplate({ content: e.target.value })}
                  spellCheck={false}
                />
              </>
            )}

            {mode === 'fill' && (
              <div className="fill-view">
                <div className="fill-form">
                  {variables.length === 0 ? (
                    <p className="muted">Este template ainda nao possui variaveis.</p>
                  ) : (
                    variables.map((variable) => (
                      <label key={variable.name}>
                        <span>
                          {variable.name}
                          <small>{variable.count} ocorrencia(s)</small>
                        </span>
                        <input
                          value={values[variable.name] ?? ''}
                          onChange={(e) => {
                            const next = { ...values, [variable.name]: e.target.value };
                            setValues(next);
                            updateTemplate({ filledValues: next });
                          }}
                          placeholder={`Preencha ${variable.name}`}
                        />
                      </label>
                    ))
                  )}
                </div>
                <div className="final-preview">
                  <pre>{finalText}</pre>
                </div>
              </div>
            )}

            {mode === 'preview' && (
              <div className="preview-view">
                <div className="editor-toolbar">
                  <button onClick={copyFinalText}><Copy size={17} /> Copiar texto</button>
                  <button onClick={exportDocx}><Download size={17} /> DOCX</button>
                  <button onClick={exportPdf}><Printer size={17} /> PDF</button>
                </div>
                <pre>{finalText}</pre>
              </div>
            )}
          </section>

          <aside className="variable-sidebar">
            <div className="sidebar-heading">
              <PanelLeft size={18} />
              <strong>Variaveis</strong>
            </div>
            <div className="variable-list">
              {variables.length === 0 ? (
                <div className="no-vars">
                  <Sparkles size={24} />
                  <span>Use {'[[nome_variavel]]'} no texto.</span>
                </div>
              ) : (
                variables.map((variable) => (
                  <div className="variable-row" key={variable.name}>
                    <button className="variable-locate" onClick={() => locateVariable(variable.name)}>
                      <Search size={15} />
                      <span>{variable.name}</span>
                      <small>{variable.count}x</small>
                    </button>
                    <button className="icon-button" title="Renomear variavel" onClick={() => renameVariable(variable.name)}>
                      <Pencil size={15} />
                    </button>
                    <button className="icon-button danger" title="Remover variavel" onClick={() => deleteVariable(variable.name)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>
            <div className="highlight-box">
              <strong>Mapa visual</strong>
              <pre>{highlightVariables(activeTemplate.content)}</pre>
            </div>
          </aside>
        </div>
      </section>

      <AppModal
        modal={modal}
        onClose={() => setModal(null)}
        onChange={setModal}
        onConfirm={() => {
          if (modal?.type === 'deleteTemplate') confirmDeleteTemplate();
          if (modal?.type === 'transformVariable') confirmTransformSelection();
          if (modal?.type === 'renameVariable') confirmRenameVariable();
          if (modal?.type === 'deleteVariable') confirmDeleteVariable();
        }}
      />
    </main>
  );
}
