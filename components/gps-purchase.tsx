'use client';

import { useEffect, useRef, useState } from 'react';
import { PLANS, SUPPORT_PHONE, type PlanId } from '../lib/account-plans';
import { useLanguage } from './language';

export default function GpsPurchase({ phone, onClose }: { phone: string; onClose: () => void }) {
  const { t } = useLanguage();
  const ref = useRef<HTMLDialogElement>(null);
  const draft = useRef<HTMLTextAreaElement>(null);
  const [planId, setPlanId] = useState<PlanId>('month');
  const [copyResult, setCopyResult] = useState<{ message: string; copied: boolean } | null>(null);
  const plan = PLANS.find((item) => item.id === planId) ?? PLANS[0];
  const message = t('Hi! I’d like the VoltRoar GPS Drive plan for {plan} (₾{price}). My account number is {phone}',
    { plan: t(plan.label), price: plan.price, phone });
  const text = encodeURIComponent(message);

  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(message);
      setCopyResult({ message, copied: true });
    } catch {
      draft.current?.focus();
      draft.current?.select();
      setCopyResult({ message, copied: false });
    }
  }

  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog className="panel purchase-dialog" ref={ref} aria-labelledby="purchase-title" onClose={onClose}>
      <div className="panel-heading">
        <h2 id="purchase-title">{t('Unlock GPS Drive')}</h2>
        <form method="dialog"><button className="button">{t('Close')}</button></form>
      </div>
      <div className="purchase-body">
        <p>{t('Choose a plan and a messaging app to contact us for payment and activation')}</p>
        <p className="purchase-phone">+995 551 099 081</p>
        <fieldset className="purchase-plans">
          <legend>{t('Choose a plan')}</legend>
          {PLANS.map((item) => (
            <div key={item.id}>
              <input className="sr-only voice-radio" type="radio" name="gps-plan" id={`plan-${item.id}`}
                checked={planId === item.id} onChange={() => { setPlanId(item.id); setCopyResult(null); }} />
              <label className="voice-card" htmlFor={`plan-${item.id}`}>
                <span>{t(item.label)}</span><strong>₾{item.price}</strong>
              </label>
            </div>
          ))}
        </fieldset>
        <section className="purchase-contact" aria-labelledby="purchase-contact">
          <h3 id="purchase-contact">{t('Choose a messaging app')}</h3>
          <div className="purchase-channels">
            <a className="button purchase-whatsapp" href={`https://wa.me/${SUPPORT_PHONE.slice(1)}?text=${text}`}
              target="_blank" rel="noopener noreferrer">
              <img className="messenger-icon" src="/icons/whatsapp.svg" width={17} height={17} alt="" />
              WhatsApp
            </a>
            <a className="button purchase-viber" href={`viber://chat?number=${encodeURIComponent(SUPPORT_PHONE)}`}>
              <img className="messenger-icon" src="/icons/viber.svg" width={17} height={17} alt="" />
              Viber
            </a>
            <a className="button purchase-telegram" href={`https://t.me/${SUPPORT_PHONE}?text=${text}`}
              target="_blank" rel="noopener noreferrer">
              <img className="messenger-icon" src="/icons/telegram.svg" width={17} height={17} alt="" />
              Telegram
            </a>
          </div>
          <details className="purchase-draft">
            <summary>{t('Prepared message')}</summary>
            <p>{t('Paste this message into Viber. If the chat doesn’t open, add the number above in Viber')}</p>
            <textarea ref={draft} aria-label={t('Prepared message')} readOnly rows={3} value={message} />
            <button className="button" type="button" onClick={() => void copyMessage()}>{t('Copy message')}</button>
            {copyResult?.message === message && <p role="status">{t(copyResult.copied ? 'Message copied' : 'Copy the selected text manually')}</p>}
          </details>
        </section>
      </div>
    </dialog>
  );
}
