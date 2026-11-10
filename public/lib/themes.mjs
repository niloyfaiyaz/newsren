// Canonical navigation keys; legacy Health/Society require per-record editorial mapping.
export const THEMES = Object.freeze([
  {key:'arts-culture',label:'Arts and Culture'},
  {key:'science-technology',label:'Science and Technology'},
  {key:'media-communication',label:'Media and Communication'},
  {key:'politics-international-relations',label:'Politics and International Relations'},
  {key:'environment-sustainability',label:'Environment and Sustainability'},
  {key:'individuals-values',label:'Individuals and Values'}
].map(Object.freeze));
export const THEME_KEYS = Object.freeze(THEMES.map(t=>t.key));
export const THEME_LABELS = Object.freeze(THEMES.map(t=>t.label));
export function resolveTheme(value) {
  if (value === 'Technology') return 'science-technology';
  if (value === 'Environment') return 'environment-sustainability';
  return THEMES.find(t=>t.key===value||t.label===value)?.key ?? null;
}
export const themeLabel = value => THEMES.find(t=>t.key===resolveTheme(value))?.label ?? null;
export const isInitialArticle = a => a.active === true && a.editorialTier === 'initial';
