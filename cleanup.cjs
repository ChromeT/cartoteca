const fs = require('fs');
let code = fs.readFileSync('src/App.tsx', 'utf8');

// Remove KUI block
code = code.replace(/\{\/\* KUI Import Parser Section \*\/\}[\s\S]*?\{\/\* Bot Discord ID Linker \*\/\}/g, '{/* Bot Discord ID Linker */}');

// Remove k!inv block
code = code.replace(/\{\/\* === k!inv PARSER === \*\/\}[\s\S]*?\{\/\* === INVENTORY UI === \*\/\}/g, '{/* === INVENTORY UI === */}');

// Remove Edit Modal K!C block
code = code.replace(/\{\/\* Card Info \(k!c\) \*\/\}[\s\S]*?\{\/\* Worker\/Effort Info \(k!w\) \*\/\}/g, '{/* Worker/Effort Info (k!w) */}');

// Remove Edit Modal K!W block
code = code.replace(/\{\/\* Worker\/Effort Info \(k!w\) \*\/\}[\s\S]*?<\/details>/g, '</details>');

// Remove Modals at bottom
code = code.replace(/\{\/\* MODAL: BULK IMPORT \*\/\}[\s\S]*?\{\/\* MODAL: BATCH KIWI \*\/\}/g, '{/* MODAL: BATCH KIWI */}');
code = code.replace(/\{\/\* MODAL: BATCH KIWI \*\/\}[\s\S]*?\{\/\* MODAL: BATCH IMAGE \*\/\}/g, '{/* MODAL: BATCH IMAGE */}');
code = code.replace(/\{\/\* MODAL: BATCH IMAGE \*\/\}[\s\S]*?<\/div>\s*<\/div>\s*\)\}/g, ')}');

// Remove Header buttons
code = code.replace(/<button className="btn secondary" onClick=\{\(\) => setIsBulkImportModalOpen\(true\)\}.*?<\/button>\s*/g, '');
code = code.replace(/<button className="btn secondary" onClick=\{\(\) => setIsBatchKiwiModalOpen\(true\)\}.*?<\/button>\s*/g, '');
code = code.replace(/<button className="btn secondary" onClick=\{\(\) => setIsBatchImageModalOpen\(true\)\}.*?<\/button>\s*/g, '');

// Remove Estimated Price onPaste interceptor
code = code.replace(/onPaste=\{\(e\) => \{[\s\S]*?\}\}\s*\/>/g, '/>');

fs.writeFileSync('src/App.tsx', code);
console.log('Cleanup complete!');
