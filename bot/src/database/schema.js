const { relations, sql } = require('drizzle-orm');
const { check, pgEnum, pgTable, uuid, text, integer, boolean, timestamp, jsonb, index, uniqueIndex } = require('drizzle-orm/pg-core');

const ticketStatus = pgEnum('ticket_status', ['OPEN', 'CLAIMED', 'CLOSED', 'REOPENED']);
const ticketEventType = pgEnum('ticket_event_type', ['TICKET_CREATED', 'TICKET_CLAIMED', 'TICKET_CLOSED', 'TICKET_REOPENED']);

const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  discordUserId: text('discord_user_id').notNull(),
  username: text('username').notNull(),
  displayName: text('display_name').notNull(),
  avatarUrl: text('avatar_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ discordUserIdUnique: uniqueIndex('users_discord_user_id_unique').on(table.discordUserId) }));

const ticketConfigs = pgTable('ticket_configs', {
  id: uuid('id').defaultRandom().primaryKey(),
  guildId: text('guild_id').notNull(),
  setupId: text('setup_id'),
  mode: text('mode'),
  panelChannelId: text('panel_channel_id'),
  logChannelId: text('log_channel_id'),
  activeCategoryId: text('active_category_id'),
  publicCategoryId: text('public_category_id'),
  panelMessageId: text('panel_message_id'),
  supportRoleIds: text('support_role_ids').array().notNull().default([]),
  ready: boolean('ready').notNull().default(false),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ guildUnique: uniqueIndex('ticket_configs_guild_id_unique').on(table.guildId) }));

const ticketCategories = pgTable('ticket_categories', {
  id: uuid('id').defaultRandom().primaryKey(),
  guildId: text('guild_id').notNull(),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description').notNull(),
  emoji: text('emoji'),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({
  guildIndex: index('ticket_categories_guild_id_idx').on(table.guildId),
  guildKeyUnique: uniqueIndex('ticket_categories_guild_key_unique').on(table.guildId, table.key),
}));

const tickets = pgTable('tickets', {
  id: uuid('id').defaultRandom().primaryKey(),
  publicNumber: integer('public_number').notNull(),
  guildId: text('guild_id').notNull(),
  guildName: text('guild_name'),
  channelId: text('channel_id'),
  creatorUserId: text('creator_user_id'),
  creatorName: text('creator_name'),
  assignedUserId: text('assigned_user_id'),
  assignedName: text('assigned_name'),
  categoryId: text('category_id'),
  categoryKey: text('category_key'),
  categoryName: text('category_name'),
  subject: text('subject').notNull(),
  description: text('description').notNull(),
  status: ticketStatus('status').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  claimedAt: timestamp('claimed_at', { withTimezone: true }),
  closedAt: timestamp('closed_at', { withTimezone: true }),
  closeReason: text('close_reason'),
  resolutionSummary: text('resolution_summary'),
  reopenCount: integer('reopen_count').notNull().default(0),
  logChannelId: text('log_channel_id'),
  supportRoleIds: text('support_role_ids').array().notNull().default([]),
  initialMessageId: text('initial_message_id'),
  openingLogId: text('opening_log_id'),
  initialized: boolean('initialized').notNull().default(false),
  reopenedBy: text('reopened_by'),
  reopenedByName: text('reopened_by_name'),
  reopenedAt: timestamp('reopened_at', { withTimezone: true }),
  archives: jsonb('archives').notNull().default([]),
  closing: jsonb('closing'),
  reopening: jsonb('reopening'),
  createdByCycle: integer('created_by_cycle').notNull().default(0),
}, table => ({
  guildIndex: index('tickets_guild_id_idx').on(table.guildId),
  channelIndex: index('tickets_channel_id_idx').on(table.channelId),
  creatorIndex: index('tickets_creator_user_id_idx').on(table.creatorUserId),
  statusIndex: index('tickets_status_idx').on(table.status),
  guildNumberUnique: uniqueIndex('tickets_guild_public_number_unique').on(table.guildId, table.publicNumber),
  publicNumberPositive: check('tickets_public_number_positive', sql`${table.publicNumber} > 0`),
  reopenCountPositive: check('tickets_reopen_count_positive', sql`${table.reopenCount} >= 0`),
}));

const ticketEvents = pgTable('ticket_events', {
  id: uuid('id').defaultRandom().primaryKey(),
  ticketId: uuid('ticket_id').notNull().references(() => tickets.id, { onDelete: 'cascade' }),
  type: ticketEventType('type').notNull(),
  actorUserId: text('actor_user_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, table => ({ ticketIndex: index('ticket_events_ticket_id_idx').on(table.ticketId) }));

const ticketSequences = pgTable('ticket_sequences', {
  guildId: text('guild_id').primaryKey(),
  nextNumber: integer('next_number').notNull().default(0),
});

const ticketRelations = relations(tickets, ({ many }) => ({ events: many(ticketEvents) }));
const eventRelations = relations(ticketEvents, ({ one }) => ({ ticket: one(tickets, { fields: [ticketEvents.ticketId], references: [tickets.id] }) }));

module.exports = { users, ticketConfigs, ticketCategories, tickets, ticketEvents, ticketSequences, ticketStatus, ticketEventType, ticketRelations, eventRelations };
