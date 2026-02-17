/**
 * PDF Scraper
 *
 * Extracts text from PDF reports so it can be fed through the analysis pipeline.
 *
 * Use case: analysts have PDF reports from organizations like FATF (financial crime),
 * EU terrorism situation reports, Amnesty International, Human Rights Watch, etc.
 * These reports often contain entity names, organization connections, and financial
 * trail data that the entity extractor and cross-referencer can pick up.
 *
 * Usage:
 *   node src/index.js "Org Name" --pdf "/path/to/report.pdf"
 *
 * The extracted text flows into: language detection → translation → entity extraction
 * → cross-referencing. All the detective logic works on PDF content automatically.
 */

const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');

/**
 * Extract text content from a single PDF file.
 *
 * @param {string} filePath - Path to the PDF file
 * @returns {Object} { success, text, pageCount, source, sourceUrl, filePath, metadata, error }
 */
async function extractFromPDF(filePath) {
  // Resolve to absolute path
  const absolutePath = path.resolve(filePath);
  const fileName = path.basename(absolutePath);

  // Check if file exists
  if (!fs.existsSync(absolutePath)) {
    return {
      success: false,
      text: '',
      pageCount: 0,
      source: `PDF: ${fileName}`,
      sourceUrl: `file:///${absolutePath.replace(/\\/g, '/')}`,
      filePath: absolutePath,
      metadata: {},
      error: `File not found: ${absolutePath}`,
    };
  }

  try {
    // Read the PDF file
    const dataBuffer = fs.readFileSync(absolutePath);

    // Parse the PDF
    const data = await pdfParse(dataBuffer);

    return {
      success: true,
      text: data.text || '',
      pageCount: data.numpages || 0,
      source: `PDF: ${fileName}`,
      sourceUrl: `file:///${absolutePath.replace(/\\/g, '/')}`,
      filePath: absolutePath,
      metadata: {
        title: data.info?.Title || '',
        author: data.info?.Author || '',
        creationDate: data.info?.CreationDate || '',
        pageCount: data.numpages || 0,
        fileSize: dataBuffer.length,
      },
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      text: '',
      pageCount: 0,
      source: `PDF: ${fileName}`,
      sourceUrl: `file:///${absolutePath.replace(/\\/g, '/')}`,
      filePath: absolutePath,
      metadata: {},
      error: `Failed to parse PDF: ${error.message}`,
    };
  }
}

/**
 * Extract text from multiple PDF files.
 *
 * @param {string[]} filePaths - Array of file paths
 * @returns {Object} { results, totalPages, successCount, errorCount }
 */
async function extractFromMultiplePDFs(filePaths) {
  const results = [];

  for (const filePath of filePaths) {
    console.log(`  Extracting: ${path.basename(filePath)}...`);
    const result = await extractFromPDF(filePath);
    results.push(result);

    if (result.success) {
      console.log(`    ${result.pageCount} pages, ${result.text.length} characters extracted`);
    } else {
      console.log(`    Error: ${result.error}`);
    }
  }

  return {
    results,
    totalPages: results.reduce((sum, r) => sum + r.pageCount, 0),
    successCount: results.filter((r) => r.success).length,
    errorCount: results.filter((r) => !r.success).length,
  };
}

module.exports = {
  extractFromPDF,
  extractFromMultiplePDFs,
};
