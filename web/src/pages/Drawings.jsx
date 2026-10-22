import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api';

const FIELDS = [
  ['codigo', 'Código'],
  ['nome', 'Nome'],
  ['descricao', 'Descrição'],
  ['desenhista', 'Desenhista'],
  ['projetista', 'Projetista'],
  ['empresa', 'Empresa (Cliente)'],
  ['planta', 'Planta'],
  ['formato_folha', 'Formato da folha'],
  ['tag', 'Tag'],
  ['os', 'OS'],
  ['anotacoes', 'Anotações']
];

const EXTRA_COLS = [
  ['ultima_revisao', 'Rev.'],
  ['has_attachment', 'Anexo'],
  ['updated_at', 'Atualizado']
];

const ADMIN_COL = ['id', 'ID (interno)'];

const ALL_COLS = [...FIELDS, ...EXTRA_COLS];
const DEFAULT_ORDER = ALL_COLS.map(([k]) => k);
const LABELS = Object.fromEntries(ALL_COLS);
const PAGE_SIZES = [10, 20, 30, 40, 50, 100];
const TEXT_ELLIPSIS_KEYS = ['nome', 'descricao', 'empresa', 'anotacoes', 'desenhista', 'projetista', 'planta', 'os', 'tag'];

const EMPTY = { codigo: '', nome: '', descricao: '', desenhista: '', projetista: '', empresa: '', planta: '', formato_folha: '', tag: '', os: '', anotacoes: '' };

