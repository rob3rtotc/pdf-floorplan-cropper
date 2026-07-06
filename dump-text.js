import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

async function main() {
  try {
    const doc = await pdfjsLib.getDocument({ url: 'test-plan.pdf' }).promise;
    console.log(`Number of pages: ${doc.numPages}`);
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    console.log(`Found ${textContent.items.length} text items:`);
    
    // Log first 150 items to see what they contain
    textContent.items.forEach((item, idx) => {
      if (item.str && item.str.trim()) {
        console.log(`[${idx}] "${item.str}" x=${item.transform[4].toFixed(1)} y=${item.transform[5].toFixed(1)}`);
      }
    });
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
