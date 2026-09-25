const { and, eq, lte } = require('drizzle-orm');
const { ticketAIConfigs: configs, ticketAITicketStates: states, ticketAIRuns: runs, tickets } = require('../../database/schema');
const { PostgresTicketRepository } = require('./postgresTicketRepository');
const { DEFAULT_CONFIG } = require('../services/ticketAIContract');
const { clientError } = require('../../api/http/errors');
const scope = (table, guildId, ticketId) => and(eq(table.guildId, guildId), eq(table.ticketId, ticketId));

class PostgresTicketAIRepository {
  constructor(database) { this.db = database.db; }
  async getConfig(guildId, db = this.db) {
    const [row] = await db.select().from(configs).where(eq(configs.guildId, guildId));
    return Object.fromEntries(Object.keys(DEFAULT_CONFIG).map(key => [key, row?.[key] ?? DEFAULT_CONFIG[key]]));
  }
  async saveConfig(guildId, value) {
    await this.db.insert(configs).values({ guildId, ...value }).onConflictDoUpdate({ target: configs.guildId, set: { ...value, updatedAt: new Date() } });
    return this.getConfig(guildId);
  }
  async getState(guildId, ticketId) {
    const [state] = await this.db.select().from(states).where(scope(states, guildId, ticketId));
    return state || { paused: false, escalatedAt: null };
  }
  async locked(guildId, ticketId, operation) {
    return this.db.transaction(async tx => {
      // Ordem fixa; claim/close do Core também atualizam esta linha. Nunca mantém lock durante LLM.
      const [row] = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.guildId, guildId), eq(tickets.id, ticketId))).for('update');
      if (!row) throw clientError(404, 'Ticket não encontrado neste servidor.');
      await tx.insert(states).values({ guildId, ticketId }).onConflictDoNothing();
      const [state] = await tx.select().from(states).where(scope(states, guildId, ticketId)).for('update');
      if (!state) throw clientError(409, 'Estado de IA inconsistente.');
      // Garante que uma configuração OFF não seja ignorada por publicação em andamento.
      await tx.insert(configs).values({ guildId }).onConflictDoNothing();
      await tx.select({ id: configs.id }).from(configs).where(eq(configs.guildId, guildId)).for('update');
      const ticket = await new PostgresTicketRepository({ db: tx }).get(guildId, ticketId);
      const config = await this.getConfig(guildId, tx);
      return operation({ ticket, state, config, tx,
        patch: values => tx.update(states).set({ ...values, updatedAt: new Date() }).where(scope(states, guildId, ticketId)),
        audit: values => tx.insert(runs).values({ guildId, ticketId, ...values }),
      });
    });
  }
  async reserve({ guildId, ticketId, runId, messageId, now, audit }) {
    return this.locked(guildId, ticketId, async ({ state, patch, audit: insert }) => {
      if ((state.leaseExpiresAt && state.leaseExpiresAt.getTime() > now)
        || (state.lastRunAt && now - state.lastRunAt.getTime() < 15000)
        || (messageId && state.lastMessageId === messageId)) return false;
      await patch({ leaseId: runId, leaseExpiresAt: new Date(now + 60000), lastRunAt: new Date(now), lastMessageId: messageId || null });
      await insert({ id: runId, ...audit, status: 'requested' });
      return true;
    });
  }
  async finish(guildId, ticketId, runId, values) {
    await this.db.update(runs).set(values).where(and(scope(runs, guildId, ticketId), eq(runs.id, runId)));
    await this.db.update(states).set({ leaseId: null, leaseExpiresAt: null }).where(and(scope(states, guildId, ticketId), eq(states.leaseId, runId)));
  }
  async claimDueFollowUps(now, limit = 20) {
    return this.db.transaction(async tx => {
      const due = await tx.select().from(states).where(and(
        eq(states.awaitingClosureConfirmation, false), lte(states.followUpDueAt, new Date(now)),
      )).limit(limit).for('update');
      for (const state of due) await tx.update(states).set({
        followUpDueAt: null, awaitingClosureConfirmation: true, updatedAt: new Date(),
      }).where(scope(states, state.guildId, state.ticketId));
      return due.map(state => ({ guildId: state.guildId, ticketId: state.ticketId, reason: state.handoffReason }));
    });
  }
}
module.exports = { PostgresTicketAIRepository };
