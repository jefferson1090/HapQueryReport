import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer, BubbleMenu } from '@tiptap/react';
import TableOfContents from './TableOfContents';
import { Extension, Mark, InputRule, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import BubbleMenuExtension from '@tiptap/extension-bubble-menu';
import Placeholder from '@tiptap/extension-placeholder';
import { Page } from './extensions/Page';
import { Pagination } from './extensions/Pagination';
import Document from '@tiptap/extension-document';
import { History } from '@tiptap/extension-history'; // Explicit History
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Highlight } from '@tiptap/extension-highlight';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import FontFamily from '@tiptap/extension-font-family';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { common, createLowlight } from 'lowlight';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
    List, ListOrdered, Quote, Image as ImageIcon, Table as TableIcon,
    AlignLeft, AlignCenter, AlignRight, AlignJustify, CheckSquare, Save, Sparkles, Highlighter,
    Type, Palette, Minus, Plus, Maximize2, Copy, Check, ChevronDown, Download, Printer, FileText as FileIcon, Scissors, PenLine
} from 'lucide-react';
import { saveAs } from 'file-saver';
import HTMLtoDOCX from 'html-to-docx';

// --- 1. SETUP SYNTAX HIGHLIGHTING ---
const lowlight = createLowlight(common);

// --- 2. CUSTOM FONT SIZE EXTENSION ---
const FontSize = Extension.create({
    name: 'fontSize',
    addOptions() {
        return {
            types: ['textStyle'],
        };
    },
    addGlobalAttributes() {
        return [
            {
                types: this.options.types,
                attributes: {
                    fontSize: {
                        default: null,
                        parseHTML: element => element.style.fontSize ? element.style.fontSize.replace(/px/g, '') : null,
                        renderHTML: attributes => {
                            if (!attributes.fontSize) {
                                return {};
                            }
                            // Ensure we don't double-add px if it's already there (defensive)
                            const size = String(attributes.fontSize).replace(/px/g, '');
                            return {
                                style: `font-size: ${size}px`,
                            };
                        },
                    },
                },
            },
        ];
    },
    addCommands() {
        return {
            setFontSize: fontSize => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize })
                    .run();
            },
            unsetFontSize: () => ({ chain }) => {
                return chain()
                    .setMark('textStyle', { fontSize: null })
                    .run();
            },
        };
    },
});

// --- 3. CUSTOM RESIZABLE IMAGE COMPONENT --- (Moved below)
// --- 2.1 WIKI LINK EXTENSION ---
const WikiLink = Mark.create({
    name: 'wikiLink',
    priority: 1000,
    keepOnSplit: false,
    addAttributes() {
        return {
            page: {
                default: null,
                parseHTML: element => element.getAttribute('data-page'),
                renderHTML: attributes => ({
                    'data-page': attributes.page,
                    class: 'wiki-link text-blue-600 underline cursor-pointer hover:text-blue-800 font-medium',
                    title: `Ir para: ${attributes.page}`
                }),
            },
        };
    },
    parseHTML() {
        return [
            {
                tag: 'span[data-page]',
            },
        ];
    },
    renderHTML({ HTMLAttributes }) {
        return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
    },
    addInputRules() {
        return [
            new InputRule({
                find: /\[\[([^\]]+)\]\]$/,
                handler: ({ state, range, match }) => {
                    const { tr } = state;
                    const start = range.from;
                    const end = range.to;
                    const pageName = match[1];

                    if (pageName) {
                        tr.replaceWith(start, end, state.schema.text(pageName));
                        tr.addMark(start, start + pageName.length, state.schema.marks.wikiLink.create({ page: pageName }));
                    }
                },
            }),
        ];
    },
});

// --- 3. CUSTOM RESIZABLE IMAGE COMPONENT ---
// --- 3. CUSTOM RESIZABLE IMAGE COMPONENT ---
// --- 3. CUSTOM RESIZABLE IMAGE COMPONENT ---
// --- 3. CUSTOM RESIZABLE IMAGE COMPONENT ---
const ResizableImageComponent = ({ node, updateAttributes, selected }) => {
    // SELF-CONTAINED ALIGNMENT LOGIC
    // We ignore Tiptap's paragraph alignment to ensure robustness.
    const align = node.attrs.textAlign || 'left';

    // Compute margins based on alignment
    let wrapperStyle = { display: 'flex', width: '100%' };
    if (align === 'center') wrapperStyle.justifyContent = 'center';
    else if (align === 'right') wrapperStyle.justifyContent = 'flex-end';
    else wrapperStyle.justifyContent = 'flex-start';

    return (
        <NodeViewWrapper className="image-resizer my-2" style={wrapperStyle}>
            <div className={`relative inline-block ${selected ? 'ring-2 ring-blue-500' : ''}`}>
                <img
                    src={node.attrs.src}
                    alt={node.attrs.alt}
                    draggable="true"
                    data-drag-handle
                    style={{
                        width: node.attrs.width ? `${node.attrs.width}px` : 'auto',
                        maxWidth: '100%',
                        display: 'block' // Ensure it behaves like a block for resizing
                    }}
                    className="rounded-lg shadow-sm bg-white"
                />

                {/* Resize Handle (Bottom Right) */}
                <div
                    className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 rounded-full cursor-se-resize opacity-0 group-hover:opacity-100 transition-opacity z-10 border-2 border-white"
                    onMouseDown={(e) => {
                        e.preventDefault();
                        const startX = e.clientX;
                        const startWidth = node.attrs.width || e.target.parentElement.querySelector('img').offsetWidth;

                        const onMouseMove = (moveEvent) => {
                            const currentX = moveEvent.clientX;
                            const diffX = currentX - startX;
                            const newWidth = Math.max(50, startWidth + diffX);
                            updateAttributes({ width: newWidth });
                        };

                        const onMouseUp = () => {
                            document.removeEventListener('mousemove', onMouseMove);
                            document.removeEventListener('mouseup', onMouseUp);
                        };

                        document.addEventListener('mousemove', onMouseMove);
                        document.addEventListener('mouseup', onMouseUp);
                    }}
                />
            </div>
        </NodeViewWrapper>
    );
};

