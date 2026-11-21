import { getStore } from '@netlify/blobs';
import { handleAccount } from '../../server/accounts.ts';
import type { AccountStore } from '../../server/accounts.ts';
import { ADMIN_SETUP_DIGEST } from '../../server/admin-setup.ts';

export default async function account(request: Request, context: { ip: string }) {
  const blobs = getStore({ name: 'voltroar-accounts-v1', consistency: 'strong' });
  const store: AccountStore = {
    async read<T>(key: string) {
      const entry = await blobs.getWithMetadata(key, { type: 'json' });
      if (!entry) return null;
      if (!entry.etag) throw new Error('Account store revision unavailable.');
      return { data: entry.data as T, etag: entry.etag };
    },
    async write(key, value, options) {
      return (await blobs.setJSON(key, value, options)).modified;
    },
    async list(prefix) {
      return (await blobs.list({ prefix })).blobs.map(({ key }) => key);
    },
  };
  return handleAccount(request, store, context.ip, process.env.VOLTROAR_ADMIN_SETUP_DIGEST || ADMIN_SETUP_DIGEST);
}
