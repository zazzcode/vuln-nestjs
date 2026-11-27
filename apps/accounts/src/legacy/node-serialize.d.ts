/** The types of the legacy settings format, as far as this service uses them. */
declare module 'node-serialize' {
  export function serialize(value: unknown): string;
  export function unserialize(text: string): Record<string, unknown>;
}