// --- 4. WIKI LINK EXTENSION --- (Moved previously)
// --- 5. TEMPLATES --- (Moved previously)

const TOC_WIDTH = 'w-64';

const ResizableImage = Image.extend({
    addAttributes() {
        return {
            ...this.parent?.(),
            width: {
                default: null,
                renderHTML: attributes => {
                    if (!attributes.width) return {};
                    return { width: attributes.width };
                }
            },
            textAlign: {
                default: 'left',
                renderHTML: attributes => {
                    if (!attributes.textAlign) return {};
                    return { 'data-text-align': attributes.textAlign };
                },
                parseHTML: element => element.getAttribute('data-text-align'),
            }
        };
    },
    addNodeView() {
        return ReactNodeViewRenderer(ResizableImageComponent);
    },
});

// --- 5. CUSTOM CODE BLOCK COMPONENT ---
const CodeBlockComponent = ({ node, updateAttributes, extension }) => {
    const [copied, setCopied] = useState(false);

    // Supported languages in 'lowlight' common set
    const languages = extension.options.lowlight.listLanguages();

    const handleCopy = () => {
        const code = node.textContent;
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <NodeViewWrapper className="code-block-wrapper my-4 rounded-md overflow-hidden border border-gray-700 shadow-md bg-[#282c34] text-gray-300">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-[#21252b] border-b border-gray-700 text-xs select-none">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-red-400 opacity-80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-yellow-400 opacity-80" />
                        <div className="w-2.5 h-2.5 rounded-full bg-green-400 opacity-80" />
                    </div>
                    <div className="relative group ml-2">
                        <select
                            contentEditable={false}
                            value={node.attrs.language || 'auto'}
                            onChange={(e) => updateAttributes({ language: e.target.value })}
                            className="bg-[#21252b] text-gray-300 hover:text-white cursor-pointer appearance-none pr-4 outline-none font-mono text-xs border border-gray-600 rounded px-1 py-0.5 focus:border-blue-500"
                        >
                            <option value="auto" className="bg-[#21252b] text-white">auto</option>
                            {languages.map((lang, index) => (
                                <option key={index} value={lang} className="bg-[#21252b] text-white">{lang}</option>
                            ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-1 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
                    </div>
                </div>

                <button
                    onClick={handleCopy}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded transition-colors ${copied ? 'text-green-400' : 'text-gray-400 hover:text-white hover:bg-gray-700'}`}
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>

                {/* Run Button (Only for SQL) */}
                {node.attrs.language === 'sql' && (
                    <button
                        onClick={() => {
                            const sql = node.textContent;
                            if (!sql.trim()) return;
                            window.dispatchEvent(new CustomEvent('hap-run-sql', { detail: { query: sql } }));
                        }}
                        contentEditable={false}
                        className="flex items-center gap-1 bg-green-600 hover:bg-green-700 text-white text-xs px-2 py-0.5 rounded shadow-sm transition-colors ml-2"
                        title="Executar SQL"
                    >
                        <Sparkles size={10} />
                        Run
                    </button>
                )}
            </div>

            {/* Code Content */}
            <pre className="m-0 p-0 bg-[#282c34]">
                <NodeViewContent as="code" className={`language-${node.attrs.language || 'javascript'} block p-4 outline-none font-mono text-sm leading-relaxed`} />
            </pre>
        </NodeViewWrapper>
    );
};


const MenuBar = ({ editor, onSave, isSaving, theme, onAiRequest }) => {
    if (!editor) return null;

    const fileInputRef = useRef(null);

    const handleImageUpload = async (file) => {
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch('http://localhost:3001/api/upload/attachment', { method: 'POST', body: formData });
            const data = await res.json();
            if (data.url) {
                editor.chain().focus().setImage({ src: `http://localhost:3001${data.url}` }).run();
            }
        } catch (e) {
            console.error(e);
            alert("Falha no upload da imagem");
        }
    };

    const onImageClick = () => fileInputRef.current?.click();

    const handleAiClick = () => {
        const selection = editor.state.selection;
        const text = editor.state.doc.textBetween(selection.from, selection.to, ' ');
        onAiRequest(text);
    };

    // Reactivity: Force re-render on selection updates
    const [, forceUpdate] = useState();
    useEffect(() => {
        if (!editor) return;
        const handleUpdate = () => forceUpdate({});
        editor.on('transaction', handleUpdate);
        editor.on('selectionUpdate', handleUpdate);
        return () => {
            editor.off('transaction', handleUpdate);
            editor.off('selectionUpdate', handleUpdate);
        };
    }, [editor]);

    // RADICAL FIX: Snap-to-Grid Font Size Logic
    const FONT_SIZES = [8, 10, 12, 14, 16, 18, 20, 24, 30, 36, 48, 60, 72];

    const getSafeFontSize = () => {
        const sizeAttr = editor.getAttributes('textStyle')?.fontSize;
        if (!sizeAttr) return 16;

        // Handle "16px", "16", or mixed array
        let rawValue = Array.isArray(sizeAttr) ? sizeAttr[0] : sizeAttr;

        // Remove 'px' and parse
        const size = parseInt(String(rawValue).replace(/px/g, ''));

        // Fallback to 16 if NaN
        return isNaN(size) ? 16 : size;
    };

    const currentFontSize = getSafeFontSize();

    // Helper to snap to nearest grid value
    const updateFontSize = (direction) => {
        const current = getSafeFontSize();
        // Find closest index in FONT_SIZES
        const closestIndex = FONT_SIZES.reduce((prev, curr, index) => {
            return Math.abs(curr - current) < Math.abs(FONT_SIZES[prev] - current) ? index : prev;
        }, 0);

        let newIndex = closestIndex + direction;
        // Clamp index
        newIndex = Math.max(0, Math.min(newIndex, FONT_SIZES.length - 1));

        const newSize = FONT_SIZES[newIndex];
        editor.chain().focus().setFontSize(newSize).run();
    };

    const setFontSize = (size) => editor.chain().focus().setFontSize(size).run();


    // Alignment Helper
    const setAlign = (align) => {
        if (editor.isActive('image') || editor.state.selection.node?.type.name === 'image') {
            editor.chain().focus().updateAttributes('image', { textAlign: align }).run();
        } else {
            editor.chain().focus().setTextAlign(align).run();
        }
    };

    const isAlignActive = (align) => {
        const isImageSelected = editor.isActive('image') || editor.state.selection.node?.type.name === 'image';
        if (isImageSelected) {
            return editor.getAttributes('image').textAlign === align;
        }
        return editor.isActive({ textAlign: align });
    };

    return (
        <div className={`border-b ${theme ? theme.border : 'border-gray-300'} p-2 flex flex-wrap gap-1 ${theme ? theme.panel : 'bg-white'} sticky top-0 z-20 items-center shadow-sm print:hidden`}>

            {/* Font Family */}
            <div className="flex items-center gap-1 mr-2 border-r border-gray-700/30 pr-2">
                <select
                    className={`text-xs p-1.5 rounded border ${theme?.border} ${theme?.input} w-32`}
                    onChange={(e) => editor.chain().focus().setFontFamily(e.target.value).run()}
                    value={editor.getAttributes('textStyle').fontFamily || ''}
                    title="Fonte"
                >
                    <option value="">Padrão (Inter)</option>
                    <option value="Arial">Arial</option>
                    <option value="Arial Black">Arial Black</option>
                    <option value="Comic Sans MS">Comic Sans</option>
                    <option value="Courier New">Courier New</option>
                    <option value="Georgia">Georgia</option>
                    <option value="Impact">Impact</option>
                    <option value="Tahoma">Tahoma</option>
                    <option value="Times New Roman">Times New Roman</option>
                    <option value="Trebuchet MS">Trebuchet MS</option>
                    <option value="Verdana">Verdana</option>
                </select>
            </div>

            {/* Font Size */}
            <div className="flex items-center gap-1 mr-2 border-r border-gray-700/30 pr-2">
                <button onClick={() => updateFontSize(-1)} className="p-1 rounded hover:bg-gray-200" title="Diminuir"><Minus size={12} /></button>
                <select
                    value={FONT_SIZES.includes(currentFontSize) ? currentFontSize : 16}
                    onChange={(e) => setFontSize(parseInt(e.target.value))}
                    className="w-14 text-xs text-center border rounded p-1 bg-white cursor-pointer"
                    title="Tamanho da Fonte"
                >
                    {FONT_SIZES.map(size => (
                        <option key={size} value={size}>{size}</option>
                    ))}
                </select>
                <button onClick={() => updateFontSize(1)} className="p-1 rounded hover:bg-gray-200" title="Aumentar"><Plus size={12} /></button>
            </div>

            {/* Semantic Format (Headings) */}
            <div className="flex items-center gap-1 mr-2 border-r border-gray-700/30 pr-2">
                <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('heading', { level: 1 }) ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Título 1 (H1)"><Heading1 size={18} /></button>
                <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('heading', { level: 2 }) ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Título 2 (H2)"><Heading2 size={18} /></button>
                <button onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('heading', { level: 3 }) ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Título 3 (H3)"><Heading3 size={18} /></button>
            </div>

            {/* Basic Style */}
            <div className="flex items-center gap-0.5 mr-2 border-r border-gray-700/30 pr-2">
                <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('bold') ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Negrito"><Bold size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('italic') ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Itálico"><Italic size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('underline') ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Sublinhado"><UnderlineIcon size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('strike') ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Tachado"><Strikethrough size={16} /></button>
                <div className="w-px h-6 bg-gray-300 mx-1"></div>
                <button onClick={() => editor.chain().focus().toggleHighlight().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('highlight') ? 'text-amber-500 bg-amber-500/10' : 'opacity-70'}`} title="Marca-texto"><Highlighter size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleCode().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('code') ? 'text-blue-500 bg-blue-500/10' : 'opacity-70'}`} title="Código Inline"><Code size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('codeBlock') ? 'text-purple-600 bg-purple-100 ring-2 ring-purple-500/20' : 'opacity-70'}`} title="Bloco de Código"><Maximize2 size={16} /></button>
            </div>

            {/* Alignment */}
            <div className="flex items-center gap-0.5 mr-2 border-r border-gray-700/30 pr-2">
                <button onClick={() => setAlign('left')} className={`p-1.5 rounded hover:bg-gray-500/10 ${isAlignActive('left') ? 'text-blue-500' : 'opacity-70'}`} title="Esquerda"><AlignLeft size={16} /></button>
                <button onClick={() => setAlign('center')} className={`p-1.5 rounded hover:bg-gray-500/10 ${isAlignActive('center') ? 'text-blue-500' : 'opacity-70'}`} title="Centro"><AlignCenter size={16} /></button>
                <button onClick={() => setAlign('right')} className={`p-1.5 rounded hover:bg-gray-500/10 ${isAlignActive('right') ? 'text-blue-500' : 'opacity-70'}`} title="Direita"><AlignRight size={16} /></button>
                <button onClick={() => setAlign('justify')} className={`p-1.5 rounded hover:bg-gray-500/10 ${isAlignActive('justify') ? 'text-blue-500' : 'opacity-70'}`} title="Justificado"><AlignJustify size={16} /></button>
            </div>

            {/* Colors */}
            <div className="flex items-center gap-1 mr-2 border-r border-gray-700/30 pr-2">
                <input
                    type="color"
                    onInput={event => editor.chain().focus().setColor(event.target.value).run()}
                    value={editor.getAttributes('textStyle').color || '#000000'}
                    className="w-8 h-8 p-0 border border-gray-300 rounded cursor-pointer"
                    title="Cor do Texto"
                />
            </div>

            {/* Lists & Quotes */}
            <div className="flex items-center gap-0.5 mr-2 border-r border-gray-700/30 pr-2">
                <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('bulletList') ? 'text-blue-500' : 'opacity-70'}`} title="Lista de Pontos"><List size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('orderedList') ? 'text-blue-500' : 'opacity-70'}`} title="Lista Numerada"><ListOrdered size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleTaskList().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('taskList') ? 'text-blue-500' : 'opacity-70'}`} title="Lista de Tarefas"><CheckSquare size={16} /></button>
                <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`p-1.5 rounded hover:bg-gray-500/10 ${editor.isActive('blockquote') ? 'text-blue-500' : 'opacity-70'}`} title="Citação"><Quote size={16} /></button>
            </div>

            {/* AI & Inserts */}
            <div className="flex items-center gap-1 mr-2">
                <button onClick={handleAiClick} className="p-1 px-3 rounded hover:bg-purple-100 text-purple-600 flex items-center gap-1 font-semibold border border-purple-200 transition-colors" title="Assistente AI">
                    <Sparkles size={16} />
                    <span className="text-xs">AI</span>
                </button>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={(e) => handleImageUpload(e.target.files[0])}
                />
                <button onClick={onImageClick} className="p-1.5 rounded hover:bg-gray-500/10 opacity-70" title="Inserir Imagem"><ImageIcon size={16} /></button>
                <button onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} className="p-1.5 rounded hover:bg-gray-500/10 opacity-70" title="Inserir Tabela"><TableIcon size={16} /></button>
                <button onClick={() => editor.chain().focus().setPageBreak().run()} className="p-1.5 rounded hover:bg-gray-500/10 opacity-70" title="Quebra de Página"><Scissors size={16} /></button>
            </div>

            {/* Export (New) */}
            <div className="flex items-center gap-1 mr-2 border-r border-gray-700/30 pr-2 relative group">
                <button className="p-1 px-2 rounded hover:bg-gray-500/10 flex items-center gap-1 opacity-80 hover:opacity-100" title="Exportar">
                    <Download size={16} />
                    <span className="text-xs font-medium">Export</span>
                    <ChevronDown size={10} />
                </button>
                {/* Dropdown */}
                {/* Dropdown Wrapper with Padding Bridge */}
                <div className="absolute top-full left-0 pt-1 hidden group-hover:block z-50 min-w-[150px]">
                    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-1">
                        <button
                            onClick={async () => {
                                if (window.electronAPI) {
                                    if (!editor) return;
                                    const html = editor.getHTML();
                                    const success = await window.electronAPI.exportPDF(html);
                                    if (success) alert("PDF Exportado com sucesso!");
                                } else {
                                    window.print(); // Fallback
                                }
                            }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        >
                            <Printer size={14} />
                            Exportar PDF
                        </button>
                        <button
                            onClick={async () => {
                                if (!editor) return;
                                const html = editor.getHTML();
                                try {
                                    const buffer = await HTMLtoDOCX(html, null, {
                                        table: { row: { cantSplit: true } },
                                        footer: true,
                                        pageNumber: true,
                                    });
                                    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
                                    saveAs(blob, 'documento.docx');
                                } catch (e) {
                                    console.error(e);
                                    alert("Erro ao exportar Word.");
                                }
                            }}
                            className="w-full text-left flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                        >
                            <FileIcon size={14} />
                            Exportar Word
                        </button>
                    </div>
                </div>
            </div>

            <div className="ml-auto flex items-center">
                <button
                    onClick={onSave}
                    className={`p-1.5 px-3 rounded flex items-center gap-2 transition-colors ${isSaving ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'} text-white font-medium text-xs shadow-sm`}
                >
                    <Save size={14} />
                    {isSaving ? 'Salvando...' : 'Salvar'}
                </button>
            </div>
        </div>
    );
};

