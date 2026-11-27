/** A query as a tag built it: the text with a `?` where each value was, and the values themselves. */
export interface TaggedSql {
  readonly text: string;
  readonly values: readonly unknown[];
}

/**
 * The tag that parameterizes: the values never become SQL text. Used with
 * `dataSource.query(tagged.text, tagged.values)`, or with the driver's
 * `execute()` for a prepared statement.
 */
export function sql(
  text: TemplateStringsArray,
  ...values: unknown[]
): TaggedSql {
  return { text: text.join('?'), values };
}
