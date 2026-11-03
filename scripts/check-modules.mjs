import ts from 'typescript';
import { readdirSync } from 'node:fs';

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]);
}
const program = ts.createProgram(walk('src').filter(file => file.endsWith('.js')), {
  allowJs: true, checkJs: true, noEmit: true, skipLibCheck: true,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
});
// Existing JS is not fully typed yet; fail on unresolved names/imports and syntax.
const bindingErrors = new Set([2304, 2305, 2307, 2459, 2552, 2580, 2581, 2592, 18004]);
const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics().filter(d => bindingErrors.has(d.code))];
if (diagnostics.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => process.cwd(), getCanonicalFileName: file => file, getNewLine: () => '\n',
  }));
  process.exitCode = 1;
} else console.log('Application module bindings verified.');
