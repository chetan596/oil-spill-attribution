const puppeteer = require('C:/Users/cheta/.gemini/antigravity-ide/brain/c148ac0e-0e5c-4653-9e17-e600631cf18c/scratch/node_modules/puppeteer-core');
const path = require('path');
const fs = require('fs');

async function buildFinalPdfReport() {
  console.log('Generating Ocean Guard AI Final End-to-End QA Report PDF...');
  const repoRoot = path.join(__dirname, '..');
  const templatePath = path.join(repoRoot, 'docs', 'report_template.html');
  const reportsDir = path.join(repoRoot, 'docs', 'reports');
  const outputPath = path.join(reportsDir, 'Ocean_Guard_AI_Final_End_to_End_QA_Report.pdf');

  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }

  let htmlContent = fs.readFileSync(templatePath, 'utf8');

  // Update title and headers to match Final End-to-End QA Report
  htmlContent = htmlContent.replace(
    '<title>Ocean Guard AI — Prototype Technical Report (SIH 26143)</title>',
    '<title>Ocean Guard AI — Final End-to-End QA & System Verification Report (SIH 26143)</title>'
  );

  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
  console.log('Launching Edge browser at:', edgePath);

  const browser = await puppeteer.launch({
    executablePath: edgePath,
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1600, deviceScaleFactor: 2 });

  console.log('Setting HTML content in page...');
  await page.setContent(htmlContent, {
    waitUntil: ['load', 'networkidle0'],
    timeout: 120000
  });

  console.log('Printing to PDF...');
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: {
      top: '16mm',
      bottom: '18mm',
      left: '14mm',
      right: '14mm'
    },
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate: `
      <div style="font-size: 7.5pt; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #94A3B8; width: 100%; padding: 0 14mm; display: flex; justify-content: space-between; border-top: 1px solid #E2E8F0; padding-top: 4px;">
        <span>Ocean Guard AI · SIH 26143 · Final End-to-End QA Report</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>
    `
  });

  await browser.close();
  const stat = fs.statSync(outputPath);
  console.log(`\n================================================================`);
  console.log(`SUCCESS: PDF Generated at: ${outputPath}`);
  console.log(`PDF Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB (${stat.size} bytes)`);
  console.log(`================================================================`);
}

buildFinalPdfReport().catch(err => {
  console.error('Fatal PDF generation error:', err);
  process.exit(1);
});
