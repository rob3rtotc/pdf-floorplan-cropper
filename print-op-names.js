import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  try {
    const OPS = pdfjsLib.OPS;
    // Print mapping for our counts
    const doc = await pdfjsLib.getDocument({ url: 'test-plan.pdf' }).promise;
    const page = await doc.getPage(1);
    const opList = await page.getOperatorList();
    
    // Count names
    const counts = {};
    opList.fnArray.forEach(fnId => {
      let name = 'UNKNOWN';
      for (const key in OPS) {
        if (OPS[key] === fnId) {
          name = key;
          break;
        }
      }
      const label = `${fnId} (${name})`;
      counts[label] = (counts[label] || 0) + 1;
    });
    console.log('Operator counts with names:', counts);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
