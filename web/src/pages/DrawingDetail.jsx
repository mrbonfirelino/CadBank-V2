import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom';
import { api, downloadFile, fileUrl } from '../api';
import ViewerModal from '../components/ViewerModal';

const EMPTY = { codigo: '', nome: '', descricao: '', desenhista: '', projetista: '', empresa: '', planta: '', formato_folha: '', tag: '', os: '', anotacoes: '' };

export default function DrawingDetail() {
  const { id } = useParams();
  const { me } = useOutletContext();
  const nav = useNavigate();
  const canEdit = me?.role === 'admin' || me?.role === 'editor';

  const [drawing, setDrawing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [comments, setComments] = useState([]);
  const [comment, setComment] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [viewer, setViewer] = useState(null);
  const [uploadRev, setUploadRev] = useState(false);
  const [revFile, setRevFile] = useState(null);
  const [revDesc, setRevDesc] = useState('');
  const [revChoice, setRevChoice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await api('/drawings/' + id);
      setDrawing(d);
      setForm({ ...EMPTY, ...d });
      setRevisions(await api('/drawings/' + id + '/revisions'));
      setComments(await api('/drawings/' + id + '/comments'));
    } catch (e) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const save = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/drawings/' + id, { method: 'PUT', body: JSON.stringify(form) });
      setEditing(false);
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const del = async () => {
    if (!confirm('Excluir este slot e todas as revisões?')) return;
    await api('/drawings/' + id, { method: 'DELETE' });
    nav('/');
  };

  const uploadRevision = async (e) => {
    e.preventDefault();
    if (!revFile) return;
    setBusy(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('dwg', revFile);
      fd.append('descricao', revDesc);
      if (revChoice) fd.append('revisao', revChoice);
      const r = await api('/drawings/' + id + '/revisions', { method: 'POST', body: fd });
      setUploadRev(false);
      setRevFile(null);
      setRevDesc('');
      setRevChoice('');
      await load();
      setMsg(r.subrevision
        ? `Sub-revisão R${r.label} criada. As versões anteriores foram preservadas.`
        : `Revisão R${r.label} enviada. A conversão para PDF roda em background se o ODA estiver configurado.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const plot = async (rid) => {
    try {
      await api('/drawings/' + id + '/revisions/' + rid + '/plot', { method: 'POST' });
      setMsg('Conversão enfileirada. Atualize em alguns instantes.');
      setTimeout(load, 4000);
    } catch (e) {
      alert(e.message);
    }
  };

  const addComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;
    await api('/drawings/' + id + '/comments', { method: 'POST', body: JSON.stringify({ texto: comment }) });
    setComment('');
    setComments(await api('/drawings/' + id + '/comments'));
  };

  if (!drawing) return <div className="muted">Carregando...</div>;

  const latest = revisions[0];

  return (
    <div>
      <Link to="/">← Voltar à lista</Link>
      <h2 className="mt" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        {drawing.codigo} — {drawing.nome}
        {revisions.some(r => r.dwg_path !== undefined) && latest && <span className="badge attached">📎 anexado</span>}
        {latest?.pdf_status === 'done' && <span className="badge pdf">PDF</span>}
      </h2>
      {error && <div className="error-msg">{error}</div>}
      {msg && <div className="success-msg">{msg}</div>}

      <div className="row mb">
        {latest?.id && (
          <>
            <button onClick={() => setViewer({ url: `/drawings/${id}/revisions/${latest.id}/raw/dwg`, filename: drawing.codigo + '.dwg' })}>
              👁 Visualizar DWG
            </button>
            <button className="secondary" onClick={() => downloadFile(`/drawings/${id}/revisions/${latest.id}/download/dwg`, drawing.codigo + '-R' + latest.label + '.dwg')}>
              ⬇ Baixar DWG
            </button>
            <button className="secondary" disabled={!latest.pdf_status || latest.pdf_status !== 'done'}
              onClick={() => downloadFile(`/drawings/${id}/revisions/${latest.id}/download/pdf`, drawing.codigo + '-R' + latest.label + '.pdf')}>
              ⬇ Baixar PDF
            </button>
            {canEdit && <button className="secondary" onClick={() => plot(latest.id)}>🖨 Plotar em PDF</button>}
          </>
        )}
        {canEdit && <button onClick={() => setUploadRev(true)}>⬆ Nova revisão</button>}
        {canEdit && <button className="secondary" onClick={() => setEditing(!editing)}>✏ Editar dados</button>}
        {me?.role === 'admin' && <button className="danger" onClick={del}>🗑 Excluir</button>}
      </div>

      {editing ? (
        <form className="card mb" onSubmit={save}>
          <h3>Editar slot</h3>
          <div className="grid2">
            <div className="field"><label>Código *</label><input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} required /></div>
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
          <div className="row">
            <button type="submit">Salvar</button>
            <button type="button" className="secondary" onClick={() => { setEditing(false); setForm({ ...EMPTY, ...drawing }); }}>Cancelar</button>
          </div>
        </form>
      ) : (
        <div className="card mb">
          <div className="grid3">
            <div><label>Código</label><div>{drawing.codigo}</div></div>
            <div><label>Desenhista</label><div>{drawing.desenhista || '—'}</div></div>
            <div><label>Projetista</label><div>{drawing.projetista || '—'}</div></div>
            <div><label>Empresa (Cliente)</label><div>{drawing.empresa || '—'}</div></div>
            <div><label>Planta</label><div>{drawing.planta || '—'}</div></div>
            <div><label>Formato da folha</label><div>{drawing.formato_folha || '—'}</div></div>
            <div><label>Tag</label><div>{drawing.tag || '—'}</div></div>
            <div><label>OS</label><div>{drawing.os || '—'}</div></div>
          </div>
          <div className="mt"><label>Descrição</label><div>{drawing.descricao || '—'}</div></div>
          <div className="mt"><label>Anotações</label><div>{drawing.anotacoes || '—'}</div></div>
        </div>
      )}

      <h3>Revisões</h3>
      <div className="card mb">
        <table>
          <thead>
            <tr><th>Rev.</th><th>Descrição</th><th>Arquivo</th><th>Tamanho</th><th>Enviado por</th><th>Data</th><th>PDF</th><th></th></tr>
          </thead>
          <tbody>
            {revisions.map(r => (
              <tr key={r.id}>
                <td style={r.subrev > 0 ? { paddingLeft: 28 } : {}}>
                  <b>R{r.label}</b>{r.id === latest?.id && <span className="badge attached" style={{ marginLeft: 6 }}>atual</span>}
                  {r.subrev > 0 && <span className="badge missing" style={{ marginLeft: 6 }}>sub-revisão</span>}
                </td>
                <td>{r.descricao || '—'}</td>
                <td>{r.original_name}</td>
                <td className="muted">{r.dwg_size ? (r.dwg_size / 1024 / 1024).toFixed(2) + ' MB' : '—'}</td>
                <td>{r.uploaded_by_name || '—'}</td>
                <td className="muted">{r.created_at}</td>
                <td>
                  {r.pdf_status === 'done' ? <span className="badge pdf">pronto</span> :
                    r.pdf_status === 'pending' || r.pdf_status === 'running' ? <span className="badge missing">convertendo...</span> :
                    r.pdf_status === 'error' ? <span className="badge pdf" title="Erro na conversão">erro</span> : '—'}
                </td>
                <td className="row">
                  <button className="secondary" onClick={() => downloadFile(`/drawings/${id}/revisions/${r.id}/download/dwg`, `${drawing.codigo}-R${r.label}.dwg`)}>DWG</button>
                  {r.pdf_status === 'done' && <button className="secondary" onClick={() => downloadFile(`/drawings/${id}/revisions/${r.id}/download/pdf`, `${drawing.codigo}-R${r.label}.pdf`)}>PDF</button>}
                  <button className="secondary" onClick={() => setViewer({ url: `/drawings/${id}/revisions/${r.id}/raw/dwg`, filename: `${drawing.codigo}-R${r.label}.dwg` })}>👁</button>
                </td>
              </tr>
            ))}
            {!revisions.length && <tr><td colSpan={8} className="muted" style={{ textAlign: 'center', padding: 20 }}>
              Nenhuma revisão — este slot ainda não tem desenho anexado.
            </td></tr>}
          </tbody>
        </table>
      </div>

      <h3>Comentários</h3>
      <div className="card mb">
        <form onSubmit={addComment} className="row mb">
          <input style={{ flex: 1 }} placeholder="Escreva um comentário..." value={comment} onChange={e => setComment(e.target.value)} />
          <button type="submit">Comentar</button>
        </form>
        {comments.map(c => (
          <div key={c.id} style={{ borderBottom: '1px solid var(--border)', padding: '10px 0' }}>
            <b>{c.full_name || c.username}</b> <span className="muted">{c.created_at}</span>
            <div>{c.texto}</div>
          </div>
        ))}
        {!comments.length && <div className="muted">Sem comentários.</div>}
      </div>

      {uploadRev && (
        <div className="modal-overlay" onClick={() => setUploadRev(false)}>
          <form className="modal" onClick={e => e.stopPropagation()} onSubmit={uploadRevision}>
            <h2>Enviar desenho</h2>
            <div className="field">
              <label>Revisão</label>
              <select value={revChoice} onChange={e => setRevChoice(e.target.value)}>
                <option value="">R{(revisions[0]?.revisao || 0) + 1} — nova revisão</option>
                {revisions.filter((r, i, arr) => arr.findIndex(x => x.revisao === r.revisao) === i).map(r => (
                  <option key={r.revisao} value={r.revisao}>R{r.revisao} — criar sub-revisão (existente)</option>
                ))}
              </select>
            </div>
            {revChoice && (
              <div className="error-msg" style={{ background: 'rgba(245,158,11,.1)', borderColor: 'rgba(245,158,11,.4)', color: '#fbbf24' }}>
                ⚠ A revisão R{revChoice} já existe — será criada a sub-revisão <b>R{revChoice}.{(revisions.filter(r => r.revisao === parseInt(revChoice, 10)).reduce((m, r) => Math.max(m, r.subrev), 0) + 1)}</b>. As versões anteriores serão preservadas.
              </div>
            )}
            <div className="field">
              <label>Arquivo DWG/DXF *</label>
              <input type="file" accept=".dwg,.dxf" onChange={e => setRevFile(e.target.files[0])} required />
            </div>
            <div className="field"><label>Descrição da revisão</label><textarea value={revDesc} onChange={e => setRevDesc(e.target.value)} /></div>
            <div className="row" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="secondary" onClick={() => setUploadRev(false)}>Cancelar</button>
              <button type="submit" disabled={busy}>{busy ? 'Enviando...' : 'Enviar'}</button>
            </div>
          </form>
        </div>
      )}

      {viewer && <ViewerModal url={viewer.url} filename={viewer.filename} onClose={() => setViewer(null)} />}
    </div>
  );
}
