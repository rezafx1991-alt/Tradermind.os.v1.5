import { db, AnalysisSession } from '../db/database';

export const analysisService = {
  async getAllSessions() {
    return db.analysisSessions.orderBy('startedAt').reverse().toArray();
  },

  async getSessionById(id: string) {
    return db.analysisSessions.get(id);
  },

  async createSession(strategyId: string) {
    const id = crypto.randomUUID();
    const session: AnalysisSession = {
      id,
      strategyId,
      title: 'New Session',
      status: 'in-progress',
      startedAt: Date.now(),
      completedAt: null,
      currentPhaseId: null,
      currentStepId: null,
      stepResults: '{}',
      notes: null,
      tradeId: null,
      finalDecision: null
    };
    await db.analysisSessions.add(session);
    return session;
  },

  async updateSession(id: string, data: Partial<AnalysisSession>) {
    await db.analysisSessions.update(id, data);
    return db.analysisSessions.get(id);
  },

  async completeSession(id: string, notes?: string) {
    await db.analysisSessions.update(id, { 
      status: 'completed', 
      completedAt: Date.now(),
      ...(notes !== undefined && { notes })
    });
    return db.analysisSessions.get(id);
  },

  async abandonSession(id: string) {
    await db.analysisSessions.update(id, { status: 'abandoned' });
    return db.analysisSessions.get(id);
  },
  
  async deleteSession(id: string) {
    await db.analysisSessions.delete(id);
  }
};