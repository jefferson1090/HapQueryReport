import { Node, mergeAttributes } from '@tiptap/core';

export const Page = Node.create({
    name: 'page',
    group: 'block',
    // The page must contain at least one block to be valid. 
    // We use block+ to ensure it's not empty, but we might handle empty pages in the plugin.
    content: 'block+',

    // Key: This makes the node behave like a top-level container
    // We remove isolating/defining to allow standard ProseMirror behavior (Merging on backspace)
    // The Pagination plugin will handle re-splitting if it gets too big.
    isolating: false,

    addAttributes() {
        return {
            class: {
                default: 'page-a4 mx-auto my-8 bg-white shadow-2xl drop-shadow-xl p-[2.5cm] min-h-[1123px] w-[794px]',
            },
        };
    },

    parseDOM: [
        {
            tag: 'div.page-a4',
        },
    ],

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes), 0];
    },
});
