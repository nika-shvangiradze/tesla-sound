'use client';

import Link from 'next/link';
import { IDLE_RPM } from '../lib/drive-model';
import { ENGINE_VOICES, VOICE_IDS } from '../lib/engine-wave';
import { useEngine } from '../lib/use-engine';

const gearNumbers = [1, 2, 3, 4, 5, 6];

export default function EngineConsole() {
  const engine = useEngine();
  const { frame, mode, path, state } = engine;
  const voice = ENGINE_VOICES[engine.voice];
  const { redlineRpm } = voice;
  const running = state === 'playing';
  const active = running || state === 'paused' || state === 'starting';
  const rpm = Math.min(frame.rpm, redlineRpm);
  const rpmPercent = (value: number) => (value - IDLE_RPM) / (redlineRpm - IDLE_RPM) * 100;
  const rpmLabels = [IDLE_RPM, ...[2_000, 3_000, 4_000, 5_000, 6_000, 7_000, 8_000]
    .filter((mark) => mark <= redlineRpm - 650), redlineRpm];
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
            <p>Synthesized engine sounds · six-speed virtual gearbox</p>
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
                <strong>{rpm.toLocaleString('en-US')}</strong><span>RPM</span>
              </div>
              <div
                className={`tach-track ${rpm >= redlineRpm - 800 ? 'tach-high' : ''}`}
                role="meter" aria-label="Engine RPM" aria-valuemin={IDLE_RPM} aria-valuemax={redlineRpm} aria-valuenow={rpm}
              >
                <div className="tach-fill" style={{ width: `${rpmPercent(rpm)}%` }} />
              </div>
              <div className="tach-labels" aria-hidden="true">
                {rpmLabels.map((mark) => (
                  <span key={mark} style={{ left: `${rpmPercent(mark)}%` }}>
                    {mark === IDLE_RPM ? mark : `${mark / 1000}K`}
                  </span>
                ))}
              </div>
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
                <button className="button" aria-pressed={mode === 'gps'} onClick={() => engine.setMode('gps')}>GPS Drive</button>
              </div>
              {mode === 'manual' ? (
                <div className="mode-controls">
                  <label className="dial-label" htmlFor="manual-rpm"><span>Target RPM</span><b>{engine.manualRpm.toLocaleString('en-US')}</b></label>
                  <input id="manual-rpm" type="range" min={IDLE_RPM} max={redlineRpm} step={20}
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
