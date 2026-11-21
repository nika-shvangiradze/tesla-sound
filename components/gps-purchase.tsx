'use client';

import { useEffect, useRef, useState } from 'react';
import { PLANS, SUPPORT_PHONE, type PlanId } from '../lib/account-plans';

export default function GpsPurchase({ phone, onClose }: { phone: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const [planId, setPlanId] = useState<PlanId>('month');
  const plan = PLANS.find((item) => item.id === planId) ?? PLANS[0];
  const message = `გამარჯობა! მინდა VoltRoar GPS Drive-ის პაკეტი — ${plan.label}, ${plan.price} ლარი. ჩემი ანგარიშის ნომერია ${phone}.`;
  const whatsapp = `https://wa.me/${SUPPORT_PHONE.slice(1)}?text=${encodeURIComponent(message)}`;
  useEffect(() => {
    if (!ref.current?.open) ref.current?.showModal();
  }, []);
  return (
    <dialog className="panel purchase-dialog" ref={ref} aria-labelledby="purchase-title" onClose={onClose}>
      <div className="panel-heading">
        <h2 id="purchase-title">Unlock GPS Drive</h2>
        <form method="dialog"><button className="button">Close</button></form>
      </div>
      <div className="purchase-body">
        <p>აირჩიე პაკეტი და მოგვწერე WhatsApp-ზე გადარიცხვისა და აქტივაციისთვის.</p>
        <p className="purchase-phone">+995 551 099 081</p>
        <fieldset className="purchase-plans">
          <legend>Choose a plan</legend>
          {PLANS.map((item) => (
            <div key={item.id}>
              <input className="sr-only voice-radio" type="radio" name="gps-plan" id={`plan-${item.id}`}
                checked={planId === item.id} onChange={() => setPlanId(item.id)} />
              <label className="voice-card" htmlFor={`plan-${item.id}`}>
                <span>{item.label}</span><strong>₾{item.price}</strong>
              </label>
            </div>
          ))}
        </fieldset>
        <a className="button primary" href={whatsapp} target="_blank" rel="noopener noreferrer">Contact on WhatsApp</a>
      </div>
    </dialog>
  );
}
