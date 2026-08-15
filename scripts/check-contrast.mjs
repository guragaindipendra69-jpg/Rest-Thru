/**
 * Contrast audit for the semantic token layer.
 *
 * Reads the HSL channel triplets straight out of app/globals.css and checks
 * every foreground/background pairing the UI actually renders -- including
 * the hover and focus states, which is where the old palette failed: a
 * hover that darkened the surface without touching the text dropped several
 * controls below 4.5:1 exactly when the pointer was on them.
 *
 * Specs accept an alpha suffix (`white/50`, `muted-foreground/70`) and are
 * composited over their background before measuring. That matters because a
 * faded foreground is not its own colour -- it is whatever it becomes once
 * the surface shows through, and that is the number the eye receives. Every
 * defect this file caught on its last run was an alpha case.
 *
 * Backgrounds may themselves be stacks (`white/8 on sidebar-raised`) for the
 * translucent panels on the marketing pages.
 *
 * Run: node scripts/check-contrast.mjs
 * Exits non-zero if any pair misses its target.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(join(root, 'app', 'globals.css'), 'utf8');

/** Grab the `:root` block only; a `.dark` block would redefine the same names. */
const rootBlock = css.slice(css.indexOf(':root'), css.indexOf('}\n}'));

const tokens = {};
for (const m of rootBlock.matchAll(
  /--([a-z0-9-]+):\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/g
)) {
  tokens[m[1]] = [Number(m[2]), Number(m[3]) / 100, Number(m[4]) / 100];
}

function hslToRgb([h, s, l]) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  const seg = [
    [c, x, 0], [x, c, 0], [0, c, x],
    [0, x, c], [x, 0, c], [c, 0, x],
  ][Math.floor(h / 60) % 6];
  return seg.map((v) => (v + m) * 255);
}

