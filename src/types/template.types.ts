// =============================================
// PDF Template Builder — Block Type System
// =============================================

// ── Base Block ──
export interface TemplateBlockBase {
  id: string;
  type: string;
  x?: number;       // mm from left page edge
  y?: number;       // mm from top page edge
  width?: number;   // mm (undefined = full content width)
  height?: number;  // mm (undefined = auto-fit)
  zIndex?: number;  // stacking order (higher = on top)
  locked?: boolean;
  conditions?: BlockCondition[];
}

export interface BlockCondition {
  field: string; // e.g. 'document_type'
  operator: 'eq' | 'neq' | 'exists';
  value?: string;
}

// ── Block Types ──

export interface LogoBlock extends TemplateBlockBase {
  type: 'logo';
  variant: 'light' | 'dark';
  maxWidth: number; // mm
  maxHeight: number;
  alignment: 'left' | 'center' | 'right';
}

export interface TextBlock extends TemplateBlockBase {
  type: 'text';
  content: string; // supports {{variable}} syntax
  fontSize: number; // pt
  fontWeight: 'normal' | 'bold';
  fontStyle: 'normal' | 'italic';
  color: string; // hex or 'brand_primary' | 'brand_accent'
  alignment: 'left' | 'center' | 'right';
  lineHeight: number;
}

export interface ClientInfoBlock extends TemplateBlockBase {
  type: 'client_info';
  fields: ClientInfoField[];
  layout: 'stacked' | 'two-column'; // stacked = labels above, two-column = side by side with doc info
}

export interface ClientInfoField {
  key: string; // variable key
  label: string;
  bold: boolean;
  visible: boolean;
}

export interface DocumentBadgeBlock extends TemplateBlockBase {
  type: 'document_badge';
  text: string; // e.g. "F A C T U U R" or "{{document_type}}"
  backgroundColor: string;
  textColor: string;
  fontSize: number;
}

export interface ItemsTableBlock extends TemplateBlockBase {
  type: 'items_table';
  columns: TableColumn[];
  headerStyle: {
    backgroundColor: string;
    textColor: string;
    fontSize: number;
  };
  bodyStyle: {
    fontSize: number;
    textColor: string;
    alternateRowColor?: string;
  };
  showGridLines: boolean;
}

export interface TableColumn {
  key: string; // 'omschrijving' | 'qty' | 'prijs' | 'btw' | 'totaal'
  label: string;
  width: number; // percentage
  alignment: 'left' | 'center' | 'right';
}

export interface MenuBlock extends TemplateBlockBase {
  type: 'menu';
  layout: '1col' | '2col';
  gangTitleStyle: {
    fontSize: number;
    fontWeight: 'normal' | 'bold';
    color: string;
    alignment: 'left' | 'center';
    uppercase: boolean;
  };
  dishNameStyle: {
    fontSize: number;
    color: string;
  };
  dishDescStyle: {
    fontSize: number;
    color: string;
    fontStyle: 'normal' | 'italic';
  };
  showDescriptions: boolean;
  gangSeparator: 'line' | 'space' | 'none';
}

export interface TotalsBlock extends TemplateBlockBase {
  type: 'totals';
  showSubtotaal: boolean;
  showBtw: boolean;
  showTotaal: boolean;
  totalBarColor: string;
  alignment: 'left' | 'right';
  fontSize: number;
}

export interface PaymentDetailsBlock extends TemplateBlockBase {
  type: 'payment_details';
  content: string; // template string with {{iban}}, {{betaalvoorwaarden}}
  backgroundColor: string;
  borderColor: string;
  fontSize: number;
}

export interface DividerBlock extends TemplateBlockBase {
  type: 'divider';
  style: 'solid' | 'dashed' | 'dotted';
  color: string;
  thickness: number;
}

export interface SpacerBlock extends TemplateBlockBase {
  type: 'spacer';
  height: number; // mm
}

export interface ImageBlock extends TemplateBlockBase {
  type: 'image';
  src: string; // URL or variable like {{receipt_image}}
  maxWidth: number;
  maxHeight: number;
  alignment: 'left' | 'center' | 'right';
}

export interface FooterBlock extends TemplateBlockBase {
  type: 'footer';
  content: string; // with {{variables}}
  fontSize: number;
  color: string;
  alignment: 'left' | 'center' | 'right';
  showTopBorder: boolean;
  borderColor: string;
}

export interface HaccpTableBlock extends TemplateBlockBase {
  type: 'haccp_table';
  columns: TableColumn[];
  headerColor: string;
  statusColors: {
    ok: string;
    warn: string;
    danger: string;
  };
}

// ── Discriminated Union ──
export type TemplateBlock =
  | LogoBlock
  | TextBlock
  | ClientInfoBlock
  | DocumentBadgeBlock
  | ItemsTableBlock
  | MenuBlock
  | TotalsBlock
  | PaymentDetailsBlock
  | DividerBlock
  | SpacerBlock
  | ImageBlock
  | FooterBlock
  | HaccpTableBlock;

// ── Page Settings ──
export interface PageSettings {
  format: 'a4' | 'letter';
  orientation: 'portrait' | 'landscape';
  margins: {
    top: number;
    right: number;
    bottom: number;
    left: number;
  };
  backgroundColor: string; // hex, e.g. '#ffffff' or '#121212' for menukaart
}

// ── Template ──
export interface PdfTemplate {
  id: string;
  organization_id: string | null;
  document_type: 'factuur' | 'offerte' | 'menukaart' | 'haccp' | 'bon';
  name: string;
  description: string;
  blocks: TemplateBlock[];
  page_settings: PageSettings;
  layout_mode?: 'flow' | 'absolute'; // 'flow' = legacy vertical, 'absolute' = 2D WYSIWYG
  is_default: boolean;
  is_active: boolean;
  version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// ── Block Palette Definition ──
export interface BlockPaletteItem {
  type: TemplateBlock['type'];
  label: string;
  icon: string; // Lucide icon name
  category: 'layout' | 'content' | 'data' | 'special';
  defaultBlock: Record<string, unknown>;
  availableIn: PdfTemplate['document_type'][];
}

// ── Render Context ──
export interface RenderContext {
  variables: Record<string, string>;
  branding: {
    logoUrl: string | null;
    logoDarkUrl: string | null;
    primaryColor: string;
    accentColor: string;
    primaryRgb: [number, number, number];
    accentRgb: [number, number, number];
  };
  data: {
    items?: Array<{ omschrijving: string; qty: number; prijs: number; btw: number }>;
    menuSelectie?: Record<string, string[]>;
    haccpRecords?: Array<{ wat: string; temp: number; type: string; status: string; tijd: string }>;
  };
  documentType: PdfTemplate['document_type'];
}
