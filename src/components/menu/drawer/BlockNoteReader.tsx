/* BlockNote-editor is uitgesteld tot volgende iteratie.
 *
 * @blocknote/mantine vereist @mantine/core als peer-dep (de mantineStyles.css
 * doet @import url("@mantine/core/styles/Stack.css") etc.). Dat is niet in
 * onze stack en de full Mantine UI-bundle (~150kB) is overkill voor een
 * lees-only viewer.
 *
 * De `gerechten.beschrijving_blocks` JSONB-kolom (migration 014) blijft
 * bestaan zodat we later naadloos kunnen switchen — naar @blocknote/shadcn
 * (matches onze stack) of een lichtere editor zoals TipTap-vanilla. Voor
 * nu: best-effort plain-text extractie uit blocks-tree.
 */

'use client';

interface Props {
    blocks: unknown[];
}

interface BlockNoteNode {
    type?: string;
    content?: Array<{ text?: string } | string> | string;
    children?: BlockNoteNode[];
}

function extractText(node: BlockNoteNode): string {
    let out = '';
    if (typeof node.content === 'string') {
        out += node.content;
    } else if (Array.isArray(node.content)) {
        for (const c of node.content) {
            if (typeof c === 'string') out += c;
            else if (c && typeof c === 'object' && 'text' in c && typeof c.text === 'string') out += c.text;
        }
    }
    if (Array.isArray(node.children)) {
        for (const child of node.children) {
            out += '\n' + extractText(child);
        }
    }
    return out;
}

export default function BlockNoteReader({ blocks }: Props) {
    const text = blocks
        .map((b) => (b && typeof b === 'object' ? extractText(b as BlockNoteNode) : ''))
        .filter(Boolean)
        .join('\n\n');

    if (!text.trim()) return null;
    return (
        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text)' }}>
            {text}
        </div>
    );
}