/** WCAG 2.1 relative luminance. */
function luminance(rgb) {
  const [r, g, b] = rgb.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const WHITE = [255, 255, 255];
const BLACK = [0, 0, 0];

/** Source-over composite: `fg` at `alpha` laid on `bg`. */
const composite = (fg, alpha, bg) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const unknown = new Set();

/**
 * Resolve a spec to RGB. Accepts `token`, `token/NN`, `white`, `black`,
 * and `A on B` where B is itself a spec (for stacked translucent panels).
 */
function resolve(spec, backdrop = WHITE) {
  if (spec.includes(' on ')) {
    const [top, rest] = spec.split(' on ');
    return resolve(top, resolve(rest, backdrop));
  }
  const [name, pct] = spec.split('/');
  let base;
  if (name === 'white') base = WHITE;
  else if (name === 'black') base = BLACK;
  else if (tokens[name]) base = hslToRgb(tokens[name]);
  else {
    unknown.add(name);
    return null;
  }
  return pct ? composite(base, Number(pct) / 100, backdrop) : base;
}

function ratio(fgSpec, bgSpec) {
  const bg = resolve(bgSpec);
  if (!bg) return null;
  const fg = resolve(fgSpec, bg); // alpha foregrounds composite over their own bg
  if (!fg) return null;
  const [la, lb] = [luminance(fg), luminance(bg)];
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * [foreground, background, target, label].
 *
 * 4.5 is normal text. 3.0 is large/bold text and, per WCAG 1.4.11, any
 * non-text boundary that carries meaning -- a control edge or a chart
 * series. Purely decorative rules get 1.0 and are listed only so a change
 * that erases them shows up in the diff.
 */
const PAIRS = [
  // Base reading surfaces.
  ['foreground', 'background', 4.5, 'body text on canvas'],
  ['foreground', 'card', 4.5, 'body text on card'],
  ['muted-foreground', 'background', 4.5, 'secondary text on canvas'],
  ['muted-foreground', 'card', 4.5, 'secondary text on card'],
  ['foreground', 'sunken', 4.5, 'text in wells / table headers'],
  ['muted-foreground', 'sunken', 4.5, 'table header label'],
  ['foreground', 'muted', 4.5, 'text on muted surface'],

  // Solid buttons, resting and hovered. The hover fill must still carry the
  // same foreground -- this is the regression the redesign was fixing.
  ['primary-foreground', 'primary', 4.5, 'primary button'],
  ['primary-foreground', 'primary-hover', 4.5, 'primary button HOVER'],
  ['destructive-foreground', 'destructive', 4.5, 'destructive button'],
  ['destructive-foreground', 'destructive-strong', 4.5, 'destructive button HOVER'],
  ['brand-foreground', 'brand', 4.5, 'brand button'],
  // The brand variant swaps to white ink on hover (see button.tsx): coral's
  // dark foreground would only reach 3.6:1 once the fill darkens, so the
  // pairing genuinely changes rather than just the surface.
  ['white', 'brand-strong', 4.5, 'brand button HOVER (ink swaps to white)'],
  ['white', 'success', 4.5, 'success button'],
  ['white', 'success-strong', 4.5, 'success button HOVER'],
  ['primary', 'primary-light', 4.5, 'soft button'],

  // The neutral interaction surface every shadcn primitive hovers to. Row and
  // menu hovers tint the surface only, so each ink that can sit in a row has
  // to survive the tint -- a coloured amount must stay as legible as at rest.
  ['accent-foreground', 'accent', 4.5, 'menu item HOVER (hover:bg-accent)'],
  ['muted-foreground', 'accent', 4.5, 'secondary text in HOVERED row'],
  ['primary', 'accent', 4.5, 'primary text in HOVERED row'],
  ['success-strong', 'accent', 4.5, 'success text in HOVERED row'],
  ['destructive-strong', 'accent', 4.5, 'destructive text in HOVERED row'],
  ['warning-strong', 'accent', 4.5, 'warning text in HOVERED row'],
  ['foreground', 'primary-light', 4.5, 'text in SELECTED row'],
  ['muted-foreground', 'primary-light', 4.5, 'secondary text in SELECTED row'],
  ['foreground', 'secondary', 4.5, 'secondary button'],

  // Tinted status chips: bg-x-surface + text-x-strong.
  ['success-strong', 'success-surface', 4.5, 'success chip'],
  ['warning-strong', 'warning-surface', 4.5, 'warning chip'],
  ['destructive-strong', 'destructive-surface', 4.5, 'destructive chip'],
  // Body copy inside a tinted panel, not just the heading ink: the settings
  // danger zone spells out what a delete erases on --destructive-surface.
  ['foreground', 'destructive-surface', 4.5, 'danger zone warning body'],
  ['info-strong', 'info-surface', 4.5, 'info chip'],
  ['error-strong', 'error-surface', 4.5, 'error chip'],
  ['brand-strong', 'brand-light', 4.5, 'brand chip'],
  ['primary', 'primary-light', 4.5, 'primary chip'],
  ['muted-foreground', 'muted', 4.5, 'neutral chip'],

  // Same *-strong inks on the plain surfaces they also land on.
  ['success-strong', 'card', 4.5, 'success text on card'],
  ['warning-strong', 'card', 4.5, 'warning text on card'],
  ['destructive-strong', 'card', 4.5, 'destructive text on card'],
  ['info-strong', 'card', 4.5, 'info text on card'],
  ['brand-strong', 'card', 4.5, 'brand text on card'],
  ['primary', 'card', 4.5, 'primary text on card'],
  ['destructive', 'card', 4.5, 'destructive icon on card'],

  // Form controls. The placeholder is often the only label a compact field
  // has, so it is held to the text bar, not treated as decoration.
  ['muted-foreground', 'card', 4.5, 'input placeholder'],
  ['foreground', 'card', 4.5, 'input value'],

  // Dark sidebar chrome, resting and hovered. The nav's idle ink is
  // --sidebar-muted; hover lifts it to --sidebar-foreground.
  ['sidebar-foreground', 'sidebar', 4.5, 'sidebar label'],
  ['sidebar-foreground', 'sidebar-raised', 4.5, 'sidebar label HOVER'],
  ['sidebar-muted', 'sidebar', 4.5, 'sidebar nav idle'],
  ['sidebar-muted', 'sidebar-raised', 4.5, 'sidebar nav idle on raised'],
  ["sidebar-muted", "white/9 on sidebar-raised", 4.5, "sidebar nav idle under hover tint"],
  ['sidebar-accent', 'sidebar', 4.5, 'sidebar active item'],
  ['primary-foreground', 'primary', 4.5, 'sidebar active pill'],
  ['sidebar-danger', 'sidebar', 4.5, 'sidebar logout HOVER'],
  ['sidebar-danger', 'sidebar-raised', 4.5, 'sidebar logout HOVER on raised'],

  // Marketing and auth chrome. These stack translucent white on translucent
  // panels on a dark base, so the class name alone does not tell you the
  // ratio -- every one of these was a failure before compositing was checked.
  ['white/70', 'white/8 on sidebar-raised', 4.5, 'hero mock dashboard label'],
  ['white/70', 'sidebar', 4.5, 'not-found secondary text'],
  ['white/80', 'primary', 4.5, 'auth panel caption (lightest gradient stop)'],
  ['white/80', 'primary-deep', 4.5, 'auth panel caption (darkest stop)'],
  ['white', 'primary', 4.5, 'auth panel heading'],

  // Hero and CTA primary buttons: white surface, primary ink, on the dark
  // gradient. Recorded because these hovered to bg-white/95, which let the dark
  // backdrop bleed through and dropped the ink contrast exactly while the
  // pointer was on the control. Hover now moves to elevation and the surface
  // stays fully opaque, so the resting pair below is also the hovered pair.
  ['primary', 'white', 4.5, 'hero + CTA primary button (idle and hover)'],

  // Non-text boundaries: WCAG 1.4.11 sets 3:1 for these.
  ['ring', 'background', 3, 'focus ring on canvas'],
  ['ring', 'card', 3, 'focus ring on card'],
  // The edge that identifies a control (input, select, textarea) is the
  // 1.4.11 case. --border-strong is a decorative divider and deliberately
  // stays airy, so it is checked for visibility only, not for 3:1.
  ['control-border', 'card', 3, 'control edge (input / select / textarea)'],
  ['control-border', 'background', 3, 'control edge on canvas'],
  // An OFF switch is a state, not decoration: the track has to be findable
  // against the card and the thumb has to separate from the track. Both used
  // to run on --input and sat near 1.2:1.
  ['control-border', 'card', 3, 'switch OFF track vs card'],
  ['card', 'control-border', 3, 'switch thumb vs OFF track'],
  ['border-strong', 'card', 1.2, 'emphasis divider (decorative)'],
  ['border', 'card', 1.05, 'hairline divider (decorative)'],

  // Inline links. These used to hover to `text-primary/80`, which fades the
  // ink; the -hover step darkens it instead, so hover strengthens the link.
  ['primary-hover', 'card', 4.5, 'inline link HOVER'],
  ['accent-foreground', 'accent', 4.5, 'unselected chip HOVER (ink lifts)'],

  // Chat bubbles. The meta line composites white over the primary fill, so
  // the alpha is the whole question -- /50 measured 2.4:1 before this pass.
  ['white/80', 'primary', 4.5, 'ticket chat meta on own bubble'],
  ['muted-foreground', 'muted', 4.5, 'ticket chat meta on reply bubble'],

  // Dismiss and stepper affordances that used to run on an opacity fade.
  ['muted-foreground', 'card', 4.5, 'dialog / sheet close X'],
  ['muted-foreground', 'accent', 4.5, 'dialog / sheet close X HOVER'],
  ['destructive-foreground', 'destructive', 4.5, 'toast close X on destructive'],
  // A white hover tint on the destructive toast *lightened* the fill, taking
  // the white label from 4.8:1 to 4.0:1 -- the fade trap again, one level up.
  // Hovering to the darker -strong step moves the surface the other way.
  ['destructive-foreground', 'destructive-strong', 4.5, 'toast action label HOVER'],
  ['white/75', 'destructive', 3, 'toast action edge on destructive fill'],

  // Translucent sticky toolbars. `bg-card/85` drops to `bg-card/70` wherever
  // backdrop-filter is supported, which is every browser that matters and the
  // thinner of the two, so /70 is what gets measured. The backdrop is the page
  // canvas: these bars sit inside `<main>` and content scrolls under them.
  ['foreground', 'card/70 on background', 4.5, 'sticky toolbar title'],
  ['muted-foreground', 'card/70 on background', 4.5, 'sticky toolbar caption'],
  ['destructive', 'card/70 on background', 4.5, 'sticky toolbar offline warning'],
  ['border/80', 'background', 1.05, 'sticky toolbar bottom edge (decorative)'],

  // The fixed action bar on the create pages floats over whatever is beneath
  // it. A card is the lightest thing that can pass under, so it is the worst
  // case for a 95% canvas fill.
  ['foreground', 'background/95 on card', 4.5, 'fixed action bar label'],
  ['muted-foreground', 'background/95 on card', 4.5, 'fixed action bar secondary label'],

  // Chart series are content, not decoration: a bar the reader cannot
  // separate from the plotting surface has failed at its only job.
  ['chart-1', 'card', 3, 'chart series 1'],
  ['chart-2', 'card', 3, 'chart series 2'],
  ['chart-3', 'card', 3, 'chart series 3'],
  ['chart-4', 'card', 3, 'chart series 4'],
  ['chart-5', 'card', 3, 'chart series 5'],
  ['chart-6', 'card', 3, 'chart series 6'],
];

let failed = 0;
const rows = PAIRS.map(([fg, bg, target, label]) => {
  const r = ratio(fg, bg);
  if (r === null) {
    failed++;
    return `  MISSING TOKEN  ${[...unknown].join(', ')}  (${label})`;
  }
  const ok = r >= target;
  if (!ok) failed++;
  return `  ${ok ? 'PASS' : 'FAIL'}  ${r.toFixed(2).padStart(5)}:1  (needs ${target})  ${label}`;
});

console.log(rows.join('\n'));
console.log(
  `\n${PAIRS.length - failed}/${PAIRS.length} pairs pass` +
    (failed ? ` -- ${failed} FAILING` : '')
);
process.exit(failed ? 1 : 0);
