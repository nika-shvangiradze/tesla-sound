'use client';

import { useRef } from 'react';
import { useLanguage } from './language';

export default function EngineGuide() {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button type="button" className="button" aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}>
        {t('How to use')}
      </button>
      <dialog ref={dialog} className="panel engine-guide-dialog" aria-labelledby="engine-guide-title">
        <div className="panel-heading">
          <h2 id="engine-guide-title">{t('How to use')}</h2>
          <form method="dialog"><button className="button">{t('Close')}</button></form>
        </div>
        <div className="engine-guide-body">
          <ol>
            <li>{t('While parked, tap “{button}”', { button: t('Start Sound') })}</li>
            <li>{t('Choose a vehicle under “{section}”', { section: t('Engine sound') })}</li>
            <li>{t('Below the vehicle list, tap “{button}” and allow location access if prompted', { button: t('GPS Drive') })}</li>
            <li>{t('Wait for the GPS signal. As you drive, the synthesized engine sound follows your speed')}</li>
          </ol>
          <p>{t('An active plan is required for GPS Drive. While moving, let a passenger operate the screen')}</p>
          <p>{t('You can play music on your phone while listening to the engine sound')}</p>
        </div>
      </dialog>
    </>
  );
}
