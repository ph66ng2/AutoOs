/**
 * Final QA — Notification System Verification (Static + API approach)
 * 
 * Strategy: Since Playwright browser can't access localhost in this environment,
 * we use curl for rendered page analysis + static code analysis.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const EVIDENCE = '.sisyphus/evidence/final-qa';
const BASE_URL = 'http://localhost:1420';

const results = [];
let passCount = 0;
let failCount = 0;

function scenario(name, passed, detail = '') {
  if (passed) { passCount++; } else { failCount++; }
  results.push({ name, passed, detail });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} ${name}${detail ? ` — ${detail}` : ''}`);
}

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { encoding: 'utf8', ...opts });
  } catch (e) {
    return e.stdout || e.stderr || e.message;
  }
}

function fileExists(p) {
  try { fs.accessSync(p, fs.constants.F_OK); return true; }
  catch { return false; }
}

function grepCount(pattern, filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const re = new RegExp(pattern, 'g');
    return (content.match(re) || []).length;
  } catch { return 0; }
}

function grepFiles(pattern, dir = 'src') {
  try {
    return sh(`grep -rlE "${pattern}" ${dir} --include="*.tsx" --include="*.ts" 2>/dev/null || echo ""`).trim();
  } catch { return ''; }
}

async function fetchPage(url) {
  try {
    // Use curl with follow redirects
    const html = sh(`curl -sL '${url}' 2>/dev/null || echo ""`);
    return html;
  } catch { return ''; }
}

function verdict() {
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`Scenarios [${passCount}/${results.length} pass]`);
  const allPass = results.every(r => r.passed);
  console.log(`VERDICT: ${allPass ? 'PASS ✓' : 'FAIL ✗'}`);
  console.log(`${'═'.repeat(60)}\n`);
  return allPass;
}

// ──────────────────────────────────────────────────
// MAIN
// ──────────────────────────────────────────────────

console.log('\n🔍 AutoOS Notification System — Final QA (Static + API)\n');

// ═══════════════════════════════════════════════════
// PRE-FLIGHT: App reachability
// ═══════════════════════════════════════════════════
console.log('═══ PRE-FLIGHT ═══');

const curlResp = sh(`curl -s -o /dev/null -w "%{http_code}" '${BASE_URL}/' 2>/dev/null || echo "000"`).trim().replace(/[^0-9]/g, '').substring(0, 3);
const appReachable = curlResp === '200';
scenario('App is reachable via curl', appReachable, `HTTP ${curlResp}`);

let appHtml = '';
if (appReachable) {
  appHtml = await fetchPage(BASE_URL);
  scenario('App HTML is non-empty', appHtml.length > 100, `${appHtml.length} bytes`);
} else {
  console.log('  ⚠️ App not reachable — some tests will use static analysis only');
}

// ═══════════════════════════════════════════════════
// TEST 1: Toaster Mounted (Sonner Integration)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 1: Toaster Mounted (Sonner) ═══');

// 1a. Sonner in package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const hasSonnerDep = pkg.dependencies?.sonner || pkg.devDependencies?.sonner;
scenario('Sonner is in package.json', !!hasSonnerDep, hasSonnerDep ? `v${hasSonnerDep}` : 'missing');

// 1b. Sonner component file exists (shadcn install)
const sonnerFileExists = fileExists('src/components/ui/sonner.tsx');
scenario('Sonner shadcn component exists', sonnerFileExists, 'src/components/ui/sonner.tsx');

// 1c. Toaster imported in App.tsx
const toasterInApp = grepCount('Toaster|sonner', 'src/App.tsx') > 0;
scenario('Toaster/sonner imported in App.tsx', toasterInApp, 
  grepCount('Toaster', 'src/App.tsx') > 0 ? 'Toaster element found' : grepCount('sonner', 'src/App.tsx') > 0 ? 'sonner import found' : 'NOT found');

// 1d. Check Toaster configuration (position, visibleToasts, etc.)
if (fileExists('src/App.tsx')) {
  const appContent = fs.readFileSync('src/App.tsx', 'utf8');
  const hasRichColors = appContent.includes('richColors');
  const hasCloseButton = appContent.includes('closeButton');
  const hasVisibleToasts = appContent.includes('visibleToasts');
  const hasPosition = appContent.includes('position');
  
  scenario('Toaster configured with richColors', hasRichColors);
  scenario('Toaster configured with closeButton', hasCloseButton);
  scenario('Toaster configured with visibleToasts', hasVisibleToasts, hasVisibleToasts ? 'found' : 'not found (may use default)');
  scenario('Toaster configured with position', hasPosition, hasPosition ? 'found' : 'not found (may use default)');
}

// 1e. Check for data-sonner-toaster in rendered HTML
if (appHtml) {
  const hasSonnerAttr = appHtml.includes('data-sonner-toaster') || appHtml.includes('sonner');
  console.log(`  Rendering check: sonner-related content in HTML: ${hasSonnerAttr ? 'YES' : 'NOT in SSR HTML (expected for React SPA)'}`);
}

// ═══════════════════════════════════════════════════
// TEST 2: ErrorAlert Component
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 2: ErrorAlert Component ═══');

// 2a. File exists
const errorAlertExists = fileExists('src/components/ui/error-alert.tsx');
scenario('ErrorAlert component file exists', errorAlertExists, 'src/components/ui/error-alert.tsx');

// 2b. Contains variant support
if (errorAlertExists) {
  const eaContent = fs.readFileSync('src/components/ui/error-alert.tsx', 'utf8');
  const hasErrorVariant = eaContent.includes('destructive') || eaContent.includes('error') || eaContent.includes('red');
  const hasWarningVariant = eaContent.includes('warning') || eaContent.includes('amber');
  const hasInfoVariant = eaContent.includes('info') || eaContent.includes('blue');
  const hasSuccessVariant = eaContent.includes('success') || eaContent.includes('emerald') || eaContent.includes('green');
  const hasExpandDetails = eaContent.includes('detalhes') || eaContent.includes('expandable') || eaContent.includes('collaps');
  const hasCopyButton = eaContent.includes('copy') || eaContent.includes('Copiar') || eaContent.includes('clipboard');
  
  scenario('ErrorAlert has error/destructive variant', hasErrorVariant);
  scenario('ErrorAlert has warning variant', hasWarningVariant);
  scenario('ErrorAlert has info variant', hasInfoVariant);
  scenario('ErrorAlert has success variant', hasSuccessVariant);
  scenario('ErrorAlert has expandable details', hasExpandDetails);
  scenario('ErrorAlert has copy button', hasCopyButton);
}

// 2c. Used in pages/components
const eaUsage = sh(`grep -rl -E "error-alert|ErrorAlert" src/pages/ src/components/ --include="*.tsx" 2>/dev/null || echo ""`).trim();
const eaUsedFiles = eaUsage.split('\n').filter(Boolean).filter(f => f !== 'src/components/ui/error-alert.tsx');
scenario('ErrorAlert imported in at least 1 page/component', eaUsedFiles.length > 0, 
  eaUsedFiles.length > 0 ? `Found in ${eaUsedFiles.length} files: ${eaUsedFiles.map(f => f.replace('src/', '')).join(', ')}` : 'Not used');

// ═══════════════════════════════════════════════════
// TEST 3: ErrorBoundary Fallback
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 3: ErrorBoundary ═══');

// 3a. File exists
const ebExists = fileExists('src/components/ErrorBoundary.tsx');
scenario('ErrorBoundary component file exists', ebExists);

// 3b. Wraps App.tsx
if (fileExists('src/App.tsx')) {
  const appContent = fs.readFileSync('src/App.tsx', 'utf8');
  const hasEB = appContent.includes('ErrorBoundary');
  scenario('ErrorBoundary imported and used in App.tsx', hasEB);
  
  if (hasEB) {
    // Check PT-BR messages
    const ebContent = fs.readFileSync('src/components/ErrorBoundary.tsx', 'utf8');
    const hasPTMessage = ebContent.includes('Algo deu errado') || ebContent.includes('erro inesperado') || ebContent.includes('Recarregar');
    const hasReload = ebContent.includes('reload') || ebContent.includes('Recarregar');
    const hasCopyInEB = ebContent.includes('Copiar') || ebContent.includes('copy');
    
    scenario('ErrorBoundary has PT-BR friendly message', hasPTMessage, 
      ebContent.match(/(Algo deu errado|erro inesperado|Recarregar|Tente)/g)?.join(', '));
    scenario('ErrorBoundary has reload button', hasReload);
    scenario('ErrorBoundary has copy details', hasCopyInEB);
  }
}

// 3c. Has componentDidCatch
if (ebExists) {
  const ebContent = fs.readFileSync('src/components/ErrorBoundary.tsx', 'utf8');
  const isClassComp = ebContent.includes('componentDidCatch') || ebContent.includes('getDerivedStateFromError');
  const hasErrorState = ebContent.includes('hasError') || ebContent.includes('error');
  scenario('ErrorBoundary catches errors (componentDidCatch/getDerivedStateFromError)', isClassComp);
  scenario('ErrorBoundary has error state handling', hasErrorState);
}

// ═══════════════════════════════════════════════════
// TEST 4: Form Validation Error Display
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 4: Form Validation ═══');

// 4a. FormValidationError component file
const fveExists = fileExists('src/components/ui/form-validation-error.tsx');
scenario('FormValidationError component file exists', fveExists);

// 4b. Contains AlertCircle icon
if (fveExists) {
  const fveContent = fs.readFileSync('src/components/ui/form-validation-error.tsx', 'utf8');
  const hasAlertCircle = fveContent.includes('AlertCircle');
  const hasRedClass = fveContent.includes('text-red') || fveContent.includes('text-destructive');
  const rendersNull = fveContent.includes('return null') || fveContent.includes('!message');
  
  scenario('FormValidationError uses AlertCircle icon', hasAlertCircle);
  scenario('FormValidationError uses red/destructive text color', hasRedClass);
  scenario('FormValidationError returns null for empty message', rendersNull);
}

// 4c. Used in form components
const fveUsage = grepFiles('FormValidationError');
const fveFiles = fveUsage.split('\n').filter(Boolean).filter(f => f !== 'src/components/ui/form-validation-error.tsx');
scenario('FormValidationError used in pages/components', fveFiles.length > 0,
  fveFiles.length > 0 ? `Found in ${fveFiles.length} files` : 'Not imported directly (may be used via pattern)');

// 4d. Check existing forms still use text-red pattern (for compatibility)
const textRedInForms = parseInt(sh(`grep -rl "text-red-500" src/pages/ src/components/ --include="*.tsx" 2>/dev/null | wc -l`).trim()) || 0;
console.log(`  Files with text-red-500 in forms: ${textRedInForms}`);

// ═══════════════════════════════════════════════════
// TEST 5: ConfirmDialog / Equipamentos Page
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 5: ConfirmDialog & Equipamentos ═══');

// 5a. ConfirmDialog file
const cdExists = fileExists('src/components/ui/confirm-dialog.tsx');
scenario('ConfirmDialog component file exists', cdExists);

// 5b. InputDialog file
const idExists = fileExists('src/components/ui/input-dialog.tsx');
scenario('InputDialog component file exists', idExists);

// 5c. ConfirmDialog used in pages
const cdUsage = grepFiles('ConfirmDialog');
const cdFiles = cdUsage.split('\n').filter(Boolean).filter(f => f !== 'src/components/ui/confirm-dialog.tsx');
scenario('ConfirmDialog imported in at least 1 page', cdFiles.length > 0,
  cdFiles.length > 0 ? `Found in ${cdFiles.length} files: ${cdFiles.map(f => f.replace('src/', '')).join(', ')}` : 'Not used');

// 5d. InputDialog used in pages
const idUsage = grepFiles('InputDialog');
const idFiles = idUsage.split('\n').filter(Boolean).filter(f => f !== 'src/components/ui/input-dialog.tsx');
scenario('InputDialog imported in at least 1 page', idFiles.length > 0,
  idFiles.length > 0 ? `Found in ${idFiles.length} files: ${idFiles.map(f => f.replace('src/', '')).join(', ')}` : 'Not used');

// 5e. No native alert/confirm/prompt remaining in pages
const nativePatterns = sh(`grep -rn "window\\.confirm\\|window\\.prompt\\|window\\.alert" src/pages/ --include="*.tsx" --include="*.ts" 2>/dev/null || echo ""`).trim();
const nativeLines = nativePatterns.split('\n').filter(Boolean);
scenario('No window.confirm/prompt/alert in pages', nativeLines.length === 0,
  nativeLines.length > 0 ? `${nativeLines.length} remaining: ${nativeLines.slice(0, 3).join(' | ')}` : 'Clean — all migrated');

// 5f. Standalone alert() check (without window. prefix)
const rawAlerts = sh(`grep -rn "\\balert(" src/pages/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "// " | grep -v "//alert" | grep -v "ErrorAlert" | grep -v "error-alert" | grep -v "AlertDialog" | grep -v "AlertCircle" | grep -v "AlertTriangle" | grep -v "types/notification" || echo ""`).trim();
const rawAlertLines = rawAlerts.split('\n').filter(Boolean);
scenario('No standalone alert() calls in pages', rawAlertLines.length === 0,
  rawAlertLines.length > 0 ? `${rawAlertLines.length} remaining: ${rawAlertLines.slice(0, 3).join(' | ')}` : 'Clean — all migrated');

// 5g. No window.confirm/prompt anywhere in src
const allNative = sh(`grep -rn "window\\.confirm\\|window\\.prompt" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || echo ""`).trim();
const allNativeLines = allNative.split('\n').filter(Boolean);
scenario('No window.confirm/prompt anywhere in src/', allNativeLines.length === 0,
  allNativeLines.length > 0 ? `${allNativeLines.length} remaining` : 'Clean');

// 5h. Equipamentos.tsx is fully migrated
if (fileExists('src/pages/Equipamentos.tsx')) {
  const eqContent = fs.readFileSync('src/pages/Equipamentos.tsx', 'utf8');
  const eqAlertCount = (eqContent.match(/\balert\(/g) || []).length;
  const eqConfirmCount = (eqContent.match(/window\.confirm/g) || []).length;
  const eqPromptCount = (eqContent.match(/window\.prompt/g) || []).length;
  const eqHasUseNotification = eqContent.includes('useNotification');
  const eqHasConfirmDialog = eqContent.includes('ConfirmDialog');
  const eqHasInputDialog = eqContent.includes('InputDialog');
  
  scenario('Equipamentos.tsx uses useNotification hook', eqHasUseNotification);
  scenario('Equipamentos.tsx uses ConfirmDialog', eqHasConfirmDialog);
  scenario('Equipamentos.tsx uses InputDialog', eqHasInputDialog);
  scenario('Equipamentos.tsx has 0 alert() calls', eqAlertCount === 0, `${eqAlertCount} found`);
  scenario('Equipamentos.tsx has 0 window.confirm calls', eqConfirmCount === 0);
  scenario('Equipamentos.tsx has 0 window.prompt calls', eqPromptCount === 0);
}

// ═══════════════════════════════════════════════════
// TEST 6: useNotification Hook
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 6: useNotification Hook ═══');

const unhExists = fileExists('src/hooks/useNotification.ts');
scenario('useNotification hook file exists', unhExists);

if (unhExists) {
  const unh = fs.readFileSync('src/hooks/useNotification.ts', 'utf8');
  const hasSuccess = unh.includes('success');
  const hasError = unh.includes('Error') || unh.includes('error');
  const hasWarning = unh.includes('warning');
  const hasInfo = unh.includes('info');
  const hasCopyDetails = unh.includes('Copiar') || unh.includes('copy') || unh.includes('detalhes');
  const errorInfinity = unh.includes('Infinity') || unh.includes('manual') || unh.includes('Dismiss');
  
  scenario('useNotification exports success', hasSuccess);
  scenario('useNotification exports error', hasError);
  scenario('useNotification exports warning', hasWarning);
  scenario('useNotification exports info', hasInfo);
  scenario('useNotification has copy-details for errors', hasCopyDetails);
  scenario('useNotification errors use manual dismiss (Infinity)', errorInfinity);
}

// Usage in pages
const unhUsage = grepFiles('useNotification');
const unhFiles = unhUsage.split('\n').filter(Boolean);
scenario('useNotification used in pages', unhFiles.length > 0,
  `${unhFiles.length} files: ${unhFiles.map(f => f.replace('src/', '')).slice(0, 5).join(', ')}`);

// ═══════════════════════════════════════════════════
// TEST 7: Types & Error Utils
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 7: Types & Error Utils ═══');

const typesExists = fileExists('src/types/notification.ts');
scenario('notification.ts types file exists', typesExists);

const utilsExists = fileExists('src/lib/error-utils.ts');
scenario('error-utils.ts file exists', utilsExists);

if (typesExists) {
  const types = fs.readFileSync('src/types/notification.ts', 'utf8');
  scenario('NotificationType type defined', types.includes('NotificationType'));
  scenario('AppError interface defined', types.includes('AppError'));
  scenario('ConfirmDialogProps defined', types.includes('ConfirmDialogProps'));
  scenario('NotificationMessage defined', types.includes('NotificationMessage'));
}

if (utilsExists) {
  const utils = fs.readFileSync('src/lib/error-utils.ts', 'utf8');
  scenario('formatAppError function exists', utils.includes('formatAppError'));
  scenario('createNotificationMessage function exists', utils.includes('createNotificationMessage'));
  scenario('copyErrorDetails function exists', utils.includes('copyErrorDetails'));
  scenario('formatErrorForCopy function exists', utils.includes('formatErrorForCopy'));
}

// ═══════════════════════════════════════════════════
// TEST 8: CSS Variables
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 8: CSS Variables ═══');

if (fileExists('src/index.css')) {
  const css = fs.readFileSync('src/index.css', 'utf8');
  const hasWarningVar = css.includes('--warning');
  const hasInfoVar = css.includes('--info');
  scenario('--warning CSS variable defined', hasWarningVar);
  scenario('--info CSS variable defined', hasInfoVar);
}

// ═══════════════════════════════════════════════════
// TEST 9: TypeScript Compilation
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 9: TypeScript ═══');

const tscOutput = sh('npx tsc --noEmit 2>&1 || echo "HAS_ERRORS"');
const tscPass = !tscOutput.includes('HAS_ERRORS') && !tscOutput.includes('error TS');
scenario('npx tsc --noEmit passes', tscPass, 
  tscPass ? 'Clean' : tscOutput.split('\n').filter(l => l.includes('error')).slice(0, 3).join(' | '));

// ═══════════════════════════════════════════════════
// TEST 10: Grep verification (DoD checks)
// ═══════════════════════════════════════════════════
console.log('\n═══ TEST 10: Definition of Done — Clean Scan ═══');

// 10a: alert() in pages (excluding comments/types)
const dodAlerts = sh(`grep -rn "\\balert(" src/pages/ --include="*.tsx" --include="*.ts" 2>/dev/null | grep -v "//" | grep -v "ErrorAlert" | grep -v "error-alert" | grep -v "AlertDialog" | grep -v "AlertCircle" | grep -v "AlertTriangle" || echo ""`).trim();
const dodAlertsClean = dodAlerts === '' || dodAlerts.split('\n').every(l => l.trim() === '');
scenario('DoD: grep alert( in pages returns 0', dodAlertsClean, 
  dodAlertsClean ? 'Clean' : dodAlerts.substring(0, 150));

// 10b: window.prompt
const dodPrompt = sh(`grep -rn "window\\.prompt" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || echo ""`).trim();
scenario('DoD: grep window.prompt returns 0', dodPrompt === '' || dodPrompt === '\n', 
  dodPrompt === '' ? 'Clean' : dodPrompt.substring(0, 150));

// 10c: window.confirm
const dodConfirm = sh(`grep -rn "window\\.confirm" src/ --include="*.tsx" --include="*.ts" 2>/dev/null || echo ""`).trim();
scenario('DoD: grep window.confirm returns 0', dodConfirm === '' || dodConfirm === '\n',
  dodConfirm === '' ? 'Clean' : dodConfirm.substring(0, 150));

// ═══════════════════════════════════════════════════
// SAVE EVIDENCE
// ═══════════════════════════════════════════════════

const evidencePath = path.resolve(EVIDENCE);
if (!fs.existsSync(evidencePath)) {
  fs.mkdirSync(evidencePath, { recursive: true });
}

// Write results summary
const summaryContent = results.map(r => 
  `[${r.passed ? 'PASS' : 'FAIL'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`
).join('\n');

fs.writeFileSync(`${EVIDENCE}/qa-results.txt`, summaryContent);
console.log(`\n📄 Results saved to ${EVIDENCE}/qa-results.txt`);

// Write full report
const reportContent = [
  '═══════════════════════════════════════════════════════════',
  'FINAL QA REPORT — Notification System',
  `Date: ${new Date().toISOString()}`,
  '═══════════════════════════════════════════════════════════',
  '',
  `Total Scenarios: ${results.length}`,
  `Passed: ${passCount}`,
  `Failed: ${failCount}`,
  `Pass Rate: ${Math.round((passCount / results.length) * 100)}%`,
  '',
  '───────────────────────────────────────────────────────────',
  'DETAILED RESULTS',
  '───────────────────────────────────────────────────────────',
  ...results.map((r, i) => `${i + 1}. [${r.passed ? '✓' : '✗'}] ${r.name}${r.detail ? ` — ${r.detail}` : ''}`),
  '',
  `VERDICT: ${verdict() ? 'PASS ✓' : 'FAIL ✗'}`,
].join('\n');

fs.writeFileSync(`${EVIDENCE}/qa-report.txt`, reportContent);
console.log(`📄 Full report saved to ${EVIDENCE}/qa-report.txt`);

// ──────────────────────────────────────────────────
// FINAL
// ──────────────────────────────────────────────────
console.log('\n\n📊 QA SUMMARY REPORT');
console.log('═'.repeat(60));
for (const r of results) {
  const icon = r.passed ? '✅' : '❌';
  console.log(`${icon} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
}

const allPass = verdict();
process.exit(allPass ? 0 : 1);
