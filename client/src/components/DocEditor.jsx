import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent, NodeViewWrapper, NodeViewContent, ReactNodeViewRenderer } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import Placeholder from '@tiptap/extension-placeholder';
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
    Type, Palette, Minus, Plus, Maximize2, Copy, Check, ChevronDown
} from 'lucide-react';

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

// --- 4. EXTEND IMAGE TO USE NODE VIEW ---
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
        <div className={`border-b ${theme ? theme.border : 'border-gray-300'} p-2 flex flex-wrap gap-1 ${theme ? theme.panel : 'bg-white'} sticky top-0 z-20 items-center shadow-sm`}>

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

const DocEditor = ({ initialContent, onSave, theme, readOnly = false }) => {
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        if (!editor) return;
        setIsSaving(true);
        const html = editor.getHTML();
        await onSave(html);
        setTimeout(() => setIsSaving(false), 500);
    };

    const handleAiRequest = async (selectedText) => {
        const instruction = prompt("Como a IA pode ajudar? (ex: 'Resumir', 'Melhorar gramática', 'Continuar texto')");
        if (!instruction) return;

        // Placeholder for AI Action
        alert("Ação enviada para IA (Simulação): " + instruction);
    };

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
            StarterKit.configure({
                codeBlock: false, // We use Lowlight
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
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            FontFamily,
            FontSize, // Our new extension
            TaskList,
            TaskItem.configure({ nested: true }),
        ],
        content: initialContent || '',
        editable: !readOnly,
        editorProps: {
            attributes: {
                class: `prose max-w-none focus:outline-none min-h-[500px] px-12 py-8 shadow-sm bg-white dark:bg-[#1e1e1e] mx-auto my-4 rounded-lg w-full md:w-[850px] lg:w-[1000px] outline-none ${theme && theme.name === 'Modo Escuro' ? 'prose-invert text-white' : 'text-gray-800'}`,
            },
            handleDrop: handleDrop
        },
    });

    useEffect(() => {
        if (editor && initialContent && editor.isEmpty) {
            editor.commands.setContent(initialContent);
        }
    }, [initialContent, editor]);

    return (
        <div className={`flex flex-col h-full ${theme ? theme.bg : 'bg-gray-50'}`}>
            <MenuBar
                editor={editor}
                onSave={handleSave}
                isSaving={isSaving}
                theme={theme}
                onAiRequest={handleAiRequest}
            />
            <div className="flex-1 overflow-y-auto custom-scrollbar flex justify-center bg-gray-100 dark:bg-black/20 pb-20">
                <EditorContent editor={editor} className="w-full flex justify-center" />
            </div>
        </div>
    );
};

export default DocEditor;
