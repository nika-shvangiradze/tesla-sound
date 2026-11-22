'use client';

import { useEffect, useState } from 'react';
import { ENGINE_VOICES, VOICE_IDS } from '../lib/engine-wave';
import { VEHICLES } from '../lib/vehicle-profiles';
import { useEngine } from '../lib/use-engine';
import InstrumentDials from './instrument-dials';
import { useAccount } from './account';
import SiteHeader from './site-header';
import { useLanguage } from './language';
import GpsPurchase from './gps-purchase';
import DiscordLink from './discord-link';
import EngineGuide from './engine-guide';
import { hasGpsAccess } from '../lib/account-plans';

export default function EngineConsole() {
  const engine = useEngine();
  const { t, message } = useLanguage();
  const { account, gpsEnabled, refresh } = useAccount();
  const [purchase, setPurchase] = useState(false);
  const [checking, setChecking] = useState(false);
  const [accessError, setAccessError] = useState('');
  const { frame, mode, path, state } = engine;
  const voice = ENGINE_VOICES[engine.voice];
  const { gearbox, engine: { idleRpm, limiterRpm } } = VEHICLES[engine.voice];
  const running = state === 'playing';
  const active = running || state === 'paused' || state === 'starting';
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
      <SiteHeader page="engine" />

      <main>
        <div className="engine-intro">
          <h1>Grand Theft Audio</h1>
          <div className="engine-actions">
            <button className="button primary" onClick={() => {
              if (mode === 'manual' || gpsEnabled) void engine.start();
              else void checkGpsAccess();
            }} disabled={running || state === 'starting' || checking}>
              <span className="play-icon" aria-hidden="true" />
              {t(state === 'paused' ? 'Resume Sound' : 'Start Sound')}
            </button>
            <button className="button" onClick={engine.stop} disabled={!active}>
              <span className="stop-icon" aria-hidden="true" />{t('Stop Sound')}
            </button>
            <EngineGuide />
          </div>
        </div>

        <div className="engine-grid">
          <section className="panel engine-instruments" aria-labelledby="engine-instruments">
            <div className="panel-heading">
              <h2 id="engine-instruments">{t('Engine instruments')}</h2>
              <span className={`badge ${running ? 'badge-good' : state === 'error' ? 'badge-warning' : ''}`} role="status">{t(status)}</span>
            </div>
            <InstrumentDials voice={engine.voice} rpm={frame.rpm} speed={frame.speed} />
            <dl className="engine-readings">
              <div><dt>{t('Simulated gear')}</dt><dd>{frame.gear ?? '—'}</dd></div>
              <div><dt>{t('Engine load')}</dt><dd>{loadPercent}<span>%</span></dd></div>
            </dl>
            <div className="engine-foot">
              <div className="drive-status">
                <span role="status">{t(frame.gpsStatus)}</span>
                {frame.shift && <span className="badge badge-good">{t(frame.shift === 'up' ? 'Upshift' : 'Rev match')}</span>}
              </div>
              {mode === 'gps' && (
                <div className="gear-strip" aria-label={t('Simulated forward gears')}>
                  {gearbox.ratios.map((_, index) => {
                    const gear = index + 1;
                    return <span key={gear} aria-current={gear === frame.gear ? 'true' : undefined}
                      className={gear === frame.gear ? 'current-gear' : ''}>{gear}</span>;
                  })}
                </div>
              )}
            </div>
            <p className="instrument-note">{t('RPM and gear are simulated')}{gearbox.estimatedGearing && ` · ${t('Estimated gearing')}`}</p>
          </section>

          <section className="panel engine-settings" aria-labelledby="engine-controls">
            <div className="panel-heading"><h2 id="engine-controls">{t('Sound controls')}</h2></div>
            <div className="engine-settings-body">
              <fieldset className="voice-picker">
                <legend>{t('Engine sound')}</legend>
                <div className="voice-grid">
                  {VOICE_IDS.map((id) => {
                    const { make, model } = VEHICLES[id];
                    return (
                      <div key={id} className="voice-choice" data-voice={id}>
                        <input className="sr-only voice-radio" type="radio" name="engine-voice" id={`voice-${id}`}
                          value={id} checked={engine.voice === id} onChange={() => engine.setVoice(id)} />
                        <label className="voice-card" htmlFor={`voice-${id}`}>
                          <span className="voice-make">{make}</span>
                          <span className="voice-model">{t(model)}</span>
                        </label>
                      </div>
                    );
                  })}
                </div>
                <p className="voice-description">{t(voice.description)}</p>
              </fieldset>
              <div className="mode-picker" aria-label={t('Engine mode')} role="group">
                <button className="button" aria-pressed={mode === 'manual'} onClick={() => engine.setMode('manual')}>{t('Manual Mode')}</button>
                <button className="button" aria-pressed={mode === 'gps'} disabled={checking} onClick={async () => {
                  if (await checkGpsAccess()) engine.setMode('gps');
                }}>{t('GPS Drive')} {!gpsEnabled && <span className="gps-locked">{t('Locked')}</span>}</button>
              </div>
              {mode === 'manual' ? (
                <div className="mode-controls">
                  <label className="dial-label" htmlFor="manual-rpm"><span>{t('Target RPM')}</span><b>{engine.manualRpm.toLocaleString('en-US')}</b></label>
                  <input id="manual-rpm" type="range" min={idleRpm} max={limiterRpm} step={10}
                    value={engine.manualRpm} onChange={(event) => engine.setManualRpm(event.target.valueAsNumber)} />
                  <button className="button rev-button" onClick={engine.rev} disabled={!running}>{t('Rev')}</button>
                </div>
              ) : (
                <div className="mode-controls drive-explanation">
                  <p>{t('Measured GPS speed drives automatic gear simulation')}</p>
                </div>
              )}
              <div className="volume-controls">
                <label className="dial-label" htmlFor="volume"><span>{t('Volume')}</span><b>{engine.volume}%</b></label>
                <input id="volume" type="range" min={0} max={100} value={engine.volume}
                  onChange={(event) => engine.setVolume(event.target.valueAsNumber)} />
              </div>
              <label className="worklet-option">
                <input type="checkbox" checked={engine.preferWorklet} disabled={active}
                  onChange={(event) => engine.setPreferWorklet(event.target.checked)} />
                {t('Try AudioWorklet')}
              </label>
              {active && <p className="audio-path" role="status">{t(audioPath)}</p>}
              {engine.error && <p className="engine-error" role="alert">{message(engine.error)}</p>}
              {accessError && <p className="engine-error" role="alert">{t(accessError)}</p>}
            </div>
          </section>
        </div>
      </main>
      {purchase && account && <GpsPurchase phone={account.phone} onClose={() => setPurchase(false)} />}
      <footer>
        <span>{t('Start sound while parked. While moving, only a passenger should operate the screen')}</span>
        <DiscordLink />
      </footer>
    </div>
  );
}
