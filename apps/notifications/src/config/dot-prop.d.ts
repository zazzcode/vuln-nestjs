/**
 * The four functions of `dot-prop` 4.1.0 this service calls. The package
 * ships no types of its own, and one more dependency for four one-line
 * declarations would be another entry in every audit.
 */
declare module 'dot-prop' {
  const dotProp: {
    get(object: unknown, path: string): unknown;
    set(object: unknown, path: string, value: unknown): unknown;
    has(object: unknown, path: string): boolean;
    delete(object: unknown, path: string): void;
  };
  export default dotProp;
}
