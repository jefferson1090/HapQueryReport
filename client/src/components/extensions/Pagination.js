import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

export const Pagination = Extension.create({
    name: 'pagination',

    addOptions() {
        return {
            pageHeight: 1123, // A4 Height @ 96 DPI
            contentHeight: 1123 - (113 * 2), // 1123 - margins ? Actually we measure the whole page DIV.
            // The Page Node has min-height: 1123px.
            // When content expands, the Page Node grows > 1123px.
            // That is our trigger.
            threshold: 1130, // Slight buffer
        };
    },

    addProseMirrorPlugins() {
        const { threshold } = this.options;

        return [
            new Plugin({
                key: new PluginKey('pagination'),
                view(editorView) {
                    let checking = false;
                    let debouncedCheck = null;
                    let cooldownTimer = null;
                    let isCoolingDown = false;

                    const checkPagination = () => {
                        if (checking || editorView.isDestroyed || isCoolingDown) return;
                        checking = true;

                        const { state, dispatch } = editorView;
                        const { doc, tr } = state;
                        let modified = false;

                        // Helper to get all pages
                        let pages = [];
                        doc.descendants((node, pos) => {
                            if (node.type.name === 'page') {
                                pages.push({ node, pos });
                            }
                            return false;
                        });

                        // 1. Check for Empty Pages to Delete/Merge (Fix "Delete" issue)
                        // Iterate backwards to avoid index shifting problems
                        for (let i = pages.length - 1; i >= 0; i--) {
                            const page = pages[i];
                            // If page is empty (content size 0 or just empty paragraph?)
                            // node.content.size === 0 is impossible if schema is block+.
                            // But if it has just one empty paragraph?
                            const isEmpty = page.node.childCount === 1 && page.node.firstChild.content.size === 0;
                            // Only remove if it's NOT the only page
                            if (isEmpty && pages.length > 1) {
                                // If it's the last page And empty -> Remove it.
                                // If it's a middle page -> Remove it (pulling content up).
                                const from = page.pos;
                                const to = page.pos + page.node.nodeSize;
                                tr.delete(from, to);
                                modified = true;
                                // We modified doc, indices invalid. Break and retry.
                                break;
                            }
                        }

                        if (modified) {
                            dispatch(tr);
                            checking = false;
                            return; // Wait for next update cycle
                        }

                        // 2. Check for Overflows (Fix "Infinite Loop" issue)
                        for (const page of pages) {
                            const dom = editorView.nodeDOM(page.pos);
                            if (dom && dom instanceof HTMLElement) {
                                const height = dom.offsetHeight;
                                if (height > threshold) {
                                    // OVERFLOW DETECTED

                                    // Strategy: Find the exact split point by measuring DOM children.
                                    // 1. Define Max Content Height (Pages are 1123px, Padding is approx 96px top/bottom? No, 113px per css).
                                    // Actually, we can just check where the DOM children cross the page bottom bound.

                                    const pageRect = dom.getBoundingClientRect();
                                    const contentBottomLimit = pageRect.bottom - 96; // Approximate Padding Bottom (2.5cm) to be safe.
                                    // Better: user styles say py-[113px] (3cm). Let's use 100px buffer. 
                                    // If we rely on offsetHeight of Page, that includes padding.
                                    // We want the content to stay inside the "printable" area?
                                    // Actually, the Page Node grows with content. We want to cut it when it exceeds 1123px.
                                    // So any content that is physically below pixel 1123 (relative to page top) must go.

                                    // Let's find the split point.
                                    let splitPos = -1;

                                    // Iterate generic blocks (children of page-a4 div)
                                    // Note: ProseMirror renders nodes into this div.
                                    const children = Array.from(dom.children);

                                    for (let i = 0; i < children.length; i++) {
                                        const child = children[i];
                                        const childRect = child.getBoundingClientRect();

                                        // Does this child cross the line?
                                        // The line is pageRect.top + 1123 - padding? 
                                        // Let's use relative measurement.
                                        const relativeBottom = childRect.bottom - pageRect.top;

                                        // Limit: 1123px is page height. Padding bottom is ~113px.
                                        // Limit for content end is ~980px.
                                        const limit = 980;

                                        if (relativeBottom > limit) {
                                            // This child is the offender.
                                            // Can we split INSIDE it? (e.g. List)
                                            // Check if it has children we can split (like li)
                                            // We only support splitting Lists for now (ul/ol)

                                            // Map DOM to POS
                                            const childPos = editorView.posAtDOM(child, 0);
                                            // Safety: Ensure childPos is valid and mapped correctly
                                            if (childPos === null || childPos === undefined) continue;

                                            if (child.tagName === 'UL' || child.tagName === 'OL') {
                                                // It's a list. Find which item overflows.
                                                const listItems = Array.from(child.children);
                                                let itemSplitIndex = -1;

                                                for (let j = 0; j < listItems.length; j++) {
                                                    const li = listItems[j];
                                                    const liRect = li.getBoundingClientRect();
                                                    const liRelativeBottom = liRect.bottom - pageRect.top;

                                                    if (liRelativeBottom > limit) {
                                                        itemSplitIndex = j;
                                                        break;
                                                    }
                                                }

                                                if (itemSplitIndex >= 0) {
                                                    const liDom = listItems[itemSplitIndex];
                                                    const liPos = editorView.posAtDOM(liDom, 0);
                                                    splitPos = liPos;
                                                } else {
                                                    splitPos = childPos;
                                                }
                                            } else {
                                                splitPos = childPos;
                                            }

                                            break;
                                        }
                                    }

                                    // If we found a split point
                                    if (splitPos !== -1) {
                                        const pageEndPos = page.pos + page.node.nodeSize - 1;
                                        const from = splitPos;
                                        const to = pageEndPos;

                                        // Guard: Invalid Range or Moving Nothing
                                        if (to <= from) {
                                            console.warn("Pagination: Invalid split range (from >= to). Aborting to prevent loop.");
                                            continue; // Skip this page, try next?
                                        }

                                        // Guard: Moving the start of the page? (Infinite loop risk if single block)
                                        const pageStartContent = page.pos + 1;
                                        if (from <= pageStartContent) {
                                            // Ensure specific check for single-child pages logic we already have?
                                            // But if we split a List, from > pageStartContent (hopefully).
                                            // If the FIRST item of the list overflows, from == pageStartContent.
                                            // Then we MUST move the whole list.
                                            // If the list is the ONLY thing on the page? Loop.
                                            // We need to allow moving it if there is a next page?
                                            // No, if it's the only thing, moving it to next page leaves this page Empty (then deleted) -> Infinite flicker?
                                            // Or moves to Next Page, which Overflows -> Next Page...
                                            // Current limitation: Cannot split huge blocks > 1 page.
                                            // We accept this for now.
                                        }

                                        const slice = state.doc.slice(from, to);

                                        // Guard: Empty Slice
                                        if (slice.size === 0) {
                                            console.warn("Pagination: Empty slice. Aborting.");
                                            continue;
                                        }

                                        const nextPagePos = page.pos + page.node.nodeSize;
                                        let hasNextPage = false;
                                        if (nextPagePos < doc.content.size) {
                                            const nextNode = doc.nodeAt(nextPagePos);
                                            if (nextNode && nextNode.type.name === 'page') hasNextPage = true;
                                        }

                                        if (hasNextPage) {
                                            tr.delete(from, to);
                                            const newTarget = tr.mapping.map(nextPagePos + 1);
                                            tr.insert(newTarget, slice.content);
                                        } else {
                                            const newPage = state.schema.nodes.page.create(null, slice.content);
                                            tr.insert(nextPagePos, newPage);
                                            tr.delete(from, to);
                                        }

                                        modified = true;
                                        break; // One change per tick
                                    } else {
                                        // Could not find split point but height > threshold?
                                        // Maybe big padding or simple overflow.
                                        // Fallback: Move last child.
                                        // (Original logic)
                                        // Safety: If Page has only 1 child, we CANNOT move it (it will loop forever).
                                        if (page.node.childCount <= 1) {
                                            // TODO: Implement Split Logic here later.
                                            // For now, ignore to prevent freeze.
                                            console.warn('Page overflow with single giant block - cannot split yet.');
                                            continue;
                                        }

                                        const lastChild = page.node.lastChild;
                                        const pageEndPos = page.pos + page.node.nodeSize - 1;
                                        const contentSize = lastChild.nodeSize;
                                        const from = pageEndPos - contentSize;
                                        const to = pageEndPos;

                                        const nextPagePos = page.pos + page.node.nodeSize;
                                        let hasNextPage = false;
                                        if (nextPagePos < doc.content.size) {
                                            const nextNode = doc.nodeAt(nextPagePos);
                                            if (nextNode && nextNode.type.name === 'page') {
                                                hasNextPage = true;
                                            }
                                        }

                                        if (hasNextPage) {
                                            // Move to next page
                                            // Delete then insert at mapped pos
                                            tr.delete(from, to);
                                            const newTarget = tr.mapping.map(nextPagePos + 1);
                                            tr.insert(newTarget, lastChild);
                                        } else {
                                            // Create New Page
                                            const newPage = state.schema.nodes.page.create(null, lastChild);
                                            tr.insert(nextPagePos, newPage);
                                            tr.delete(from, to);
                                        }

                                        modified = true;
                                        break; // One change per tick
                                    }
                                }
                            }
                        }

                        // 3. Check for Underflow (Fix "Reflow/Delete Page" issue)
                        // If a page has space, try to pull content from the next page.
                        for (let i = 0; i < pages.length - 1; i++) {
                            const page = pages[i];
                            const nextPage = pages[i + 1];

                            const dom = editorView.nodeDOM(page.pos);
                            if (dom && dom instanceof HTMLElement) {
                                const height = dom.offsetHeight;
                                const availableSpace = threshold - height;

                                // Check next page first child
                                const nextPageDom = editorView.nodeDOM(nextPage.pos);
                                if (nextPageDom && nextPageDom instanceof HTMLElement) {
                                    // We need to measure the *first block* of the next page.
                                    // But nextPageDom is the Page Div. Its children are the blocks.
                                    // We can target the DOM first child node.
                                    // Be careful with TextNodes/Comments in DOM.
                                    const firstBlockDom = nextPageDom.firstElementChild;

                                    if (firstBlockDom) {
                                        const blockHeight = firstBlockDom.offsetHeight;

                                        // Buffer: Ensure we don't rapid loop (Pull -> Push).
                                        // Only pull if we have SIGNIFICANT space.
                                        // Tables need extra buffer as they render unpredictably.
                                        const isTable = nextPage.node.firstChild && nextPage.node.firstChild.type.name === 'table';
                                        const buffer = isTable ? 100 : 50; // Increased buffer from 20 to 50/100

                                        if (blockHeight < (availableSpace - buffer)) {
                                            // IT FITS! Pull it.
                                            // Move first child of Next Page to End of Current Page.
                                            const firstChildNode = nextPage.node.firstChild;
                                            if (!firstChildNode) continue;

                                            // Positions
                                            const insertPos = page.pos + page.node.nodeSize - 1; // End of current page
                                            const removePos = nextPage.pos + 1; // Start of next page content
                                            const size = firstChildNode.nodeSize;

                                            // Move
                                            // Delete then Insert is safe IF insertPos < removePos.
                                            // Yes, Page 1 end < Page 2 start.

                                            tr.delete(removePos, removePos + size);
                                            tr.insert(insertPos, firstChildNode);

                                            modified = true;
                                            break; // One move per tick
                                        }
                                    }
                                }
                            }
                        }

                        if (modified) {
                            dispatch(tr);
                        }

                        checking = false;
                    };

                    // Initial check
                    requestAnimationFrame(checkPagination);

                    return {
                        update(view, prevState) {
                            const sizeDiff = view.state.doc.content.size - prevState.doc.content.size;
                            // Heuristic: If content size changed significantly (Delete OR Paste/AI),
                            // Trigger Cooldown to prevent immediate re-pagination fighting.
                            // Large inserts (like AI tables) need time to render height correctly.
                            if (sizeDiff < -2 || sizeDiff > 20) {
                                isCoolingDown = true;
                                if (cooldownTimer) clearTimeout(cooldownTimer);
                                cooldownTimer = setTimeout(() => {
                                    isCoolingDown = false;
                                    checkPagination(); // Re-check after cooldown
                                }, 1500); // 1.5s Cooldown
                            }

                            if (!prevState.doc.eq(view.state.doc)) {
                                if (debouncedCheck) clearTimeout(debouncedCheck);
                                debouncedCheck = setTimeout(() => {
                                    checkPagination();
                                }, 500);
                            }
                        },
                        destroy() {
                            if (debouncedCheck) clearTimeout(debouncedCheck);
                            if (cooldownTimer) clearTimeout(cooldownTimer);
                        }
                    };
                }
            })
        ];
    },
});
