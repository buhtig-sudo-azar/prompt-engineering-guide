const fs = require('fs');
const path = require('path');

const outDir = path.join(__dirname, '..', 'out');
const basePath = '/prompt-engineering-guide';
const locales = ['ar', 'ca', 'de', 'en', 'es', 'fi', 'fr', 'it', 'jp', 'kr', 'pt', 'ru', 'tr', 'zh'];

// Collect ALL HTML files with locale suffix
const localeFiles = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '_next') walk(full);
    else if (entry.isFile() && entry.name.endsWith('.html')) {
      const nameParts = entry.name.split('.');
      const locale = nameParts.length >= 3 ? nameParts[nameParts.length - 2] : null;
      if (locale && locales.includes(locale)) {
        localeFiles.push({ file: full, locale });
      }
    }
  }
}
walk(outDir);

console.log(`Found ${localeFiles.length} locale-prefixed HTML files`);

// Map of old path -> new path for link rewriting
const linkMap = {};

// List of things to copy/move
const moves = [];

for (const { file, locale } of localeFiles) {
  const dir = path.dirname(file);
  const basename = path.basename(file);
  const nameParts = basename.split('.');
  const pageName = nameParts.slice(0, -2).join('.') || 'index';
  const relDir = path.relative(outDir, dir);

  // Old URL path (as referenced in the HTML)
  const oldRelPath = relDir === '.' ? `/${pageName}.${locale}` : `/${relDir}/${pageName}.${locale}`;
  const newRelPath = pageName === 'index'
    ? `/${locale}`
    : `/${locale}${relDir === '.' ? '' : '/' + relDir}/${pageName}`;

  // Destination
  const destDir = pageName === 'index'
    ? path.join(outDir, locale)
    : path.join(outDir, locale, relDir === '.' ? '' : relDir, pageName);
  const destFile = path.join(destDir, 'index.html');

  linkMap[oldRelPath] = newRelPath;
  moves.push({ src: file, dest: destFile, destDir });
}

// Apply moves
for (const { src, dest, destDir } of moves) {
  fs.mkdirSync(destDir, { recursive: true });
  fs.renameSync(src, dest);
}

// Rewrite internal links in all HTML files (including the newly moved ones)
function findHtml(dir) {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '_next') files.push(...findHtml(full));
    else if (entry.isFile() && entry.name.endsWith('.html')) files.push(full);
  }
  return files;
}

const allHtml = findHtml(outDir);
console.log(`Rewriting links in ${allHtml.length} files`);

// Build old->new replacement patterns for href/src
const linkReplacements = Object.entries(linkMap)
  .sort((a, b) => b[0].length - a[0].length); // longer first

for (const file of allHtml) {
  let content = fs.readFileSync(file, 'utf-8');
  let modified = false;

  for (const [oldPath, newPath] of linkReplacements) {
    // Match href and src attributes with the old path
    // Use regex to replace both href="<basePath>/<oldPath>" and src="<basePath>/<oldPath>"
    const fullOld = `${basePath}${oldPath}`;
    const fullNew = `${basePath}${newPath}`;
    
    if (content.includes(fullOld)) {
      content = content.split(fullOld).join(fullNew);
      modified = true;
    }
  }

  if (modified) {
    fs.writeFileSync(file, content);
  }
}

// Remove empty relic directories
function cleanEmpty(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && entry.name !== '_next') {
      cleanEmpty(full);
      try { if (fs.readdirSync(full).length === 0) fs.rmdirSync(full); } catch {}
    }
  }
}
cleanEmpty(outDir);

// Root index.html → redirect to Russian
const redirect = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${basePath}/ru/">
  <title>Prompt Engineering Guide</title>
</head>
<body>
  <p><a href="${basePath}/ru/">Prompt Engineering Guide — Русская версия</a></p>
</body>
</html>`;
fs.writeFileSync(path.join(outDir, 'index.html'), redirect);

// Also update 404.html if it exists
const _404 = path.join(outDir, '404.html');
if (fs.existsSync(_404)) {
  fs.renameSync(_404, path.join(outDir, '404_orig.html'));
}

const notFound = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0; url=${basePath}/ru/">
  <title>Page Not Found</title>
</head>
<body>
  <p><a href="${basePath}/ru/">Prompt Engineering Guide — Русская версия</a></p>
</body>
</html>`;
fs.writeFileSync(path.join(outDir, '404.html'), notFound);

console.log('Done!');