// --- 6. TEMPLATES ---
const TEMPLATES = {
    meeting: {
        label: 'Reunião',
        icon: '📅',
        content: `
            <h1>Ata de Reunião</h1>
            <p><strong>Data:</strong> ${new Date().toLocaleDateString()}</p>
            <p><strong>Participantes:</strong></p>
            <ul><li>@Nome</li></ul>
            <h2>Pauta</h2>
            <ul><li>Tópico 1</li></ul>
            <h2>Decisões / Ações</h2>
            <ul data-type="taskList"><li data-type="taskItem" data-checked="false">Ação 1</li></ul>
        `
    },
    project: {
        label: 'Projeto',
        icon: '🚀',
        content: `
            <h1>Plano de Projeto</h1>
            <h2>Visão Geral</h2>
            <p>Descrição do projeto...</p>
            <h2>Objetivos</h2>
            <ul><li>Objetivo 1</li></ul>
            <h2>Cronograma</h2>
            <p>Data de Entrega: ...</p>
        `
    },
    daily: {
        label: 'Daily',
        icon: '⚡',
        content: `
            <h1>Daily Standup</h1>
            <h3>O que fiz ontem?</h3>
            <ul><li>...</li></ul>
            <h3>O que farei hoje?</h3>
            <ul><li>...</li></ul>
            <h3>Bloqueios?</h3>
            <p>Não.</p>
        `
    }
};