export default function Drawings() {
  const [simple, setSimple] = useState('');
  const [showAdv, setShowAdv] = useState(false);
  const [criterias, setCriterias] = useState([{ field: 'codigo', op: 'contains', value: '' }]);
  const [hasAttachment, setHasAttachment] = useState('');
  const [data, setData] = useState({ total: 0, items: [] });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    try { return parseInt(localStorage.getItem('cadbank-pageSize'), 10) || 10; } catch { return 10; }
  });
  const [sort, setSort] = useState('updated_at');
  const [dir, setDir] = useState('desc');
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState([]);
  const [user, setUser] = useState(null);
  const [colConf, setColConf] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragColKey, setDragColKey] = useState(null);
  const newFileRef = useRef(null); // { order: [keys], hidden: [keys] }
  const [showCols, setShowCols] = useState(false);
  const nav = useNavigate();

  const colsKey = 'cadbank-cols:' + (user?.username || 'default');

  useEffect(() => {
    api('/auth/me').then(r => setUser(r.user || r)).catch(() => setUser({ username: 'default' }));
  }, []);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(colsKey));
      if (s && Array.isArray(s.order)) setColConf(s);
    } catch { /* ignore */ }
  }, [colsKey]);

  const saveConf = (conf) => {
    setColConf(conf);
    try { localStorage.setItem(colsKey, JSON.stringify(conf)); } catch { /* ignore */ }
  };

  const columns = useMemo(() => {
    const isAdmin = user?.role === 'admin';
    const available = isAdmin ? [...ALL_COLS, ADMIN_COL] : ALL_COLS;
    const labels = Object.fromEntries(available);
    const order = (colConf?.order || []).filter(k => labels[k]);
    for (const [k] of available) if (!order.includes(k)) order.push(k);
    const hidden = colConf?.hidden || [];
    return order.map(k => ({ key: k, label: labels[k], visible: !hidden.includes(k) }));
  }, [colConf, user]);

  const visibleCols = columns.filter(c => c.visible);

  const toggleCol = (key) => {
    const hidden = new Set(colConf?.hidden || []);
    hidden.has(key) ? hidden.delete(key) : hidden.add(key);
    saveConf({ order: columns.map(c => c.key), hidden: [...hidden] });
  };

  const moveCol = (key, delta) => {
    const order = columns.map(c => c.key);
    const i = order.indexOf(key);
    const j = i + delta;
    if (j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveConf({ order, hidden: colConf?.hidden || [] });
  };

  const resetCols = () => saveConf({ order: DEFAULT_ORDER, hidden: [] });

  const reorderHeader = (targetKey) => {
    if (!dragColKey || dragColKey === targetKey) return;
    const order = columns.map(c => c.key);
    const from = order.indexOf(dragColKey);
    if (from === -1) return;
    order.splice(from, 1);
    order.splice(order.indexOf(targetKey), 0, dragColKey);
    saveConf({ order, hidden: colConf?.hidden || [] });
  };

  const clickSort = (key) => {
    if (sort === key) setDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSort(key); setDir('asc'); }
  };

  const load = async (p = page, ps = pageSize) => {
    setError('');
    try {
      const params = new URLSearchParams({ simple, sort, dir, page: p, pageSize: ps });
      if (hasAttachment) params.set('hasAttachment', hasAttachment);
      const active = criterias.filter(c => c.field && c.value);
      if (active.length) params.set('criterias', JSON.stringify(active));
      const d = await api('/drawings?' + params.toString());
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(1, pageSize); setPage(1); }, [sort, dir, pageSize]);

  useEffect(() => {
    try { localStorage.setItem('cadbank-pageSize', String(pageSize)); } catch { /* ignore */ }
  }, [pageSize]);

  const search = (e) => {
    e?.preventDefault();
    setPage(1);
    load(1);
  };

  const setCrit = (i, key, val) => {
    setCriterias(cs => cs.map((c, j) => j === i ? { ...c, [key]: val } : c));
  };

  const create = async (e) => {
    e.preventDefault();
    try {
      const d = await api('/drawings', { method: 'POST', body: JSON.stringify(form) });
      // se o usuário anexou um DWG na criação, sobe como Revisão 0
      const file = newFileRef.current && newFileRef.current.files && newFileRef.current.files[0];
      if (file) {
        const fd = new FormData();
        fd.append('dwg', file);
        fd.append('revisao', '0');
        try {
          await api(`/drawings/${d.id}/revisions`, { method: 'POST', body: fd });
        } catch (upErr) {
          // slot criado; falha do upload não perde o cadastro
          nav('/drawings/' + d.id);
          setError('Slot criado, mas o upload do DWG falhou: ' + upErr.message + '. Envie o arquivo na página do desenho.');
          return;
        }
      }
      setShowNew(false);
      setForm(EMPTY);
      if (newFileRef.current) newFileRef.current.value = '';
      nav('/drawings/' + d.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleAll = () => {
    if (selected.length === data.items.length) setSelected([]);
    else setSelected(data.items.map(i => i.id));
  };

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

  const cell = (d, key) => {
    switch (key) {
      case 'codigo':
        return <Link to={'/drawings/' + d.id} onClick={e => e.stopPropagation()}><b>{d.codigo}</b></Link>;
      case 'ultima_revisao':
        return d.ultima_revisao ? 'R' + d.ultima_revisao : '—';
      case 'has_attachment':
        return <>
          {d.has_attachment
            ? <span className="badge attached">📎 anexado</span>
            : <span className="badge missing">sem anexo</span>}
          {d.has_pdf ? <span className="badge pdf" style={{ marginLeft: 4 }}>PDF</span> : null}
        </>;
      case 'updated_at':
        return <span className="muted">{d.updated_at}</span>;
      default:
        return d[key];
    }
  };

  const sortIcon = (key) => (sort === key ? (dir === 'asc' ? ' ▲' : ' ▼') : '');

  return (
    <div>
      <div className="row mb">
        <form onSubmit={search} className="row" style={{ flex: 1 }}>
          <input
            style={{ maxWidth: 480 }}
            placeholder="Pesquisa simples — nome, código, desenhista, OS, cliente..."
            value={simple}
            onChange={e => setSimple(e.target.value)}
          />
          <button type="submit">🔍 Buscar</button>
          <button type="button" className="secondary" onClick={() => setShowAdv(!showAdv)}>
            {showAdv ? 'Ocultar avançada' : 'Busca avançada'}
          </button>
        </form>
        <button className="secondary" onClick={() => setShowCols(!showCols)}>⚙ Colunas</button>
        <button onClick={() => setShowNew(true)}>+ Novo slot</button>
      </div>

      {showCols && (
        <div className="modal-overlay" onClick={() => setShowCols(false)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="row" style={{ alignItems: 'center' }}>
              <h3 style={{ margin: 0, flex: 1 }}>Colunas da lista</h3>
              <button type="button" onClick={() => setShowCols(false)}>✕</button>
            </div>
            <p className="muted" style={{ marginTop: -6 }}>Marque para exibir e arraste para reordenar. Fica salvo para o seu usuário.</p>
            {columns.map((c, i) => (
              <div
                key={c.key}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null || dragIndex === i) return;
                  const order = [...(colConf?.order || [])];
                  const from = order.indexOf(c.key);
                  if (from === -1) return;
                  order.splice(from, 1);
                  const to = order.indexOf(columns[i].key);
                  order.splice(to < 0 ? order.length : to, 0, c.key);
                  saveConf({ order, hidden: colConf?.hidden || [] });
                  setDragIndex(null);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  border: '1px solid rgba(255,255,255,.12)', borderRadius: 6, marginBottom: 4,
                  cursor: 'grab', background: dragIndex === i ? 'rgba(255,255,255,.08)' : undefined,
                  opacity: dragIndex === i ? 0.6 : 1,
                }}
              >
                <span className="muted" style={{ cursor: 'grab' }}>⠿</span>
                <label style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.visible} onChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
                <span className="muted" style={{ fontSize: 12 }}>{i + 1}º</span>
              </div>
            ))}
            <button type="button" className="secondary mt" onClick={resetCols}>Restaurar padrão</button>
          </div>
        </div>
      )}

      {showAdv && (
        <div className="card mb">
          <h3>Busca avançada (critérios combinados)</h3>
          {criterias.map((c, i) => (
            <div className="row mb" key={i}>
              <select style={{ maxWidth: 180 }} value={c.field} onChange={e => setCrit(i, 'field', e.target.value)}>
                {FIELDS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select style={{ maxWidth: 140 }} value={c.op} onChange={e => setCrit(i, 'op', e.target.value)}>
                <option value="contains">contém</option>
                <option value="equals">igual a</option>
                <option value="starts">começa com</option>
                <option value="empty">vazio</option>
                <option value="notempty">preenchido</option>
              </select>
              <input style={{ maxWidth: 260 }} value={c.value} onChange={e => setCrit(i, 'value', e.target.value)}
                disabled={['empty', 'notempty'].includes(c.op)} />
              <button type="button" className="secondary" onClick={() => setCriterias(cs => cs.filter((_, j) => j !== i))}>✕</button>
            </div>
          ))}
          <div className="row">
            <button type="button" className="secondary" onClick={() => setCriterias(cs => [...cs, { field: 'nome', op: 'contains', value: '' }])}>
              + Critério
            </button>
            <select style={{ maxWidth: 230 }} value={hasAttachment} onChange={e => setHasAttachment(e.target.value)}>
              <option value="">Com ou sem anexo</option>
              <option value="true">Somente com anexo 📎</option>
              <option value="false">Somente sem anexo</option>
            </select>
            <button onClick={search}>Aplicar filtros</button>
            <button className="secondary" onClick={() => { setSimple(''); setHasAttachment(''); setCriterias([{ field: 'codigo', op: 'contains', value: '' }]); search(); }}>
              Limpar
            </button>
          </div>
        </div>
      )}

      {error && <div className="error-msg">{error}</div>}

      {selected.length > 0 && (
        <div className="row mb">
          <span className="muted">{selected.length} selecionado(s)</span>
          <button onClick={() =>
            import('../api').then(({ downloadPost }) =>
              downloadPost('/batch/export', { ids: selected, format: 'dwg' }, 'cadbank-dwg.zip').catch(e => alert(e.message))
            )
          }>⬇ Baixar DWGs (revisão atual)</button>
          <button onClick={() =>
            import('../api').then(({ downloadPost }) =>
              downloadPost('/batch/export', { ids: selected, format: 'pdf' }, 'cadbank-pdf.zip').catch(e => alert(e.message))
            )
          }>⬇ Baixar PDFs (revisão atual)</button>
        </div>
      )}

      <div className="card">
        <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}><input type="checkbox" checked={selected.length > 0 && selected.length === data.items.length} onChange={toggleAll} /></th>
              {visibleCols.map(c => (
                <th
                  key={c.key}
                  className="sortable-th"
                  style={{ cursor: 'pointer', whiteSpace: 'nowrap', opacity: dragColKey === c.key ? 0.5 : 1 }}
                  title="Clique para ordenar; arraste para reordenar a coluna"
                  draggable
                  onDragStart={() => setDragColKey(c.key)}
                  onDragEnd={() => setDragColKey(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); reorderHeader(c.key); }}
                  onClick={() => clickSort(c.key)}
                >
                  {c.label}{sortIcon(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map(d => (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => nav('/drawings/' + d.id)}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} /></td>
                {visibleCols.map(c => (
                  <td key={c.key} className={TEXT_ELLIPSIS_KEYS.includes(c.key) ? 'cell-ellipsis' : undefined} title={TEXT_ELLIPSIS_KEYS.includes(c.key) ? String(d[c.key] || '') : undefined}>
                    {cell(d, c.key)}
                  </td>
                ))}
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={visibleCols.length + 1} className="muted" style={{ textAlign: 'center', padding: 30 }}>Nenhum desenho encontrado</td></tr>}
          </tbody>
        </table>
        </div>
        <div className="pagination">
          <span>{data.total} registro(s)</span>
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Itens por página
            <select value={pageSize} onChange={e => setPageSize(parseInt(e.target.value, 10))} style={{ width: 'auto' }}>
              {PAGE_SIZES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="secondary" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); load(p); }}>‹</button>
          <span>{page} / {Math.max(1, Math.ceil(data.total / pageSize))}</span>
          <button className="secondary" disabled={page >= Math.ceil(data.total / pageSize)} onClick={() => { const p = page + 1; setPage(p); load(p); }}>›</button>
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <form className="modal" style={{ width: 760 }} onClick={e => e.stopPropagation()} onSubmit={create}>
            <h2>Novo slot de desenho</h2>
            <div className="grid2">
              <div className="field"><label>Código/Nº do desenho *</label><input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} required /></div>
              <div className="field"><label>Nome *</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} required /></div>
              <div className="field"><label>Desenhista</label><input value={form.desenhista} onChange={e => setForm({ ...form, desenhista: e.target.value })} /></div>
              <div className="field"><label>Projetista</label><input value={form.projetista} onChange={e => setForm({ ...form, projetista: e.target.value })} /></div>
              <div className="field"><label>Empresa (Cliente)</label><input value={form.empresa} onChange={e => setForm({ ...form, empresa: e.target.value })} /></div>
              <div className="field"><label>Planta</label><input value={form.planta} onChange={e => setForm({ ...form, planta: e.target.value })} /></div>
              <div className="field"><label>Formato da folha</label>
                <select value={form.formato_folha} onChange={e => setForm({ ...form, formato_folha: e.target.value })}>
                  <option value="">—</option>
                  {['A0','A1','A2','A3','A4','A5','A6','A7','A8'].map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </div>
              <div className="field"><label>Tag</label><input value={form.tag} onChange={e => setForm({ ...form, tag: e.target.value })} /></div>
              <div className="field"><label>OS</label><input value={form.os} onChange={e => setForm({ ...form, os: e.target.value })} /></div>
            </div>
            <div className="field"><label>Descrição</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div className="field"><label>Anotações</label><textarea value={form.anotacoes} onChange={e => setForm({ ...form, anotacoes: e.target.value })} /></div>
            <div className="field">
              <label>Desenho (DWG/DXF) — opcional, será salvo como <b>Revisão 0</b></label>
              <input type="file" ref={newFileRef} accept=".dwg,.dxf" />
            </div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button type="submit">Criar slot</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
