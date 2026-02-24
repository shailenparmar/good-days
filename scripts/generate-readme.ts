// Generates README.md from the shared about copy.
// Run: npx tsx scripts/generate-readme.ts

import { ABOUT_COPY } from '../src/shared/copy/aboutCopy';
import { writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const privacyParagraphs = [...ABOUT_COPY.privacy.paragraphs, ABOUT_COPY.privacy.lastParagraph].join('\n\n');
const featuresParagraphs = ABOUT_COPY.features.paragraphs.join('\n\n').replace(/\[icon:\w+\]\s?/g, '');
const systemParagraphs = ABOUT_COPY.system.paragraphs.join('\n\n');

const readme = `# [good days](https://gdays.day)

${ABOUT_COPY.welcome}

## ${ABOUT_COPY.features.header.replace(':', '')}

${featuresParagraphs}

## ${ABOUT_COPY.privacy.header.replace(':', '')}

${privacyParagraphs}

## ${ABOUT_COPY.system.header.replace(':', '')}

${systemParagraphs}

---

${ABOUT_COPY.closing}

${ABOUT_COPY.copyright}

---

## good days pro

good days pro is the native mac app. no browser intermediary, every word saved directly to hardware. it's called pro for a reason.

entries, passwords, and colorways never leave your hardware. a developer couldn't read your journal even if they wanted to. as a privacy guarantee, the entire product is open source.

beam rc colorways with gdays.day in your phone's browser.

good days pro for macos. designed by shailen on earth, 2026.
`;

writeFileSync(resolve(root, 'README.md'), readme);
console.log('README.md generated from aboutCopy.ts');
