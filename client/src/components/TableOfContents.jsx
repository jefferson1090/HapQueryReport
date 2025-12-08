import React, { useState, useEffect } from 'react';

const TableOfContents = ({ editor }) => {
    const [headings, setHeadings] = useState([]);

    useEffect(() => {
        if (!editor) return;

        const updateHeadings = () => {
            const newHeadings = [];
            editor.state.doc.descendants((node, pos) => {
                if (node.type.name === 'heading') {
                    // Ignore empty headings
                    if (node.textContent.trim().length === 0) return;

                    newHeadings.push({
                        level: node.attrs.level,
                        text: node.textContent,
                        id: `heading-${pos}`,
                        pos: pos
                    });
                }
            });
            setHeadings(newHeadings);
        };

        // Initial scan
        updateHeadings();

        // Listen for updates
        editor.on('update', updateHeadings);
        editor.on('selectionUpdate', updateHeadings);

        return () => {
            editor.off('update', updateHeadings);
            editor.off('selectionUpdate', updateHeadings);
        };
    }, [editor]);

    const handleClick = (pos) => {
        editor.chain().focus().setTextSelection(pos).run();

        // Scroll logic (rough approximation)
        try {
            const dom = editor.view.domAtPos(pos).node;
            if (dom && dom.scrollIntoView) {
                dom.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        } catch (e) {
            console.warn("Could not scroll to heading", e);
        }
    };

    if (headings.length === 0) return null;

    return (
        <div className="w-60 pl-2">
            <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">Índice</h3>
            <ul className="space-y-1 relative border-l-2 border-gray-100 dark:border-gray-800 ml-1.5">
                {headings.map((heading, index) => (
                    <li key={index}
                        className={`text-sm group flex items-center relative pl-3 cursor-pointer transition-all duration-200
                        ${heading.level === 1 ? 'font-medium text-gray-700 dark:text-gray-300' : ''}
                        ${heading.level === 2 ? 'text-gray-500 hover:text-gray-800 dark:text-gray-500' : ''}
                        ${heading.level === 3 ? 'text-gray-400 text-xs hover:text-gray-700' : ''}
                        `}
                        onClick={() => handleClick(heading.pos)}
                    >
                        {/* Active Indicator (Pseudo-active state based on hover for now) */}
                        <div className="absolute -left-[1.5px] top-1/2 -translate-y-1/2 w-[2px] h-0 group-hover:h-full bg-blue-500 transition-all duration-200" />

                        <span className="truncate">{heading.text}</span>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default TableOfContents;
