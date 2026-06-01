/* Geïsoleerde BlockNote-viewer — top-level CSS-import voor Next.js bundler
 * + dynamic-loaded vanuit BeschrijvingBlocksView met ssr:false. Hele bundle
 * (editor + mantine + prosemirror) laadt alleen wanneer een gerecht met
 * beschrijving_blocks geopend wordt.
 */

'use client';

import '@blocknote/mantine/style.css';
import { useCreateBlockNote } from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';

interface Props {
    blocks: unknown[];
}

export default function BlockNoteReader({ blocks }: Props) {
    const editor = useCreateBlockNote({
        initialContent: blocks as never,
    });
    return (
        <BlockNoteView
            editor={editor}
            editable={false}
            theme="dark"
            sideMenu={false}
            slashMenu={false}
            formattingToolbar={false}
        />
    );
}
