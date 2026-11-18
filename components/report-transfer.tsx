'use client';

import { useEffect, useRef, useState } from 'react';
import { downloadReport, importReportLink, makeReportLinks, SAVED_REPORT_KEY, saveLocalReport } from '../lib/report-transfer';

type Panel =
  | { kind: 'send'; json: string; persisted: boolean; links: string[]; error?: string }
  | { kind: 'received'; json: string; persisted: boolean }
  | { kind: 'progress'; received: number; total: number }
  | { kind: 'error'; message: string };

function browserStorage() {
  try { return window.localStorage; } catch { return undefined; }
}

function QrImage({ link }: { link: string }) {
  const [image, setImage] = useState<string>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    void import('qrcode').then(({ default: qr }) => qr.toDataURL(link, {
      errorCorrectionLevel: 'M', scale: 5, margin: 4,
    })).then(
      (data) => { if (current) setImage(data); },
      () => { if (current) setFailed(true); },
    );
    return () => { current = false; };
  }, [link]);

  if (failed) return <p role="alert">Could not generate the QR code. You can still view the JSON below.</p>;
  if (!image) return <p role="status">Generating QR code…</p>;
  return <img className="report-qr" src={image} alt="Scan this QR code to transfer the VoltSound report" />;
}

export default function ReportTransfer({ hasRun, getExport }: {
  hasRun: boolean;
  getExport: () => string | null;
}) {
  const [saved, setSaved] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const [index, setIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const open = panel !== null;

  useEffect(() => {
    const storage = browserStorage();
    try { setSaved(storage?.getItem(SAVED_REPORT_KEY) ?? null); } catch { /* QR still works. */ }

    function receive() {
      const hash = window.location.hash;
      if (!hash.startsWith('#voltsound-report=')) return;
      setNotice('');
      try {
        const result = importReportLink(hash, storage);
        if (!result) return;
        if ('json' in result) {
          if (result.saved) setSaved(result.json);
          setPanel({ kind: 'received', json: result.json, persisted: result.saved });
        } else setPanel({ kind: 'progress', ...result });
      } catch (error) {
        setPanel({ kind: 'error', message: error instanceof Error ? error.message : 'Could not read this report.' });
      }
      // Keep the report payload out of the address bar after consuming it.
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    }

    receive();
    window.addEventListener('hashchange', receive);
    return () => window.removeEventListener('hashchange', receive);
  }, []);

  useEffect(() => {
    if (open && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [open]);

  function showReport() {
    const json = hasRun ? getExport() : saved;
    if (!json) return;
    const persisted = hasRun ? saveLocalReport(browserStorage(), json) : true;
    if (persisted) setSaved(json);
    setIndex(0);
    setNotice('');
    try {
      setPanel({ kind: 'send', json, persisted, links: makeReportLinks(json, window.location.href) });
    } catch (error) {
      setPanel({
        kind: 'send', json, persisted, links: [],
        error: error instanceof Error ? error.message : 'Could not prepare QR transfer.',
      });
    }
  }

  async function copy(json: string) {
    try {
      await navigator.clipboard.writeText(json);
      setNotice('JSON copied.');
    } catch {
      setNotice('Clipboard is unavailable. Select and copy the JSON below, or use Download JSON.');
    }
  }

  function jsonActions(json: string) {
    return (
      <>
        <div className="actions">
          <button className="button primary" onClick={() => void copy(json)}>Copy JSON</button>
          <button className="button" onClick={() => {
            try { downloadReport(json); } catch { setNotice('Download unavailable. Copy the JSON below.'); }
          }}>Download JSON</button>
        </div>
        {notice && <p role="status">{notice}</p>}
      </>
    );
  }

  return (
    <>
      <button className="button" disabled={!hasRun && !saved} onClick={showReport}>
        {!hasRun && saved ? 'Open Saved Report' : 'Save Report'}
      </button>
      <dialog ref={dialog} className="panel report-dialog" aria-labelledby="report-title" onClose={() => setPanel(null)}>
        {panel && (
          <>
            <div className="panel-heading">
              <h2 id="report-title">{panel.kind === 'send' ? 'Diagnostic report' : 'Import diagnostic report'}</h2>
              <form method="dialog"><button className="button">Close</button></form>
            </div>
            <div className="report-dialog-body">
              {panel.kind === 'send' && (
                <>
                  <p role="status">{panel.persisted ? 'Saved in this browser.' : 'Browser storage is unavailable. Transfer this report before closing the page.'}</p>
                  {panel.links.length > 0 && (
                    <>
                      <p>Scan with your phone’s camera and open the link. {panel.links.length > 1 && 'Open every QR link in the same phone browser.'}</p>
                      <QrImage key={panel.links[index]} link={panel.links[index]} />
                      {panel.links.length > 1 && (
                        <div className="report-pagination">
                          <button className="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
                          <span aria-live="polite">QR {index + 1} / {panel.links.length}</span>
                          <button className="button" disabled={index === panel.links.length - 1} onClick={() => setIndex(index + 1)}>Next</button>
                        </div>
                      )}
                    </>
                  )}
                  {panel.error && <p role="alert">{panel.error}</p>}
                  <details>
                    <summary>View saved JSON</summary>
                    {jsonActions(panel.json)}
                    <textarea aria-label="Saved diagnostic JSON" value={panel.json} readOnly rows={6} />
                  </details>
                </>
              )}
              {panel.kind === 'progress' && <p role="status">{panel.received} / {panel.total} QR codes received. Open the remaining QR links in this browser.</p>}
              {panel.kind === 'error' && <p role="alert">{panel.message}</p>}
              {panel.kind === 'received' && (
                <>
                  <p role="status">{panel.persisted ? 'Report received and saved in this browser.' : 'Report received. Copy or download it before closing this page.'}</p>
                  <p>Attach the JSON file in Codex or paste the copied report into your message.</p>
                  {jsonActions(panel.json)}
                  <textarea aria-label="Imported diagnostic JSON" value={panel.json} readOnly rows={8} />
                </>
              )}
            </div>
          </>
        )}
      </dialog>
    </>
  );
}
