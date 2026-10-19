import React, { useState } from 'react';
import { api } from '../api';

export default function Batch() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const importZip = async (e) => {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const fd = new FormData();
      fd.append('zip', file);
      const r = await api('/batch/import', { method: 'POST', body: fd });
      setResult(r);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h2 className="mb">Importação / Exportação em lote</h2>

      <div className="card mb">
        <h3>📥 Importar DWGs em lote</h3>
        <p className="muted mb">
          Envie um <b>.zip</b> contendo os arquivos .dwg/.dxf. O código de cada desenho será o nome do arquivo (sem extensão).
          Opcionalmente inclua um <code>meta.csv</code> (separador <code>;</code>) com os metadados:
        </p>
        <code className="mb" style={{ display: 'block', background: 'var(--panel2)', padding: 10, borderRadius: 6 }}>
          codigo;nome;descricao;desenhista;projetista;empresa;planta;os;anotacoes
        </code>
        <a href="/api/batch/import/template?token=" onClick={async (e) => {
          e.preventDefault();
          const { downloadFile } = await import('../api');
          downloadFile('/batch/import/template', 'meta.csv').catch(err => alert(err.message));
        }}>⬇ Baixar modelo do meta.csv</a>
        <form onSubmit={importZip} className="row mt">
          <input type="file" accept=".zip" onChange={e => setFile(e.target.files[0])} style={{ maxWidth: 400 }} />
          <button disabled={busy || !file}>{busy ? 'Importando...' : 'Importar'}</button>
        </form>
        {error && <div className="error-msg mt">{error}</div>}
        {result && (
          <div className="mt">
            <div className="success-msg">
              {result.imported.length} importado(s), {result.skipped.length} já existente(s) (ignorado(s)), {result.errors.length} erro(s).
            </div>
            {result.imported.length > 0 && <p><b>Importados:</b> {result.imported.join(', ')}</p>}
            {result.skipped.length > 0 && <p><b>Ignorados (código já existe):</b> {result.skipped.join(', ')}</p>}
            {result.errors.length > 0 && <p style={{ color: '#f87171' }}><b>Erros:</b> {result.errors.join(' | ')}</p>}
          </div>
        )}
      </div>

      <div className="card">
        <h3>📤 Exportar em lote</h3>
        <p className="muted">Na lista de desenhos, selecione os itens desejados (checkbox) e use os botões <b>Baixar DWGs</b> ou <b>Baixar PDFs</b> — um .zip será gerado com a revisão mais recente de cada desenho.</p>
      </div>
    </div>
  );
}
