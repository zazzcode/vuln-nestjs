import { renderFile } from 'ejs';
import path from 'node:path';
import { VIEWS_DIRECTORY } from './views.service.js';

/** The fixed template a notice is rendered from. The input is data, never the template. */
export const NOTICE_TEMPLATE = 'announcement-notice';

/** What a notice is made from. */
export interface NoticeInput {
  title: string;
  body: string;
}

/** Renders the notice from the fixed template, with the input as data. */
export function renderNotice(input: NoticeInput): Promise<string> {
  return renderFile(path.join(VIEWS_DIRECTORY, `${NOTICE_TEMPLATE}.ejs`), {
    title: input.title,
    body: input.body,
  });
}

/** The same notice as plain text, built in process: no template engine, no process. */
export function plainNotice(input: NoticeInput): string {
  return `${input.title}\n\n${input.body}\n— VCX\n`;
}
