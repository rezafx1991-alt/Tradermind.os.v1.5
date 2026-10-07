import { db, Account } from '../db/database';

function uuid(): string {
  return crypto.randomUUID();
}

export const accountService = {
  async getAll(): Promise<Account[]> {
    return db.accounts.orderBy('createdAt').toArray();
  },

  async getActive(): Promise<Account[]> {
    return db.accounts.filter(account => !account.isArchived).sortBy('createdAt');
  },

  async getById(id: string): Promise<Account | undefined> {
    return db.accounts.get(id);
  },

  async create(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Promise<Account> {
    const now = Date.now();
    const account: Account = {
      id: uuid(),
      ...data,
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.add(account);
    return account;
  },

  async update(id: string, data: Partial<Omit<Account, 'id' | 'createdAt'>>): Promise<void> {
    await db.accounts.update(id, { ...data, updatedAt: Date.now() });
  },

  async delete(id: string): Promise<void> {
    await this.setArchived(id, true);
  },

  async setArchived(id: string, isArchived: boolean): Promise<void> {
    await db.accounts.update(id, {
      isArchived,
      ...(isArchived ? { isDefault: false } : {}),
      updatedAt: Date.now(),
    });
  },

  async ensureDefault(): Promise<Account> {
    const existing = await db.accounts.filter(account => !account.isArchived).first();
    if (existing) return existing;
    return this.create({
      name: 'حساب اصلی',
      broker: '',
      currency: 'USD',
      initialBalance: null,
      currentBalance: null,
      color: '#3b82f6',
      isDefault: true,
      notes: null,
    });
  },
};
