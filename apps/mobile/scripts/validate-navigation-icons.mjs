import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';

const routes = ['home', 'clubs', 'events', 'chat', 'me'];
const icons = ['home', 'groups', 'calendar', 'chat', 'person'];

function source(text, name) {
  const file = ts.createSourceFile(name, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (file.parseDiagnostics.length) throw new Error(`Invalid navigation source: ${name}`);
  return file;
}

function find(file, predicate) {
  let result;
  function visit(node) {
    if (predicate(node)) result ??= node;
    ts.forEachChild(node, visit);
  }
  visit(file);
  return result;
}

function initializer(file, name) {
  let node = find(file, (n) => ts.isVariableDeclaration(n) && n.name.getText(file) === name)?.initializer;
  while (node && (ts.isAsExpression(node) || ts.isSatisfiesExpression(node) || ts.isParenthesizedExpression(node))) node = node.expression;
  if (!node) throw new Error(`Missing navigation declaration: ${name}`);
  return node;
}

function properties(node) {
  if (!ts.isObjectLiteralExpression(node)) throw new Error('Navigation declarations must be literal objects');
  const result = new Map();
  for (const property of node.properties) {
    if (!ts.isPropertyAssignment(property) || !(ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) throw new Error('Unsupported navigation property');
    const name = property.name.text;
    if (result.has(name)) throw new Error(`Duplicate navigation property: ${name}`);
    result.set(name, property.initializer);
  }
  return result;
}

function imported(file, name, module) {
  return Boolean(find(file, (n) => ts.isImportDeclaration(n) && n.moduleSpecifier.text === module &&
    n.importClause?.namedBindings && ts.isNamedImports(n.importClause.namedBindings) &&
    n.importClause.namedBindings.elements.some((e) => e.name.text === name && !e.propertyName)));
}

/** Inspect declarations and their actual renderer wiring, without executing React Native. */
export function navigationGlyphs({ layout, navigation, destinations, appIcon }) {
  const layoutFile = source(layout, 'tabs.tsx');
  const navigationFile = source(navigation, 'bottom-navigation.tsx');
  const destinationFile = source(destinations, 'bottom-navigation-layout.ts');
  const iconFile = source(appIcon, 'app-icon.tsx');
  if (!imported(layoutFile, 'BottomNavigation', '@/components/navigation/bottom-navigation') ||
      !imported(layoutFile, 'BottomDestinations', '@/components/navigation/bottom-navigation-layout') ||
      !find(layoutFile, (n) => ts.isJsxAttribute(n) && n.name.getText() === 'tabBar' && find(n, (c) => ts.isJsxSelfClosingElement(c) && c.tagName.getText() === 'BottomNavigation')) ||
      !find(layoutFile, (n) => ts.isCallExpression(n) && n.expression.getText() === 'BottomDestinations.map')) {
    throw new Error('Tabs must render the shared BottomNavigation destinations');
  }
  if (!imported(navigationFile, 'AppIcon', '@/components/ui/app-icon') ||
      !imported(navigationFile, 'BottomDestinations', './bottom-navigation-layout') ||
      !find(navigationFile, (n) => ts.isJsxSelfClosingElement(n) && n.tagName.getText() === 'AppIcon' && n.attributes.properties.some((p) =>
        ts.isJsxAttribute(p) && p.name.getText() === 'name' && p.initializer && ts.isJsxExpression(p.initializer) && p.initializer.expression?.getText() === 'destination.icon'))) {
    throw new Error('BottomNavigation must render destination.icon through AppIcon');
  }
  if (!find(iconFile, (n) => ts.isImportDeclaration(n) && n.moduleSpecifier.text === 'expo-symbols/androidWeights/regular' && n.importClause?.name?.text === 'materialSymbols') ||
      !find(iconFile, (n) => ts.isCallExpression(n) && n.expression.getText() === 'useFonts' && n.arguments.some((a) => find(a, (p) =>
        ts.isPropertyAssignment(p) && ts.isComputedPropertyName(p.name) && p.name.expression.getText() === 'materialSymbols.name' && p.initializer.getText() === 'materialSymbols.font'))) ||
      !find(iconFile, (n) => ts.isJsxOpeningElement(n) && n.tagName.getText() === 'Text' && n.attributes.properties.some((p) =>
        ts.isJsxAttribute(p) && p.name.getText() === 'style' && p.initializer && find(p.initializer, (c) =>
          ts.isPropertyAssignment(c) && c.name.getText() === 'fontFamily' && c.initializer.getText() === 'materialSymbols.name'))) ||
      !find(iconFile, (n) => ts.isCallExpression(n) && n.expression.getText() === 'String.fromCodePoint' && n.arguments[0]?.getText() === 'glyphs[name]')) {
    throw new Error('AppIcon must load and render the installed Material Symbols font');
  }
  const declaration = initializer(destinationFile, 'BottomDestinations');
  if (!ts.isArrayLiteralExpression(declaration) || declaration.elements.length !== routes.length) throw new Error('Exactly five navigation destinations are required');
  const glyphs = properties(initializer(iconFile, 'glyphs'));
  const result = declaration.elements.map((element, index) => {
    const fields = properties(element);
    const values = Object.fromEntries([...fields].map(([key, node]) => {
      if (!ts.isStringLiteral(node)) throw new Error('Navigation destinations must use literal names, labels and icons');
      return [key, node.text];
    }));
    if (values.name !== routes[index] || values.icon !== icons[index] || !values.label?.trim()) throw new Error('Navigation destination order, label or icon is invalid');
    const glyph = glyphs.get(values.icon);
    if (!glyph || !ts.isNumericLiteral(glyph)) throw new Error(`Missing numeric icon glyph: ${values.icon}`);
    const codePoint = Number(glyph.text);
    if (!Number.isInteger(codePoint) || codePoint < 0xe000 || codePoint > 0xf8ff) throw new Error(`Invalid Material Symbols code point: ${values.icon}`);
    return { ...values, codePoint };
  });
  if (new Set(result.map((entry) => entry.codePoint)).size !== result.length) throw new Error('Navigation glyphs must be distinct');
  return result;
}

/** Unicode cmap formats 4 and 12 used by the installed outline font. */
export function fontHasGlyph(font, codePoint) {
  const tables = font.readUInt16BE(4);
  let cmap;
  for (let i = 0; i < tables; i += 1) {
    const record = 12 + i * 16;
    if (font.toString('ascii', record, record + 4) === 'cmap') cmap = font.readUInt32BE(record + 8);
  }
  if (cmap === undefined) throw new Error('Icon font has no cmap table');
  const records = font.readUInt16BE(cmap + 2);
  for (let i = 0; i < records; i += 1) {
    const record = cmap + 4 + i * 8;
    const platform = font.readUInt16BE(record), encoding = font.readUInt16BE(record + 2);
    if (platform !== 0 && !(platform === 3 && [1, 10].includes(encoding))) continue;
    const table = cmap + font.readUInt32BE(record + 4), format = font.readUInt16BE(table);
    if (format === 12) {
      const groups = font.readUInt32BE(table + 12);
      for (let group = 0; group < groups; group += 1) {
        const offset = table + 16 + group * 12;
        const first = font.readUInt32BE(offset), last = font.readUInt32BE(offset + 4);
        if (first <= codePoint && codePoint <= last && font.readUInt32BE(offset + 8) + codePoint - first !== 0) return true;
      }
    } else if (format === 4 && codePoint <= 0xffff) {
      const segments = font.readUInt16BE(table + 6) / 2, ends = table + 14;
      const starts = ends + segments * 2 + 2, deltas = starts + segments * 2, ranges = deltas + segments * 2;
      for (let segment = 0; segment < segments; segment += 1) {
        const first = font.readUInt16BE(starts + segment * 2), last = font.readUInt16BE(ends + segment * 2);
        if (codePoint < first || codePoint > last) continue;
        const delta = font.readInt16BE(deltas + segment * 2), range = font.readUInt16BE(ranges + segment * 2);
        const glyph = range ? font.readUInt16BE(ranges + segment * 2 + range + (codePoint - first) * 2) : codePoint;
        if ((range && glyph === 0) ? false : ((glyph + delta) & 0xffff) !== 0) return true;
      }
    }
  }
  return false;
}

export function inspectNavigationIcons(mobileRoot) {
  const read = (file) => fs.readFileSync(path.join(mobileRoot, file), 'utf8');
  const entries = navigationGlyphs({
    layout: read('src/app/(tabs)/_layout.tsx'), navigation: read('src/components/navigation/bottom-navigation.tsx'),
    destinations: read('src/components/navigation/bottom-navigation-layout.ts'), appIcon: read('src/components/ui/app-icon.tsx'),
  });
  const require = createRequire(path.join(mobileRoot, 'package.json'));
  const symbols = require.resolve('expo-symbols/androidWeights/regular');
  const definition = source(fs.readFileSync(symbols, 'utf8'), 'material-symbols.js');
  const weight = properties(initializer(definition, 'weight'));
  if (!imported(definition, 'MaterialSymbols_400Regular', '@expo-google-fonts/material-symbols/400Regular') ||
      weight.get('name')?.text !== 'MaterialSymbols_400Regular' || weight.get('font')?.getText() !== 'MaterialSymbols_400Regular') throw new Error('Unexpected Material Symbols regular font definition');
  const fontModule = createRequire(symbols).resolve('@expo-google-fonts/material-symbols/400Regular');
  const fontDefinition = source(fs.readFileSync(fontModule, 'utf8'), 'font.js');
  const reference = initializer(fontDefinition, 'MaterialSymbols_400Regular');
  if (!ts.isCallExpression(reference) || reference.expression.getText() !== 'require' || reference.arguments.length !== 1 || !ts.isStringLiteral(reference.arguments[0])) throw new Error('Missing Material Symbols font asset');
  const relative = reference.arguments[0].text;
  if (!/^\.\/[^/]+\.ttf$/.test(relative)) throw new Error('Invalid Material Symbols font asset path');
  const font = fs.readFileSync(path.resolve(path.dirname(fontModule), relative));
  for (const entry of entries) if (!fontHasGlyph(font, entry.codePoint)) throw new Error(`Installed font is missing navigation glyph: ${entry.icon}`);
  return entries;
}
