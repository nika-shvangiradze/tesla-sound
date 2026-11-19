'use client';

import Link from 'next/link';
import { IDLE_RPM, REDLINE_RPM } from '../lib/drive-model';
import { ENGINE_VOICES, VOICE_IDS } from '../lib/engine-wave';
import { useEngine } from '../lib/use-engine';

const gearNumbers = [1, 2, 3, 4, 5, 6];

export default function EngineConsole() {
  const engine = useEngine();
  const { frame, mode, path, state } = engine;
  const running = state === 'playing';
  const active = running || state === 'paused' || state === 'starting';
  const rpmFill = (frame.rpm - IDLE_RPM) / (REDLINE_RPM - IDLE_RPM) * 100;
  const loadPercent = Math.round(frame.load * 100);
  const status = { off: 'Sound off', starting: 'Starting audio', playing: 'Sound on', paused: 'Audio paused', error: 'Audio error' }[state];
  const audioPath = path === 'worklet' ? 'AudioWorklet' : path === 'fallback' ? 'Web Audio fallback' : 'Web Audio';

  return (
    <div className="shell engine-shell">
      <header className="topbar">
        <div className="wordmark"><span className="brand-mark" aria-hidden="true"><i /></span>Volt<span>Sound</span></div>
        <Link className="engine-nav" href="/diagnostic/">GPS Diagnostic</Link>
      </header>

      <main>
        <div className="engine-intro">
          <div>
            <h1>V8 GPS Edition<span>.</span></h1>
            <p>Synthesized V8 · six-speed virtual gearbox</p>
          </div>
          <div className="engine-actions">
            <button className="button primary" onClick={() => void engine.start()} disabled={running || state === 'starting'}>
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
            <div className="tachometer">
              <div className="tach-reading">
                <strong>{frame.rpm.toLocaleString('en-US')}</strong><span>RPM</span>
              </div>
              <div
                className={`tach-track ${frame.rpm >= 6_000 ? 'tach-high' : ''}`}
                role="meter" aria-label="Engine RPM" aria-valuemin={IDLE_RPM} aria-valuemax={REDLINE_RPM} aria-valuenow={frame.rpm}
              >
                <div className="tach-fill" style={{ width: `${rpmFill}%` }} />
              </div>
              <div className="tach-labels" aria-hidden="true"><span>780</span><span>2K</span><span>3K</span><span>4K</span><span>5K</span><span>6K</span><span>6.8K</span></div>
            </div>
            <dl className="engine-readings">
              <div><dt>GPS speed</dt><dd>{frame.speed === null ? '—' : frame.speed.toFixed(1)} <span>km/h</span></dd></div>
              <div><dt>Virtual gear</dt><dd>{frame.gear ?? '—'}</dd></div>
              <div><dt>Engine load</dt><dd>{loadPercent}<span>%</span></dd></div>
            </dl>
            <div className="engine-foot">
              <span role="status">{frame.gpsStatus}</span>
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
              <div className="voice-picker">
                <div className="dial-label" id="engine-voice">Engine sound</div>
                <div className="mode-picker" aria-labelledby="engine-voice" role="group">
                  {VOICE_IDS.map((id) => (
                    <button key={id} className="button" aria-pressed={engine.voice === id} onClick={() => engine.setVoice(id)}>
                      {ENGINE_VOICES[id].label}
                    </button>
                  ))}
                </div>
                <p>{ENGINE_VOICES[engine.voice].description}</p>
              </div>
              <div className="mode-picker" aria-label="Engine mode" role="group">
                <button className="button" aria-pressed={mode === 'manual'} onClick={() => engine.setMode('manual')}>Manual Mode</button>
                <button className="button" aria-pressed={mode === 'gps'} onClick={() => engine.setMode('gps')}>GPS Drive</button>
              </div>
              {mode === 'manual' ? (
                <div className="mode-controls">
                  <label className="dial-label" htmlFor="manual-rpm"><span>Target RPM</span><b>{engine.manualRpm.toLocaleString('en-US')}</b></label>
                  <input id="manual-rpm" type="range" min={IDLE_RPM} max={REDLINE_RPM} step={20}
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
            </div>
          </section>
        </div>
      </main>
      <footer>
        <span>Start sound while parked. While moving, only a passenger should operate the screen.</span>
      </footer>
    </div>
  );
}