const TemplateSelector = ({ onSelect, theme }) => {
    return (
        <div className="absolute inset-0 flex items-center justify-center bg-transparent pointer-events-none z-10">
            <div className={`p-6 rounded-xl shadow-lg border ${theme ? theme.border : 'border-gray-200'} ${theme ? theme.panel : 'bg-white'} pointer-events-auto max-w-2xl w-full mx-4`}>
                <h3 className={`text-lg font-semibold mb-4 ${theme ? theme.text : 'text-gray-800'}`}>Começar com um modelo...</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {Object.entries(TEMPLATES).map(([key, t]) => (
                        <button
                            key={key}
                            onClick={() => onSelect(t.content)}
                            className={`flex flex-col items-center gap-3 p-4 rounded-lg border transition-all hover:scale-105 ${theme ? theme.border : 'border-gray-200'} hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20`}
                        >
                            <span className="text-3xl">{t.icon}</span>
                            <span className={`font-medium ${theme ? theme.text : 'text-gray-700'}`}>{t.label}</span>
                        </button>
                    ))}
                    <button
                        onClick={() => onSelect('')}
                        className={`flex flex-col items-center gap-3 p-4 rounded-lg border border-dashed hover:border-blue-500 hover:bg-gray-50 dark:hover:bg-white/5 transition-all text-gray-400 hover:text-gray-600`}
                    >
                        <span className="text-3xl">📄</span>
                        <span className="font-medium">Em Branco</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- 7. DOC EDITOR COMPONENT ---
const DocEditor = React.forwardRef(({ initialContent, onSave, theme, readOnly = false, onNavigate, highlight }, ref) => {
    const [isSaving, setIsSaving] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);

    // Effect to check if empty on load
    useEffect(() => {
        console.log(`[DocEditor] Mount/Update. ReadOnly: ${readOnly}, InitialContent Len: ${initialContent?.length}`);

        // Only show if editable and truly empty (initialContent is null/empty string)
        if (!readOnly && (!initialContent || initialContent === '<p></p>')) {
            setShowTemplates(true);
        } else {
            setShowTemplates(false);
        }
    }, [initialContent, readOnly]);

    const handleSave = async () => {
        if (!editor) return;
        setIsSaving(true);
        const html = editor.getHTML();
        await onSave(html);
        setTimeout(() => setIsSaving(false), 500);
    };

    const applyTemplate = (content) => {
        if (!editor) return;
        if (content) {
            editor.commands.setContent(content);
            editor.commands.focus();
            handleSave(); // Auto-save template
        } else {
            editor.commands.focus();
        }
        setShowTemplates(false);
    };

    // State for AI Expansion Configuration
    const [expandConfig, setExpandConfig] = useState({ type: 'Continuar escrita', length: 'Médio', isOpen: false });

    const handleAiRequest = async (instruction) => {
        // Support both strings (preset) and selection (custom)
        let customInstruction = instruction;
        if (typeof instruction !== 'string') {
            customInstruction = prompt("Como a IA pode ajudar? (ex: 'Resumir', 'Criar lista')");
        }

        if (!editor || !customInstruction) return;

        const { from, to, empty } = editor.state.selection;
        if (empty) {
            alert("Selecione um texto para a IA processar.");
            return;
        }

        const selectedText = editor.state.doc.textBetween(from, to, ' ');
        const isTable = editor.isActive('table');
        let contentToSend = selectedText;

        // Append context to instruction if in table
        let finalInstruction = customInstruction;
        let tableRange = null;

        if (isTable) {
            // FIND THE PARENT TABLE NODE to provide full context (Headers, Columns)
            let $pos = editor.state.selection.$from;
            let depth = $pos.depth;
            let tableNode = null;
            let tableStart = -1;

            for (let d = depth; d > 0; d--) {
                const node = $pos.node(d);
                if (node.type.name === 'table') {
                    tableNode = node;
                    tableStart = $pos.start(d) - 1; // -1 to get the pos BEFORE the table starts
                    break;
                }
            }

            if (tableNode) {
                // Send FULL TABLE JSON
                contentToSend = JSON.stringify(tableNode.toJSON());
                tableRange = { from: tableStart, to: tableStart + tableNode.nodeSize };

                if (customInstruction.startsWith("Complementar:")) {
                    finalInstruction += " [CONTEXT: TABLE JSON - Return FULL UPDATED JSON Structure (Whole Table)]";
                }
            } else {
                // Fallback to selection if lookup fails (unlikely if isTable is true)
                const json = editor.state.selection.content().toJSON();
                contentToSend = JSON.stringify(json);
                if (customInstruction.startsWith("Complementar:")) {
                    finalInstruction += " [CONTEXT: TABLE JSON - Return FULL UPDATED JSON Structure]";
                }
            }
        }

        setIsSaving(true);

        try {
            const res = await fetch('http://localhost:3001/api/ai/text', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: contentToSend, instruction: finalInstruction })
            });
            const data = await res.json();

            if (data.result) {
                // INTELLIGENT INSERTION LOGIC
                if (customInstruction.startsWith("Complementar:")) {
                    if (isTable) {
                        try {
                            // Table Mode: Expect JSON content for the table/rows
                            // We treat the result as content to replace/insert
                            // If user selected the whole table, result should be the updated table.
                            // Tiptap insertContent handles JSON objects/arrays.
                            let jsonContent = typeof data.result === 'string' ? JSON.parse(data.result) : data.result;

                            // If we have a full table range, REPLACE the whole table
                            if (tableRange) {
                                // Validate if jsonContent feels like a table
                                if (jsonContent.type === 'table' || (Array.isArray(jsonContent) && jsonContent[0]?.type === 'table')) {
                                    editor.chain().focus().deleteRange(tableRange).insertContentAt(tableRange.from, jsonContent).run();
                                } else if (Array.isArray(jsonContent) && jsonContent[0]?.type === 'tableRow') {
                                    // If AI returned just rows, this is tricky if we deleted the whole table.
                                    // Ideally AI returns full table.
                                    // Fallback: This path shouldn't be hit with current Prompt logic, but safe-guard?
                                    // If we requested full table, we expect full table.
                                    // Actually, if we deleteRange, we have no table wrapper.
                                    // Re-wrapping manual might be needed.
                                    // Let's assume prompt works.
                                    editor.chain().focus().deleteRange(tableRange).insertContentAt(tableRange.from, {
                                        type: 'table',
                                        content: jsonContent
                                    }).run();
                                } else {
                                    // Just insert whatever we got?
                                    editor.chain().focus().insertContent(jsonContent).run();
                                }
                            } else {
                                // Fallback for partial selection
                                editor.chain().focus().insertContent(jsonContent).run();
                            }
                        } catch (err) {
                            console.error("Failed to parse AI Table JSON", err);
                            alert("Erro ao formatar tabela da IA.");
                        }
                    } else {
                        // APPEND MODE (Text)
                        const needsSpace = !selectedText.endsWith(' ') && !data.result.startsWith(' ');
                        const contentToInsert = (needsSpace ? ' ' : '') + data.result;
                        editor.chain().focus().insertContentAt(to, contentToInsert).run();
                    }
                } else {
                    // REPLACE MODE
                    editor.chain().focus().insertContentAt({ from, to }, data.result).run();
                }
            } else {
                alert("Erro ao processar com IA.");
            }
        } catch (e) {
            console.error(e);
            alert("Falha de conexão com IA.");
        } finally {
            setIsSaving(false);
            setExpandConfig(prev => ({ ...prev, isOpen: false })); // Close menu after run
        }
    };

    // Helper to generate the instruction string from state
    const runExpansion = () => {
        const typeMap = {
            'Continuar escrita': 'Continuar o fluxo do texto',
            'Adicionar Exemplo': 'Adicionar um exemplo prático',
            'Inserir Dados': 'Explicar com dados fictícios/reais'
        };
        const lenMap = {
            'Curto': 'Curto (1 parágrafo)',
            'Médio': 'Médio (2-3 parágrafos)',
            'Longo': 'Longo (detalhado)'
        };

        const instruction = `Complementar: ${typeMap[expandConfig.type]} - Tamanho: ${lenMap[expandConfig.length]}`;
        handleAiRequest(instruction);
    };

    // ... (rest of component)


    const handleDrop = (view, event, slice, moved) => {
        // STRICTER DUPLICATION CHECK
        // If 'moved' is true, it's definitely an internal DnD.
        if (moved) return false;

        // Ensure we only process dragging of FILES from OS, not nodes inside
        const hasFiles = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files.length > 0;

        if (hasFiles) {
            const file = event.dataTransfer.files[0];
            if (file.type.startsWith('image/')) {
                // Prevent default behavior to stop browser from opening image
                event.preventDefault();

                const formData = new FormData();
                formData.append('file', file);

                fetch('http://localhost:3001/api/upload/attachment', { method: 'POST', body: formData })
                    .then(res => res.json())
                    .then(data => {
                        if (data.url) {
                            const { schema } = view.state;
                            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY });
                            if (coordinates) {
                                view.dispatch(view.state.tr.insert(coordinates.pos, schema.nodes.image.create({ src: `http://localhost:3001${data.url}` })));
                            }
                        }
                    })
                    .catch(err => console.error("Drop upload failed", err));
                return true;
            }
        }
        return false;
    };

    const editor = useEditor({
        extensions: [
            // Custom Document Structure: doc -> page
            Document.extend({
                content: 'page+',
            }),
            Page,
            Pagination,
            StarterKit.configure({
                document: false, // Disable default Document
                codeBlock: false,
                history: false, // Usage explicit History extension below
            }),
            History.configure({
                depth: 100,
                newGroupDelay: 500,
            }),
            // Use our Custom Resizable Image
            ResizableImage,
            CodeBlockLowlight.configure({
                lowlight,
            }).extend({
                addNodeView() {
                    return ReactNodeViewRenderer(CodeBlockComponent);
                }
            }),
            Placeholder.configure({
                placeholder: 'Comece a escrever sua documentação... (Use "/" para comandos)',
            }),
            Table.configure({ resizable: true }), // Improved table
            TableRow,
            TableHeader,
            TableCell,
            TextStyle,
            Color,
            Highlight.configure({ multicolor: true }),
            Underline,
            TextAlign.configure({ types: ['heading', 'paragraph', 'image'] }),
            FontFamily,
            FontSize, // Our new extension
            TaskList,
            TaskItem.configure({ nested: true }),
            BubbleMenuExtension.configure({
                shouldShow: ({ editor, view, state, from, to }) => {
                    // Only show if selection is not empty and not an image/codeblock
                    if (state.selection.empty) return false;
                    if (editor.isActive('image') || editor.isActive('codeBlock')) return false;
                    return true;
                },
            }),
            WikiLink.configure({
                onOpen: (page) => {
                    if (onNavigate) onNavigate(page);
                }
            }),
        ],
        content: initialContent || '<page><p></p></page>', // Default to a page if empty
        editable: !readOnly,
        editorProps: {
            attributes: {
                // The Editor Container is now the "Desk"
                // Gray Background, Centered Flex column for pages
                class: `prose max-w-none focus:outline-none w-full bg-[#F3F4F6] flex flex-col items-center py-8 outline-none print:bg-white print:block`,
                style: `min-height: 100vh;`
            },
            handleDrop: handleDrop,
            handleDOMEvents: {
                click: (view, event) => {
                    const target = event.target;

                    // 1. Wiki Link Navigation
                    if (target.matches('.wiki-link')) {
                        event.preventDefault();
                        const page = target.getAttribute('data-page');
                        if (onNavigate) {
                            onNavigate(page);
                        } else {
                            alert(`Navegar para: ${page} (Funcionalidade pendente no módulo pai)`);
                        }
                        return true;
                    }

                    // 2. Click on empty "Paper" area (the ProseMirror container itself)
                    // If user clicks the empty padding area, force focus to end.
                    if (target === view.dom) {
                        const { doc, tr } = view.state;
                        const lastNode = doc.lastChild;

                        // If last node is a code block (or anything not easily escaped), append a paragraph
                        if (lastNode && (lastNode.type.name === 'codeBlock' || lastNode.type.name === 'table')) {
                            view.dispatch(tr.insert(doc.content.size, view.state.schema.nodes.paragraph.create()));
                        }

                        view.focus();
                        // Move cursor to absolute end
                        const endPos = view.state.doc.content.size;
                        view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(endPos))));
                        return true;
                    }

                    return false;
                }
            }
        },
    }, []); // FIXED: Empty dependency array to prevent re-initialization on auto-save (preserves Undo History)

    // Dynamic ReadOnly Update
    useEffect(() => {
        if (editor) {
            editor.setEditable(!readOnly);
        }
    }, [editor, readOnly]);

    // Expose methods to parent via ref
    React.useImperativeHandle(ref, () => ({
        getHTML: () => {
            if (editor && !editor.isDestroyed) {
                return editor.getHTML();
            }
            return null;
        },
        saveNow: () => handleSave(),
        insertContent: (content) => {
            if (editor && !editor.isDestroyed) {
                editor.chain().focus().insertContent(content).run();
                handleSave();
            }
        }
    }));

    // Auto-Save Logic (Debounce)
    useEffect(() => {
        if (!editor || readOnly) return;
        let debounceTimer;
        const onUpdate = () => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => handleSave(), 2000);
        };
        editor.on('update', onUpdate);
        return () => {
            editor.off('update', onUpdate);
            clearTimeout(debounceTimer);
        };
    }, [editor, readOnly]);


    // Deep Linking / Highlight Logic
    useEffect(() => {
        if (editor && highlight && highlight.trim()) {
            // Delay to allow content render
            setTimeout(() => {
                try {
                    const text = editor.getText().toLowerCase();
                    const term = highlight.toLowerCase();
                    const index = text.indexOf(term);

                    if (index !== -1) {
                        // 1. Select the text
                        const from = index + 1; // +1 padding usually for doc start? Tiptap starts at 1?
                        editor.commands.setTextSelection({ from: index + 1, to: index + 1 + term.length });
                        editor.commands.scrollIntoView();
                    }
                } catch (e) { console.error("Highlight error", e); }
            }, 500);
        }
    }, [highlight, editor]);

    // Custom Keyboard Shortcuts (Undo/Redo Fix)
    useEffect(() => {
        if (!editor) return;

        // Force Refocus to ensure key events are captured if lost
        // editor.commands.focus(); 

        // We can't easily add global window listeners for Tiptap commands without 'editor' context issues
        // BUT Tiptap's History extension should catch these if we don't preventDefault elsewhere.
        // The previous crash was due to 'editor' being undefined in the closure.
        // Let's verify if we need to manually add them.
        // If the user says they stopped working, it's likely my previous broken code.
        // Removing the broken code might be enough. 
        // But to be SAFE, let's explicitly add them to the editor instance.

        // No, Tiptap extensions are declarative. 
        // We can use Mousetrap or standard listeners if needed, but let's trust removing the broken code first.

    }, [editor]);

    return (
        <div className={`flex flex-col h-full ${theme ? theme.bg : 'bg-gray-50'}`}>
            <MenuBar
                editor={editor}
                onSave={handleSave}
                isSaving={isSaving}
                theme={theme}
                onAiRequest={handleAiRequest}
            />
            {editor && (
                <BubbleMenu editor={editor} tippyOptions={{ duration: 100, zIndex: 99, maxWidth: 'none' }} className="flex bg-white border border-gray-200 rounded-lg shadow-xl dark:bg-gray-800 dark:border-gray-700">
                    <button
                        onClick={() => handleAiRequest("Melhorar escrita")}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        <Sparkles size={14} className="text-purple-500" />
                        Melhorar
                    </button>
                    <div className="w-px bg-gray-200 dark:bg-gray-700 mx-1 my-1" />
                    <button
                        onClick={() => handleAiRequest("Resumir")}
                        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        Resumir
                    </button>
                    <button
                        onClick={() => handleAiRequest("Explicar de forma simples")}
                        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        Explicar
                    </button>
                    <button
                        onClick={() => handleAiRequest("Traduzir para Inglês")}
                        className="px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                        Traduzir
                    </button>

                    <div className="w-px bg-gray-200 dark:bg-gray-700 mx-1 my-1" />

                    {/* Expand Button Group */}
                    <div className="relative flex items-center group">
                        <button
                            onClick={() => setExpandConfig(prev => ({ ...prev, isOpen: !prev.isOpen }))}
                            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium transition-colors ${expandConfig.isOpen ? 'bg-blue-50 text-blue-800' : 'text-blue-700 hover:bg-blue-50 dark:text-blue-300 dark:hover:bg-blue-900/30'}`}
                        >
                            <PenLine size={14} className="text-blue-500" />
                            Expandir
                            <ChevronDown size={10} className={`opacity-50 transition-transform ${expandConfig.isOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {/* Expand Popup Configuration */}
                        {expandConfig.isOpen && (
                            <div className="absolute top-full right-0 mt-2 z-50 min-w-[280px]">
                                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3 flex flex-col gap-3">
                                    {/* Type Selection */}
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Tipo de Complemento</label>
                                        <div className="flex flex-col gap-1">
                                            {['Continuar escrita', 'Adicionar Exemplo', 'Inserir Dados'].map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setExpandConfig(prev => ({ ...prev, type }))}
                                                    className={`text-left px-2 py-1 text-sm rounded transition-colors ${expandConfig.type === type ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300' : 'hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                                                >
                                                    {type === 'Continuar escrita' && '✍️ '}
                                                    {type === 'Adicionar Exemplo' && '💡 '}
                                                    {type === 'Inserir Dados' && '📊 '}
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Length Selection */}
                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1 block">Tamanho</label>
                                        <div className="flex gap-2 text-xs">
                                            {['Curto', 'Médio', 'Longo'].map(len => (
                                                <button
                                                    key={len}
                                                    onClick={() => setExpandConfig(prev => ({ ...prev, length: len }))}
                                                    className={`flex-1 py-1 border rounded transition-colors ${expandConfig.length === len ? 'bg-blue-50 border-blue-500 text-blue-600' : 'hover:border-blue-400'}`}
                                                >
                                                    {len}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button
                                        onClick={runExpansion}
                                        className="w-full py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-medium transition-colors flex items-center justify-center gap-2"
                                    >
                                        <Sparkles size={14} />
                                        Gerar Complemento
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </BubbleMenu>
            )}
            <div className="flex-1 overflow-y-scroll custom-scrollbar bg-gray-200/70 dark:bg-black/40 relative" style={{ scrollbarGutter: 'stable' }}>
                {showTemplates && editor && editor.isEmpty && (
                    <TemplateSelector onSelect={applyTemplate} theme={theme} />
                )}
                <div className="max-w-[1200px] mx-auto relative flex justify-center p-4 md:p-8">
                    {/* Main Editor Paper - Perfectly Centered */}
                    <EditorContent editor={editor} className="w-full max-w-[850px]" />

                    {/* Floating TOC - Absolute Right */}
                    <div className="absolute right-4 top-8 hidden 2xl:block h-full pointer-events-none">
                        <div className="pointer-events-auto sticky top-0">
                            <TableOfContents editor={editor} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default DocEditor;
