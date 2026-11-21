'use client';

import { useLanguage } from './language';

export default function DiscordLink() {
  const { t } = useLanguage();
  return (
    <a className="button discord-link" href="https://discord.gg/8KnFEuE6p" target="_blank" rel="noopener noreferrer">
      {t('Suggest an idea on Discord')}
    </a>
  );
}
