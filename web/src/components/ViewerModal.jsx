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

export default function ViewerModal({ url, filename, onClose }) {
  const containerRef = useRef(null);
  const [status, setStatus] = useState('Carregando visualizador...');
  const [error, setError] = useState('');

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
        const ok = await manager.openDocument(filename, buffer, { minimumChunkSize: 1000 });
        if (!ok) {
          setError(`Falha ao processar o desenho (versão ${sig}). A versão do DWG pode não ser suportada pelo visualizador. O erro foi registrado nos logs.`);
          api('/logs/client', {
            method: 'POST',
            body: JSON.stringify({
              message: `Viewer: openDocument retornou falha para ${filename}`,
              context: { url, filename, dwgVersion: sig, sizeBytes: buffer.byteLength }
            })
          }).catch(() => {});
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
            <button className="secondary" onClick={onClose}>Fechar</button>
          </div>
        </div>
        {error && <div className="error-msg">{error}</div>}
        <div className="viewer-container" ref={containerRef} />
        <div className="muted mt">Scroll = zoom · Botão do meio = pan · Clique = selecionar</div>
      </div>
    </div>
  );
}
