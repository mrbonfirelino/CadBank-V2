import React, { useEffect, useRef, useState } from 'react';
import { api, fetchBlob } from '../api';

// URLs absolutas (BASE_URL = '/' em produção e dev) — paths relativos quebram
// em rotas aninhadas como /drawings/1 (o browser busca /drawings/1/assets/...)
const BASE = import.meta.env.BASE_URL || '/';
const MTEXT_WORKER = `${BASE}assets/mtext-renderer-worker.js`;
const DWG_WORKER = `${BASE}assets/libredwg-parser-worker.js`;

const WEBWORKER_FILE_URLS = {
  mtextRender: MTEXT_WORKER,
  dwgParser: DWG_WORKER
};

let inited = false;

async function ensureViewer(container) {
  const { AcApDocManager } = await import('@mlightcad/cad-simple-viewer');
  const { registerLibreDwgConverter } = await lazyRegister();
  registerLibreDwgConverter(DWG_WORKER);
  if (!inited) {
    AcApDocManager.createInstance({
      container,
      autoResize: true,
      useMainThreadDraw: true,
      webworkerFileUrls: WEBWORKER_FILE_URLS,
      checkWorkersOnInit: false
    });
    inited = true;
  }
  return AcApDocManager.instance;
}

async function lazyRegister() {
  const dataModel = await import('@mlightcad/data-model');
  const converter = await import('@mlightcad/libredwg-converter');
  return {
    registerLibreDwgConverter: (parserWorkerUrl) => {
      const c = new converter.AcDbLibreDwgConverter({
        convertByEntityType: false,
        useWorker: true,
        parserWorkerUrl
      });
      dataModel.AcDbDatabaseConverterManager.instance.register(
        dataModel.AcDbFileType.DWG,
        c
      );
    }
  };
}

// todo DWG válido começa com a assinatura da versão: AC1006..AC1032 etc.
function dwgSignature(buffer) {
  const head = new Uint8Array(buffer, 0, Math.min(6, buffer.byteLength));
  return String.fromCharCode(...head);
}

// Comandos aceitos pelo prompt do visualizador (mlightcad). O desenho é aberto
// apenas em memória — nenhum comando altera o arquivo do sistema.
const VIEWER_COMMANDS = [
  ['ZOOM', 'Zoom no desenho — opções: Extents (E), All (A), Window (W), Previous (P), Scale (S)'],
  ['ZOOM E', 'Enquadra todo o conteúdo (extents)'],
  ['ZOOM A', 'Enquadra os limites do desenho (all)'],
  ['PAN', 'Desloca a visualização (arrastar com botão do meio também funciona)'],
  ['REGEN', 'Regenera ( redesenha ) o desenho'],
  ['UNDO', 'Desfaz a última ação NESTA SESSÃO de visualização'],
  ['REDO', 'Refaz ação desfeita'],
  ['SELECT', 'Seleciona entidades na tela'],
  ['SYSVAR', 'Consulta/altera variáveis de sistema (apenas nesta sessão)'],
  ['SWITCHBG', 'Alterna fundo claro/escuro do canvas'],
  ['READINGMODE', 'Alterna modo de leitura (esconde painéis)'],
  ['CACHEFONT', 'Gerencia cache de fontes (textos do desenho)'],
  ['LOG', 'Mostra o log de comandos da sessão'],
  ['ABOUT', 'Sobre o visualizador']
];

