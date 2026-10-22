import React, { useEffect, useRef, useState } from 'react';
import { api } from '../api';

export default function Admin() {
  const [tab, setTab] = useState('users');
  return (
    <div>
      <h2 className="mb">Administração</h2>
      <div className="tabs">
        <button className={tab === 'users' ? 'active' : ''} onClick={() => setTab('users')}>Usuários</button>
        <button className={tab === 'settings' ? 'active' : ''} onClick={() => setTab('settings')}>Configurações</button>
        <button className={tab === 'backup' ? 'active' : ''} onClick={() => setTab('backup')}>Backup</button>
        <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>Logs de erro</button>
      </div>
      {tab === 'users' && <Users />}
      {tab === 'settings' && <Settings />}
      {tab === 'backup' && <Backup />}
      {tab === 'logs' && <Logs />}
    </div>
  );
}

function Logs() {
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState('');
  const [lines, setLines] = useState(null);
  const [error, setError] = useState('');
  const [levelFilter, setLevelFilter] = useState('');

  const loadFiles = () => api('/logs').then(d => {
    setFiles(d.files);
    if (d.files.length && !selected) setSelected(d.files[0].date);
  }).catch(e => setError(e.message));

  useEffect(() => { loadFiles(); }, []);
  useEffect(() => {
    if (!selected) return;
    setLines(null);
    api('/logs/' + selected).then(d => setLines(d.lines)).catch(e => setError(e.message));
  }, [selected]);

  const filtered = (lines || []).filter(l => !levelFilter || l.level === levelFilter);

  const clear = async () => {
    if (!confirm(`Apagar o log de ${selected}?`)) return;
    await api('/logs/' + selected, { method: 'DELETE' });
    setSelected('');
    setLines([]);
    loadFiles();
  };

  const download = () => {
    import('../api').then(({ downloadFile }) =>
      downloadFile(`/logs/${selected}/download`, `app-${selected}.log`).catch(e => alert(e.message)));
  };

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      <div className="row mb">
        <select style={{ maxWidth: 200 }} value={selected} onChange={e => setSelected(e.target.value)}>
          {!files.length && <option value="">Nenhum log</option>}
          {files.map(f => <option key={f.date} value={f.date}>{f.date} ({(f.size / 1024).toFixed(1)} KB)</option>)}
        </select>
        <select style={{ maxWidth: 140 }} value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
          <option value="">Todos os níveis</option>
          <option value="ERROR">ERROR</option>
          <option value="WARN">WARN</option>
          <option value="INFO">INFO</option>
        </select>
        <span className="spacer" />
        {selected && <>
          <button className="secondary" onClick={download}>⬇ Baixar .log</button>
          <button className="danger" onClick={clear}>🗑 Limpar este dia</button>
        </>}
      </div>
      <div className="card">
        {lines === null && <div className="muted">Carregando...</div>}
        {lines !== null && !filtered.length && <div className="muted" style={{ textAlign: 'center', padding: 30 }}>Nenhum registro</div>}
        {filtered.length > 0 && (
          <table>
            <thead><tr><th style={{ width: 170 }}>Data/Hora</th><th style={{ width: 80 }}>Nível</th><th style={{ width: 110 }}>Origem</th><th>Mensagem</th></tr></thead>
            <tbody>
              {filtered.map((l, i) => (
                <tr key={i}>
                  <td className="muted">{new Date(l.ts).toLocaleString('pt-BR')}</td>
                  <td>
                    <span className="badge" style={{
                      background: l.level === 'ERROR' ? 'rgba(239,68,68,.12)' : l.level === 'WARN' ? 'rgba(245,158,11,.12)' : 'rgba(34,197,94,.12)',
                      color: l.level === 'ERROR' ? '#f87171' : l.level === 'WARN' ? '#fbbf24' : 'var(--ok)',
                      border: '1px solid rgba(255,255,255,.08)'
                    }}>{l.level}</span>
                  </td>
                  <td>{l.source}</td>
                  <td style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {l.message}
                    {l.detail && <details><summary className="muted" style={{ cursor: 'pointer' }}>detalhes</summary><pre style={{ fontSize: 12, whiteSpace: 'pre-wrap', color: 'var(--muted)' }}>{l.detail}</pre></details>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <p className="muted mt">Logs com mais de 30 dias são apagados automaticamente. Erros do visualizador (viewer) e da conversão ODA aparecem aqui.</p>
    </div>
  );
}

function Users() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role: 'viewer' });

  const load = () => api('/auth/users').then(setUsers).catch(e => setError(e.message));
  useEffect(() => { load(); }, []);

  const create = async (e) => {
    e.preventDefault();
    setError('');
    try {
      await api('/auth/users', { method: 'POST', body: JSON.stringify(form) });
      setForm({ username: '', password: '', full_name: '', role: 'viewer' });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const update = async (u, patch) => {
    try {
      await api('/auth/users/' + u.id, { method: 'PUT', body: JSON.stringify(patch) });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      {error && <div className="error-msg">{error}</div>}
      <form className="card mb" onSubmit={create}>
        <h3>Novo usuário</h3>
        <div className="grid2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr auto', alignItems: 'end' }}>
          <div className="field"><label>Usuário</label><input value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} required /></div>
          <div className="field"><label>Senha</label><input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required /></div>
          <div className="field"><label>Nome completo</label><input value={form.full_name} onChange={e => setForm({ ...form, full_name: e.target.value })} /></div>
          <div className="field">
            <label>Perfil</label>
            <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
              <option value="viewer">Visualizador (leitura)</option>
              <option value="editor">Editor (leitura + escrita)</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <button type="submit">Criar</button>
        </div>
      </form>
      <div className="card">
        <table>
          <thead><tr><th>Usuário</th><th>Nome</th><th>Perfil</th><th>Ativo</th><th>Ações</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id}>
                <td><b>{u.username}</b></td>
                <td>{u.full_name}</td>
                <td>
                  <select value={u.role} onChange={e => update(u, { role: e.target.value })} disabled={u.username === 'admin'}>
                    <option value="viewer">Visualizador</option>
                    <option value="editor">Editor</option>
                    <option value="admin">Admin</option>
                  </select>
                </td>
                <td>{u.active ? '✅' : '❌'}</td>
                <td className="row">
                  <button className="secondary" onClick={() => {
                    const p = prompt('Nova senha para ' + u.username);
                    if (p) update(u, { password: p });
                  }}>Senha</button>
                  {u.username !== 'admin' && (
                    <>
                      <button className="secondary" onClick={() => update(u, { active: u.active ? 0 : 1 })}>
                        {u.active ? 'Desativar' : 'Ativar'}
                      </button>
                      <button className="danger" onClick={async () => {
                        if (!confirm(`Excluir definitivamente o usuário "${u.username}"? Ele não poderá mais entrar e os registros ficarão sem autoria.`)) return;
                        try {
                          await api('/auth/users/' + u.id, { method: 'DELETE' });
                          load();
                        } catch (e) { alert(e.message); }
                      }}>🗑 Excluir</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Settings() {
  const [s, setS] = useState({ oda_path: '', backup_cron: '', backup_dir: '', auto_convert: '1' });
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/settings').then(setS).catch(() => {}); }, []);

  const save = async (e) => {
    e.preventDefault();
    try {
      await api('/settings', { method: 'PUT', body: JSON.stringify(s) });
      setMsg('Configurações salvas.');
    } catch (err) {
      setMsg('Erro: ' + err.message);
    }
  };

  return (
    <form className="card" onSubmit={save}>
      {msg && <div className={msg.startsWith('Erro') ? 'error-msg' : 'success-msg'}>{msg}</div>}
      <div className="field">
        <label>Caminho do ODAFileConverter.exe (para conversão DWG→PDF)</label>
        <input value={s.oda_path} onChange={e => setS({ ...s, oda_path: e.target.value })}
          placeholder="C:\\Program Files\\ODA\\ODAFileConverter.exe" />
      </div>
      <div className="field">
        <label>
          <input type="checkbox" style={{ width: 'auto', marginRight: 8 }} checked={s.auto_convert === '1'}
            onChange={e => setS({ ...s, auto_convert: e.target.checked ? '1' : '0' })} />
          Converter DWG→PDF automaticamente no upload (tarefa em background)
        </label>
      </div>
      <div className="field">
        <label>Backup automático — expressão cron (vazio = desativado). Ex: 0 3 * * * = todo dia às 03:00</label>
        <input value={s.backup_cron} onChange={e => setS({ ...s, backup_cron: e.target.value })} placeholder="0 3 * * *" />
      </div>
      <button>Salvar configurações</button>
    </form>
  );
}

function Backup() {
  const [data, setData] = useState({ items: [] });
  const [msg, setMsg] = useState('');
  const [importing, setImporting] = useState(false);
  const fileRef = useRef(null);
  const load = () => api('/backup/list').then(setData).catch(e => setMsg(e.message));
  useEffect(() => { load(); }, []);

  const create = async () => {
    setMsg('Gerando backup...');
    try {
      const r = await api('/backup/create', { method: 'POST' });
      setMsg('Backup criado: ' + r.file);
      load();
    } catch (e) {
      setMsg('Erro: ' + e.message);
    }
  };

  const restore = async (name) => {
    if (!confirm(`Restaurar backup ${name}? O banco atual será substituído ao reiniciar o servidor.`)) return;
    try {
      const r = await api('/backup/restore', { method: 'POST', body: JSON.stringify({ name }) });
      setMsg(r.message);
    } catch (e) {
      setMsg('Erro: ' + e.message);
    }
  };

  const importBackup = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/\.zip$/i.test(file.name)) { alert('Selecione um arquivo .zip de backup do CadBank.'); return; }
    if (!confirm(`Importar e restaurar o backup "${file.name}"? O banco atual será substituído ao reiniciar o servidor.`)) return;
    setImporting(true);
    setMsg('Enviando backup...');
    try {
      const fd = new FormData();
      fd.append('backup', file);
      const r = await api('/backup/upload-restore', { method: 'POST', body: fd });
      setMsg(`Backup importado (${r.file}). ${r.message}`);
      load();
    } catch (err) {
      setMsg('Erro: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      {msg && <div className="success-msg">{msg}</div>}
      <div className="card mb">
        <h3>Backup manual</h3>
        <p className="muted mb">Gera um .zip com o banco de dados e todos os arquivos. Backups agendados ficam em <code>server/data/backups</code> (mantém os 20 mais recentes).</p>
        <div className="row">
          <button onClick={create}>📦 Criar backup agora</button>
          <span className="spacer" />
          <input ref={fileRef} type="file" accept=".zip" style={{ display: 'none' }} onChange={importBackup} />
          <button className="secondary" disabled={importing} onClick={() => fileRef.current && fileRef.current.click()}>
            {importing ? 'Enviando...' : '⬆ Importar backup (.zip) e restaurar'}
          </button>
        </div>
      </div>
      <div className="card">
        <h3>Backups disponíveis</h3>
        <table>
          <thead><tr><th>Arquivo</th><th>Tamanho</th><th>Data</th><th>Ações</th></tr></thead>
          <tbody>
            {data.items.map(b => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td className="muted">{(b.size / 1024 / 1024).toFixed(2)} MB</td>
                <td className="muted">{new Date(b.created).toLocaleString('pt-BR')}</td>
                <td className="row">
                  <button className="secondary" onClick={() =>
                    import('../api').then(({ downloadFile }) => downloadFile(`/backup/download/${b.name}`, b.name).catch(e => alert(e.message)))
                  }>Exportar (baixar)</button>
                  <button className="danger" onClick={() => restore(b.name)}>Restaurar</button>
                </td>
              </tr>
            ))}
            {!data.items.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center' }}>Nenhum backup ainda</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
