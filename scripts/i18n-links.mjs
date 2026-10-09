#!/usr/bin/env bun
/**
 * Keep every translated page's language links in sync: the <link hreflang> block,
 * the footer language switcher, the sitemap's xhtml:link alternates, and the
 * English homepage's "view in your language" banner.
 *
 *   bun scripts/i18n-links.mjs
 *
 * Add a language to LANGS (and its banner line to SUGGEST), add the page folder,
 * then run this. Only pages that exist on disk are linked, so a language can ship
 * with just some of the pages.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { posix } from 'node:path';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dir, '..');
const SITE = 'https://honorfitapp.com';

// [hreflang, folder, switcher label]; English first, the x-default.
const LANGS = [
  ['en', '', 'English'],
  ['es', 'es/', 'Español'],
  ['pt-BR', 'pt-br/', 'Português'],
  ['de', 'de/', 'Deutsch'],
  ['fr', 'fr/', 'Français'],
  ['it', 'it/', 'Italiano'],
  ['nl', 'nl/', 'Nederlands'],
  ['pl', 'pl/', 'Polski'],
  ['tr', 'tr/', 'Türkçe'],
  ['id', 'id/', 'Bahasa Indonesia'],
  ['vi', 'vi/', 'Tiếng Việt'],
  ['th', 'th/', 'ไทย'],
  ['ja', 'ja/', '日本語'],
  ['ko', 'ko/', '한국어'],
  ['zh-Hant', 'zh-hant/', '繁體中文'],
];

// Pages that exist in more than one language.
const PAGES = ['', 'how-to-stop-doomscrolling/', 'app-blocker-for-adhd/'];

// English homepage banner, keyed by the browser language's primary subtag.
const SUGGEST = {
  es: '¿Prefieres español? Ver en español →',
  'pt-BR': 'Prefere português? Ver em português →',
  de: 'Lieber auf Deutsch? Zur deutschen Seite →',
  fr: 'Tu préfères le français ? Voir en français →',
  it: 'Preferisci l’italiano? Vedi in italiano →',
  nl: 'Liever in het Nederlands? Bekijk de Nederlandse pagina →',
  pl: 'Wolisz po polsku? Zobacz po polsku →',
  tr: 'Türkçe mi tercih edersin? Türkçe sayfaya git →',
  id: 'Lebih suka Bahasa Indonesia? Lihat versi Indonesia →',
  vi: 'Xem bằng tiếng Việt →',
  th: 'ดูเป็นภาษาไทย →',
  ja: '日本語のページを見る →',
  ko: '한국어로 보기 →',
  'zh-Hant': '查看繁體中文版 →',
};

const file = (dir, page) => resolve(ROOT, dir + page, 'index.html');
const url = (dir, page) => `${SITE}/${dir}${page}`;
const rel = (from, to) => {
  const r = posix.relative(`/${from}`, `/${to}`);
  return r ? `${r}/` : './';
};
const today = new Date().toISOString().slice(0, 10);

const DRY = process.argv.includes('--dry');
let changed = 0;
const write = (path, before, after) => {
  if (before === after) return;
  if (!DRY) writeFileSync(path, after);
  changed++;
  console.log(`updated ${posix.relative(ROOT, path)}`);
};

for (const page of PAGES) {
  const langs = LANGS.filter(([, dir]) => existsSync(file(dir, page)));
  for (const [code, dir] of langs) {
    const path = file(dir, page);
    const html = readFileSync(path, 'utf8');
    const head = [
      ...langs.map(([c, d]) => `  <link rel="alternate" hreflang="${c}" href="${url(d, page)}">`),
      `  <link rel="alternate" hreflang="x-default" href="${url('', page)}">`,
    ].join('\n');
    const links = langs
      .map(([c, d, label]) => `<a href="${rel(dir + page, d + page)}" hreflang="${c}" lang="${c}"${c === code ? ' aria-current="page"' : ''}>${label}</a>`)
      .join('');
    let out = html.replace(/(?:[ \t]*<link rel="alternate" hreflang="[^"]+" href="[^"]*">\n)+/, `${head}\n`);
    out = out.replace(/<span class="langs">[\s\S]*?<\/span>/, `<span class="langs">${links}</span>`);
    if (!/<link rel="alternate" hreflang=/.test(out)) console.warn(`no hreflang block in ${path}`);
    if (!/<span class="langs">/.test(out)) console.warn(`no language switcher in ${path}`);
    write(path, html, out);
  }
}

// English homepage banner + "came from a translated page" check.
{
  const path = file('', '');
  const html = readFileSync(path, 'utf8');
  const entries = LANGS.filter(([c, dir]) => SUGGEST[c] && existsSync(file(dir, '')))
    .map(([c, dir]) => `      ${c === 'zh-Hant' ? 'zh' : c.split('-')[0]}: ['${dir}', '${c}', '${SUGGEST[c]}'],`)
    .join('\n');
  const dirs = LANGS.filter(([c, dir]) => dir && existsSync(file(dir, ''))).map(([, dir]) => dir.slice(0, -1));
  let out = html.replace(/const L = \{\n[\s\S]*?\n    \};/, `const L = {\n${entries}\n    };`);
  out = out.replace(/\/\^\\\/\([^)]*\)\\\/\//, `/^\\/(${dirs.join('|')})\\//`);
  write(path, html, out);
}

// Sitemap: regenerate the <url> entries of multi-language pages, keeping lastmod.
{
  const path = resolve(ROOT, 'sitemap.xml');
  const xml = readFileSync(path, 'utf8');
  const blocks = [...xml.matchAll(/  <url>[\s\S]*?<\/url>\n/g)];
  const lastmod = Object.fromEntries(blocks.map((m) => [m[0].match(/<loc>([^<]*)<\/loc>/)[1], m[0].match(/<lastmod>([^<]*)</)?.[1]]));
  const managed = new Set(PAGES.flatMap((page) => LANGS.map(([, dir]) => url(dir, page))));
  let out = xml;
  for (const page of PAGES) {
    const langs = LANGS.filter(([, dir]) => existsSync(file(dir, page)));
    const alternates = [
      ...langs.map(([c, d]) => `    <xhtml:link rel="alternate" hreflang="${c}" href="${url(d, page)}"/>`),
      `    <xhtml:link rel="alternate" hreflang="x-default" href="${url('', page)}"/>`,
    ].join('\n');
    const generated = langs
      .map(([, dir]) => {
        const loc = url(dir, page);
        const priority = page ? (dir ? '0.7' : '0.8') : dir ? '0.9' : '1.0';
        return `  <url>\n    <loc>${loc}</loc><lastmod>${lastmod[loc] ?? today}</lastmod><priority>${priority}</priority>\n${alternates}\n  </url>\n`;
      })
      .join('');
    // Replace the English page's entry in place; drop the old translated entries.
    const english = url('', page);
    out = out.replace(/  <url>[\s\S]*?<\/url>\n/g, (block) => {
      const loc = block.match(/<loc>([^<]*)<\/loc>/)[1];
      if (loc === english) return generated;
      return managed.has(loc) && url('', page) !== loc && LANGS.some(([, d]) => d && url(d, page) === loc) ? '' : block;
    });
  }
  write(path, xml, out);
}

console.log(changed ? `${changed} files updated` : 'already in sync');
