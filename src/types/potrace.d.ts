declare module 'potrace' {
  interface TraceOptions {
    color?: string;
    background?: string;
    threshold?: number;
    turdSize?: number;
    optTolerance?: number;
    turnPolicy?: string;
    blackOnWhite?: boolean;
  }
  export function trace(input: Buffer | string, options: TraceOptions, cb: (err: Error | null, svg: string) => void): void;
  export function trace(input: Buffer | string, cb: (err: Error | null, svg: string) => void): void;
  export function posterize(input: Buffer | string, options: TraceOptions, cb: (err: Error | null, svg: string) => void): void;
  export class Potrace {}
  export class Posterizer {}
}
