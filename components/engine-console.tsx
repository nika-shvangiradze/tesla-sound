'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { IDLE_RPM } from '../lib/drive-model';
import { ENGINE_VOICES, VOICE_IDS } from '../lib/engine-wave';
import { useEngine } from '../lib/use-engine';
import InstrumentDials from './instrument-dials';
import { AccountMenu, useAccount } from './account';
import GpsPurchase from './gps-purchase';
import { hasGpsAccess } from '../lib/account-plans';

const gearNumbers = [1, 2, 3, 4, 5, 6];

export default function EngineConsole() {
  const engine = useEngine();
  const { account, gpsEnabled, refresh } = useAccount();
  const [purchase, setPurchase] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accessError, setAccessError] = useState('');
  const { frame, mode, path, state } = engine;
  const voice = ENGINE_VOICES[engine.voice];
  const { redlineRpm } = voice;
  const running = state === 'playing';
  const active = running || state === 'paused' || state === 'starting';
  const rpm = Math.min(frame.rpm, redlineRpm);
  const loadPercent = Math.round(frame.load * 100);
  const status = { off: 'Sound off', starting: 'Starting audio', playing: 'Sound on', paused: 'Audio paused', error: 'Audio error' }[state];
  const audioPath = path === 'worklet' ? 'AudioWorklet' : path === 'fallback' ? 'Web Audio fallback' : 'Web Audio';
  useEffect(() => {
    if (mode === 'gps' && !gpsEnabled) {
      engine.stop();
      engine.setMode('manual');
    }
  }, [mode, gpsEnabled]);

  async function checkGpsAccess() {
    setChecking(true);
    setAccessError('');
    try {
      const result = await refresh();
      if (hasGpsAccess(result.account, result.serverTime)) return true;
      if (result.account) setPurchase(true);
    } catch {
      setAccessError('GPS Drive access could not be verified. Try again.');
    } finally {
      setChecking(false);
    }
    return false;
  }

  return (
    <div className="shell engine-shell">
      <header className="topbar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></div>
        <div className="account-nav"><Link className="engine-nav" href="/diagnostic/">GPS Diagnostic</Link><AccountMenu /></div>
      </header>

      <main>
        <div className="engine-intro">
          <div>
            <h1>V8 GPS Edition<span>.</span></h1>
            <p>Synthesized engine sounds · six-speed virtual gearbox</p>
          </div>
          <div className="engine-actions">
            <button className="button primary" onClick={() => {
              if (mode === 'manual' || gpsEnabled) void engine.start();
              else void checkGpsAccess();
            }} disabled={running || state === 'starting' || checking}>
              <span className="play-icon" aria-hidden="true" />
              {state === 'paused' ? 'Resume Sound' : 'Start Sound'}
            </button>
            <button className="button" onClick={engine.stop} disabled={!active}>
              <span className="stop-icon" aria-hidden="true" />Stop Sound
            </button>
          </div>
        </div>

        <div className="engine-grid">
          <section className="panel engine-instruments" aria-labelledby="engine-instruments">
            <div className="panel-heading">
              <h2 id="engine-instruments">Engine instruments</h2>
              <span className={`badge ${running ? 'badge-good' : state === 'error' ? 'badge-warning' : ''}`} role="status">{status}</span>
            </div>
            <InstrumentDials voice={engine.voice} rpm={rpm} speed={frame.speed} />
            <dl className="engine-readings">
              <div><dt>Virtual gear</dt><dd>{frame.gear ?? '—'}</dd></div>
              <div><dt>Engine load</dt><dd>{loadPercent}<span>%</span></dd></div>
            </dl>
            <div className="engine-foot">
              <div className="drive-status">
                <span role="status">{frame.gpsStatus}</span>
                {frame.shift && <span className="badge badge-good">{frame.shift === 'up' ? 'Upshift' : 'Rev match'}</span>}
              </div>
              {mode === 'gps' && (
                <div className="gear-strip" aria-label="Six virtual gears">
                  {gearNumbers.map((gear) => <span key={gear} className={gear === frame.gear ? 'current-gear' : ''}>{gear}</span>)}
                </div>
              )}
            </div>
          </section>

          <section className="panel engine-settings" aria-labelledby="engine-controls">
            <div className="panel-heading"><h2 id="engine-controls">Sound controls</h2></div>
            <div className="engine-settings-body">
              <fieldset className="voice-picker">
                <legend>Engine sound</legend>
                <div className="voice-grid">
                  {VOICE_IDS.map((id) => {
                    const { make, model } = ENGINE_VOICES[id];
                    return (
                      <div key={id} className="voice-choice">
                        <input className="sr-only voice-radio" type="radio" name="engine-voice" id={`voice-${id}`}
                          value={id} checked={engine.voice === id} onChange={() => engine.setVoice(id)} />
                        <label className="voice-card" htmlFor={`voice-${id}`}>
                          <span className="voice-make">{make}</span>
                          <span className="voice-model">{model}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="voice-description">{voice.description}</p>
              </fieldset>
              <div className="mode-picker" aria-label="Engine mode" role="group">
                <button className="button" aria-pressed={mode === 'manual'} onClick={() => engine.setMode('manual')}>Manual Mode</button>
                <button className="button" aria-pressed={mode === 'gps'} disabled={checking} onClick={async () => {
                  if (await checkGpsAccess()) engine.setMode('gps');
                }}>GPS Drive {!gpsEnabled && <span className="gps-locked">Locked</span>}</button>
              </div>
              {mode === 'manual' ? (
                <div className="mode-controls">
                  <label className="dial-label" htmlFor="manual-rpm"><span>Target RPM</span><b>{engine.manualRpm.toLocaleString('en-US')}</b></label>
                  <input id="manual-rpm" type="range" min={IDLE_RPM} max={redlineRpm} step={redlineRpm % 20 === 0 ? 20 : 10}
                    value={engine.manualRpm} onChange={(event) => engine.setManualRpm(event.target.valueAsNumber)} />
                  <button className="button rev-button" onClick={engine.rev} disabled={!running}>Rev</button>
                </div>
              ) : (
                <div className="mode-controls drive-explanation">
                  <p>GPS speed controls RPM and shifts automatically. The engine returns to idle during a GPS gap.</p>
                </div>
              )}
              <div className="volume-controls">
                <label className="dial-label" htmlFor="volume"><span>Volume</span><b>{engine.volume}%</b></label>
                <input id="volume" type="range" min={0} max={100} value={engine.volume}
                  onChange={(event) => engine.setVolume(event.target.valueAsNumber)} />
              </div>
              <label className="worklet-option">
                <input type="checkbox" checked={engine.preferWorklet} disabled={active}
                  onChange={(event) => engine.setPreferWorklet(event.target.checked)} />
                Try AudioWorklet
              </label>
              {active && <p className="audio-path" role="status">{audioPath}</p>}
              {engine.error && <p className="engine-error" role="alert">{engine.error}</p>}
              {accessError && <p className="engine-error" role="alert">{accessError}</p>}
            </div>
          </section>
        </div>
      </main>
      {purchase && account && <GpsPurchase phone={account.phone} onClose={() => setPurchase(false)} />}
      <footer>
        <span>Start sound while parked. While moving, only a passenger should operate the screen.</span>
      </footer>
    </div>
  );
}
