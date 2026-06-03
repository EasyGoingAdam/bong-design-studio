/**
 * Local type shim for the `text-to-svg` npm package — it ships no types.
 * Only declares the surface we actually call (loadSync, getPath, getMetrics).
 * Extend as needed if we start using more of its API.
 */
declare module 'text-to-svg' {
  export interface TextToSvgOptions {
    x?: number;
    y?: number;
    fontSize?: number;
    anchor?: string; // 'left top' | 'left baseline' | 'center middle' | ...
    attributes?: Record<string, string>;
    kerning?: boolean;
    letterSpacing?: number;
    tracking?: number;
  }

  export interface TextMetrics {
    x: number;
    y: number;
    baseline: number;
    width: number;
    height: number;
    ascender: number;
    descender: number;
  }

  export default class TextToSVG {
    static loadSync(file?: string): TextToSVG;
    static load(file: string, cb: (err: Error | null, tts: TextToSVG) => void): void;
    getPath(text: string, options?: TextToSvgOptions): string;
    getD(text: string, options?: TextToSvgOptions): string;
    getSVG(text: string, options?: TextToSvgOptions): string;
    getMetrics(text: string, options?: TextToSvgOptions): TextMetrics;
  }
}
