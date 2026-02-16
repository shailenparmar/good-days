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

## ${ABOUT_COPY.privacy.header.replace(':', '')}

${privacyParagraphs}

## ${ABOUT_COPY.features.header.replace(':', '')}

${featuresParagraphs}

## ${ABOUT_COPY.system.header.replace(':', '')}

${systemParagraphs}

---

${ABOUT_COPY.closing}

${ABOUT_COPY.signature}
`;

writeFileSync(resolve(root, 'README.md'), readme);
console.log('README.md generated from aboutCopy.ts');
