// =============================================
// CDN Library Type Declarations
// =============================================

// CSS imports
declare module '*.css';

// jsPDF (loaded via CDN)
declare namespace jspdf {
  class jsPDF {
    constructor(options?: {
      orientation?: 'portrait' | 'landscape';
      unit?: string;
      format?: string | number[];
    });
    text(text: string, x: number, y: number, options?: Record<string, unknown>): jsPDF;
    setFontSize(size: number): jsPDF;
    setFont(fontName: string, fontStyle?: string): jsPDF;
    setTextColor(r: number, g?: number, b?: number): jsPDF;
    setDrawColor(r: number, g?: number, b?: number): jsPDF;
    setFillColor(r: number, g?: number, b?: number): jsPDF;
    rect(x: number, y: number, w: number, h: number, style?: string): jsPDF;
    line(x1: number, y1: number, x2: number, y2: number): jsPDF;
    addPage(): jsPDF;
    save(filename: string): void;
    output(type: string): string;
    internal: {
      getNumberOfPages(): number;
      pageSize: { getWidth(): number; getHeight(): number };
    };
    autoTable(options: Record<string, unknown>): jsPDF;
    lastAutoTable?: { finalY: number };
  }
}

declare interface Window {
  jspdf?: typeof jspdf;
  tailwind?: {
    config: Record<string, unknown>;
  };
}

// Tailwind CSS CDN
declare const tailwind: {
  config: Record<string, unknown>;
} | undefined;
