import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  try {
    const doc = await pdfjsLib.getDocument({ url: 'test-plan.pdf' }).promise;
    const page = await doc.getPage(1);
    const opList = await page.getOperatorList();
    console.log(`Number of operators: ${opList.fnArray.length}`);
    
    // Count different operators
    const counts = {};
    opList.fnArray.forEach(fnId => {
      counts[fnId] = (counts[fnId] || 0) + 1;
    });
    console.log('Operator counts:', counts);
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
