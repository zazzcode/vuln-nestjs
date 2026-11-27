#!/usr/bin/env node
// The notifier command of the notifications service. It prints the notice it
// was asked to send, as plain text, one value per argument:
//   node scripts/notify.js --title <title> --body <body> --url <url>

const args = process.argv.slice(2);

const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at >= 0 && at + 1 < args.length ? args[at + 1] : '';
};

process.stdout.write(
  `${valueOf('--title')}\n\n${valueOf('--body')}\n→ ${valueOf('--url')}\n`,
);
