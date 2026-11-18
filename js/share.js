// Vitrine compartilhada: só o que a head pode ver (entregas do Gantt, OKR3 e fotos dos PMs), somente leitura.
// Tarefas, reuniões, pautas, notificações e configurações nunca entram aqui.
import { S } from './store.js';
import { inGantt } from './gantt.js';
import { nameKey } from './util.js';

const ME = 'Beatriz'; // como as suas entregas ("Eu") aparecem para quem vê a vitrine
const FIELDS = ['id', 'title', 'notes', 'owner', 'ownerName', 'priority', 'status', 'deadline', 'start', 'createdAt', 'progress',
  'macrotemaId', 'mrd', 'prd', 'link', 'gantt', 'doneAt', 'kind'];

export function buildView(st = S()) {
  const items = st.items.filter((i) => inGantt(i, st)).map((i) => {
    const o = {};
    for (const k of FIELDS) if (i[k] !== undefined) o[k] = i[k];
    if (o.owner === 'me') { o.owner = 'other'; o.ownerName = ME; }
    return o;
  });
  const macroIds = new Set(items.map((i) => i.macrotemaId).filter(Boolean));
  const names = new Set(items.map((i) => nameKey(i.ownerName || '')).filter(Boolean));
  const photos = Object.fromEntries(Object.entries(st.photos || {}).filter(([k]) => names.has(k)));
  return {
    items,
    macrotemas: st.macrotemas.filter((m) => macroIds.has(m.id)),
    photos,
    okr3: st.okr3 || null,
  };
}

// Estado do app de quem só vê a vitrine
export function viewState(v = {}) {
  return { items: v.items || [], macrotemas: v.macrotemas || [], photos: v.photos || {}, okr3: v.okr3 || null, series: [], occ: {}, notifs: [] };
}
