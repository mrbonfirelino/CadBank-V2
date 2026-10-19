import React, { useEffect, useState } from 'react';
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
  ['os', 'OS'],
  ['anotacoes', 'Anotações']
];

const EMPTY = { codigo: '', nome: '', descricao: '', desenhista: '', projetista: '', empresa: '', planta: '', os: '', anotacoes: '' };

export default function Drawings() {
  const [simple, setSimple] = useState('');
  const [showAdv, setShowAdv] = useState(false);
  const [criterias, setCriterias] = useState([{ field: 'codigo', op: 'contains', value: '' }]);
  const [hasAttachment, setHasAttachment] = useState('');
  const [data, setData] = useState({ total: 0, items: [] });
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('updated_at');
  const [dir, setDir] = useState('desc');
  const [error, setError] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [selected, setSelected] = useState([]);
  const nav = useNavigate();

  const pageSize = 25;

  const load = async (p = page) => {
    setError('');
    try {
      const params = new URLSearchParams({
        simple, sort, dir, page: p, pageSize
      });
      if (hasAttachment) params.set('hasAttachment', hasAttachment);
      const active = criterias.filter(c => c.field && c.value);
      if (active.length) params.set('criterias', JSON.stringify(active));
      const d = await api('/drawings?' + params.toString());
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  };

  useEffect(() => { load(1); setPage(1); }, [sort, dir]);

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
      setShowNew(false);
      setForm(EMPTY);
      nav('/drawings/' + d.id);
    } catch (err) {
      setError(err.message);
    }
  };

  const exportBatch = async (format) => {
    if (!selected.length) return alert('Selecione desenhos na lista');
    try {
      const { downloadFile } = await import('../api');
      await downloadFile('/batch/export', 'cadbank-export.zip');
    } catch {}
  };

  const toggleAll = () => {
    if (selected.length === data.items.length) setSelected([]);
    else setSelected(data.items.map(i => i.id));
  };

  const toggle = (id) => {
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);
  };

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
        <button onClick={() => setShowNew(true)}>+ Novo slot</button>
      </div>

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
        <table>
          <thead>
            <tr>
              <th style={{ width: 30 }}><input type="checkbox" checked={selected.length > 0 && selected.length === data.items.length} onChange={toggleAll} /></th>
              <th style={{ cursor: 'pointer' }} onClick={() => { setSort('codigo'); setDir(dir === 'asc' ? 'desc' : 'asc'); }}>Código</th>
              <th style={{ cursor: 'pointer' }} onClick={() => { setSort('nome'); setDir(dir === 'asc' ? 'desc' : 'asc'); }}>Nome</th>
              <th>Desenhista</th>
              <th>Projetista</th>
              <th>Cliente</th>
              <th>Planta</th>
              <th>OS</th>
              <th>Rev.</th>
              <th>Anexo</th>
              <th>Atualizado</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map(d => (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => nav('/drawings/' + d.id)}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" checked={selected.includes(d.id)} onChange={() => toggle(d.id)} /></td>
                <td><Link to={'/drawings/' + d.id} onClick={e => e.stopPropagation()}><b>{d.codigo}</b></Link></td>
                <td>{d.nome}</td>
                <td>{d.desenhista}</td>
                <td>{d.projetista}</td>
                <td>{d.empresa}</td>
                <td>{d.planta}</td>
                <td>{d.os}</td>
                <td>{d.ultima_revisao ? 'R' + d.ultima_revisao : '—'}</td>
                <td>
                  {d.has_attachment
                    ? <span className="badge attached">📎 anexado</span>
                    : <span className="badge missing">sem anexo</span>}
                  {d.has_pdf ? <span className="badge pdf" style={{ marginLeft: 4 }}>PDF</span> : null}
                </td>
                <td className="muted">{d.updated_at}</td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={11} className="muted" style={{ textAlign: 'center', padding: 30 }}>Nenhum desenho encontrado</td></tr>}
          </tbody>
        </table>
        <div className="pagination">
          <span>{data.total} registro(s)</span>
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
              <div className="field"><label>OS</label><input value={form.os} onChange={e => setForm({ ...form, os: e.target.value })} /></div>
            </div>
            <div className="field"><label>Descrição</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
            <div className="field"><label>Anotações</label><textarea value={form.anotacoes} onChange={e => setForm({ ...form, anotacoes: e.target.value })} /></div>
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
