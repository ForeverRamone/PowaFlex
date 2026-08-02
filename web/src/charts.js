import { useEffect, useState } from 'react';

/**
 * Recharts paints SVG with literal colour strings, so it can't use Tailwind
 * classes and it can't follow the `data-ui` theme switch on its own. Everything
 * a chart draws comes from the `--chart-*` variables in index.css, resolved
 * here into plain hex/rgba values — that's why no chart component writes a
 * colour of its own: hardcoded darks turned illegible on «Cartelera»'s paper.
 */
const VARS = [
  'axis', 'grid', 'cursor', 'tip-bg', 'tip-fg', 'tip-border',
  'accent', 'positive', 'muted',
  '1', '2', '3', '4', '5', '6', '7', '8',
];

function readChartVars() {
  const cs = getComputedStyle(document.documentElement);
  const val = (name) => cs.getPropertyValue(`--chart-${name}`).trim();
  const c = {};
  for (const v of VARS) c[v] = val(v);
  return {
    axis: c.axis || '#71717a',
    grid: c.grid || 'rgba(255,255,255,.08)',
    cursor: c.cursor || 'rgba(255,255,255,.06)',
    accent: c.accent || '#e8b53a',
    positive: c.positive || '#34d399',
    muted: c.muted || '#26262b',
    ramp: [c['1'], c['2'], c['3'], c['4'], c['5'], c['6'], c['7'], c['8']].filter(Boolean),
    tooltip: {
      backgroundColor: c['tip-bg'] || '#1c1c1f',
      border: `1px solid ${c['tip-border'] || '#3a3a42'}`,
      borderRadius: 8,
      color: c['tip-fg'] || '#e4e4e7',
    },
    // recharts styles the tooltip's own label and items separately: without
    // these two the series name and the value keep the library's default grey
    tooltipLabel: { color: c['tip-fg'] || '#e4e4e7', fontWeight: 600 },
    tooltipItem: { color: c['tip-fg'] || '#e4e4e7' },
  };
}

export function useChartTheme() {
  const [theme, setTheme] = useState(readChartVars);
  useEffect(() => {
    // the look is switched by toggling data-ui on <html>: re-read on that
    const obs = new MutationObserver(() => setTheme(readChartVars()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ui'] });
    return () => obs.disconnect();
  }, []);
  return theme;
}