export default function ViewerModal({ url, filename, onClose }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Carregando visualizador...');
  const [error, setError] = useState('');
  const [layoutNotice, setLayoutNotice] = useState(false);
  const [showCmds, setShowCmds] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { AcApDocManager } = await import('@mlightcad/cad-simple-viewer');
        const manager = await ensureViewer(containerRef.current);
        if (cancelled) return;

        setStatus('Verificando workers do visualizador...');
        let workersOk = true;
        try {
          workersOk = await AcApDocManager.checkWebworkerReadiness(WEBWORKER_FILE_URLS);
        } catch (e) {
          workersOk = false;
        }
        if (!workersOk) {
          const msg = `Worker do visualizador inacessível (${MTEXT_WORKER} / ${DWG_WORKER})`;
          setError('Falha interna do visualizador: scripts de worker não carregaram. O erro foi registrado nos logs.');
          api('/logs/client', { method: 'POST', body: JSON.stringify({ message: `Viewer: ${msg}`, context: { url, filename } }) }).catch(() => {});
          setStatus('');
          return;
        }

        setStatus('Baixando desenho...');
        const buffer = await fetchBlob(url);
        if (cancelled) return;

        const sig = dwgSignature(buffer);
        if (!/^AC\d{4}/.test(sig)) {
          const msg = `Viewer: arquivo não parece ser um DWG válido (${filename}, assinatura "${sig}", ${buffer.byteLength} bytes)`;
          setError('Este arquivo não parece ser um DWG válido (assinatura inválida). Verifique se o arquivo anexado é realmente um desenho DWG.');
          api('/logs/client', { method: 'POST', body: JSON.stringify({ message: msg, context: { url, filename } }) }).catch(() => {});
          setStatus('');
          return;
        }

        setStatus(`Processando DWG versão ${sig} (pode levar alguns segundos)...`);
        // openDocument pode não resolver (espera por fontes/glyphs deferidos) mesmo
        // com o db/view já prontos — por isso o race com timeout.
        const OPEN_TIMEOUT_MS = 60000;
        let ok = false;
        await Promise.race([
          manager.openDocument(filename, buffer, { minimumChunkSize: 1000 }).then((r) => { ok = r === true; }).catch(() => {}),
          new Promise((res) => setTimeout(res, OPEN_TIMEOUT_MS)),
        ]);
        if (!ok && !manager.curDocument) {
          setError(`Falha ao processar o desenho (versão ${sig}). A versão do DWG pode não ser suportada pelo visualizador. O erro foi registrado nos logs.`);
          api('/logs/client', {
            method: 'POST',
            body: JSON.stringify({
              message: `Viewer: openDocument retornou falha para ${filename}`,
              context: { url, filename, dwgVersion: sig, sizeBytes: buffer.byteLength }
            })
          }).catch(() => {});
        }
        // Auto-detecção: desenhos de template costumam ter o conteúdo apenas no
        // paper space (layout). Se o modelspace estiver vazio e houver geometry
        // no paper space, alterna para o layout e re-renderiza.
        try {
          const doc = manager.curDocument;
          const db = doc?.database;
          const bt = db?.tables?.blockTable;
          const countEntities = (rec) => {
            if (!rec || typeof rec.newIterator !== 'function') return 0;
            let n = 0;
            try { for (const e of rec.newIterator()) { if (e?.type !== 'Viewport') n++; } } catch { /* ignore */ }
            return n;
          };
          if (bt && countEntities(bt.modelSpace) === 0) {
            const ps = bt.getAt('*Paper_Space');
            if (ps && countEntities(ps) > 0) {
              // Troca manual de layout (replica o handler de layoutSwitched do AcTrView2d),
              // pois o layoutManager de uma import própria pode ser outra instância de módulo.
              const view = manager.curView;
              db.currentSpaceId = ps.objectId;
              if (view) {
                view.activeLayoutBtrId = ps.objectId;
                try { view.createLayoutViewIfNeeded?.(ps.objectId); } catch { /* ignore */ }
                try { view.loadLayoutEntitiesIfNeeded?.(ps.objectId); } catch { /* ignore */ }
                try { view.refreshCanvasBackgroundForActiveLayout?.(); } catch { /* ignore */ }
                view._isDirty = true;
                // enquadramento fire-and-forget do layout
                try { view.zoomToFitDrawing?.(30000, ps.objectId); } catch { /* ignore */ }
              }
              setLayoutNotice(true);
              api('/logs/client', {
                method: 'POST',
                body: JSON.stringify({
                  message: `Viewer: modelspace vazio, exibindo paper space (${filename})`,
                  context: { url, filename, dwgVersion: sig }
                })
              }).catch(() => {});
            }
          }
        } catch (switchErr) {
          console.warn('[Viewer] auto-detecção paper space falhou:', switchErr?.message);
        }
        setStatus('');
      } catch (e) {
        setError('Erro no visualizador: ' + e.message + ' — o erro foi registrado nos logs.');
        api('/logs/client', {
          method: 'POST',
          body: JSON.stringify({ message: `Viewer: ${e.message}`, stack: e.stack, context: { url, filename } })
        }).catch(() => {});
        setStatus('');
      }
    })();
    return () => { cancelled = true; };
  }, [url, filename]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal viewer-modal" onClick={e => e.stopPropagation()}>
        <div className="row mb" style={{ justifyContent: 'space-between' }}>
          <b>{filename}</b>
          <div className="row">
            {status && <span className="muted">{status}</span>}
            <button className="secondary" onClick={() => setShowCmds(true)}>⌨ Comandos</button>
            <button className="secondary" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="notice-msg">⚠ O desenho abre apenas para consulta — qualquer alteração feita aqui (zoom, pan, edição) <b>não será salva</b> no sistema.</div>
        {layoutNotice && (
          <div className="notice-msg">
            Este desenho não tem geometria no modelspace — exibindo o paper space (layout). Use zoom/pan para navegar.
          </div>
        )}
        <div className="viewer-container" ref={containerRef} />
        <div className="muted mt">Scroll = zoom · Botão do meio = pan · Clique = selecionar</div>
        {showCmds && (
          <div className="modal-overlay" onClick={() => setShowCmds(false)}>
            <div className="modal" style={{ width: 520, maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ margin: 0 }}>⌨ Comandos do visualizador</h2>
                <button className="secondary" onClick={() => setShowCmds(false)}>✕</button>
              </div>
              <p className="muted">Digite o comando no prompt na parte inferior do visualizador e pressione Enter. Opções aparecem como botões acima do prompt. As alterações afetam apenas esta sessão de visualização.</p>
              <table>
                <thead><tr><th style={{ width: 130 }}>Comando</th><th>Descrição</th></tr></thead>
                <tbody>
                  {VIEWER_COMMANDS.map(([cmd, desc]) => (
                    <tr key={cmd}><td><code>{cmd}</code></td><td>{desc}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
