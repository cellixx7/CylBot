require('./helpers/isolatedConfig');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { PermissionsBitField, PermissionFlagsBits: P } = require('discord.js');
const { ProfileService, DEFAULT_PROFILE, validateProfile } = require('../src/services/profileService');
const { handleProfileInteraction, profileCard } = require('../src/handlers/profileHandler');
const { createRequestHandler } = require('../src/api/server');
const { AuthSessionManager } = require('../src/services/authSessionManager');
const { loadEnv } = require('../src/config/env');
const userId = '100000000000000001', otherId = '100000000000000002', guildId = '200000000000000001';
const account = id => ({ id, username: 'member', displayName: 'Membro', avatarUrl: null });
function fixture() {
  const records = new Map(), badges = new Map(); let plus = false;
  const members = new Map([userId, otherId].map(id => [id, { id, user: { username: 'member', bot: false }, permissions: new PermissionsBitField(0n) }]));
  const guild = { id: guildId, name: 'Comunidade', ownerId: 'owner', members: { fetch: async ({ user }) => {
    if (!members.has(user)) { const error = new Error(); error.code = 10007; throw error; } return members.get(user);
  } } };
  const client = { isReady: () => true, guilds: { cache: new Map([[guildId,guild]]) } };
  const repository = { get: async id => records.get(id), save: async (id,value) => records.set(id, structuredClone(value)), badges: async id => badges.get(id) || [] };
  const profiles = new ProfileService({ repository, client, users: { getByDiscordId: async id => account(id) },
    plans: { personal: async () => ({ subscriptions: plus ? [{ plan: 'PLUS' }] : [] }) } });
  return { profiles, client, records, badges, members, guild, plus: value => { plus = value; } };
}
test('perfil pessoal preserva bio, links e cor; desconhecidos, selos forjados e URLs inseguras são recusados', async () => {
  const f = fixture();
  await f.profiles.update(userId, { bio: 'Minha bio', accent: '#123abc', links: [{ label:'Site',url:'https://example.com' }] });
  const result = await f.profiles.get({ viewerId:userId, identity:account(userId) });
  assert.equal(result.profile.bio,'Minha bio'); assert.equal(result.profile.accent,'#123abc'); assert.equal(result.canEdit,true);
  for (const patch of [{ badges:['STAFF'] }, { userId:otherId }, { bio:'x'.repeat(501) }, { accent:'red' },
    { links:[{ label:'Site',url:'javascript:alert(1)' }] }, { links:[{ label:'Site',url:'https://user:secret@example.com' }] }]) {
    await assert.rejects(f.profiles.update(userId,patch), { code:'INVALID_PROFILE' });
  }
  assert.equal((await f.profiles.get({ viewerId:userId, identity:account(userId) })).profile.bio,'Minha bio');
});
test('privacidade bloqueia perfis privados e exige comunidade real compartilhada', async () => {
  const f = fixture();
  await assert.rejects(f.profiles.get({ viewerId:otherId,userId }), { code:'PROFILE_COMMUNITY_REQUIRED' });
  assert.equal((await f.profiles.get({ viewerId:otherId,userId,guildId })).canEdit,false);
  f.members.delete(otherId);
  await assert.rejects(f.profiles.get({ viewerId:otherId,userId,guildId }), { code:'PROFILE_COMMUNITY_REQUIRED' });
  await f.profiles.update(userId,{ visibility:'PUBLIC' });
  assert.equal((await f.profiles.get({ viewerId:otherId,userId })).profile.visibility,'PUBLIC');
  await f.profiles.update(userId,{ visibility:'PRIVATE' });
  await assert.rejects(f.profiles.get({ viewerId:otherId,userId,guildId }), { code:'PROFILE_PRIVATE' });
});
test('temas Plus são revalidados; Equipe CYL é selo oficial separado de admin e dono do servidor', async () => {
  const f = fixture();
  await assert.rejects(f.profiles.update(userId,{ theme:'AURORA' }), { code:'PROFILE_PLUS_REQUIRED' });
  f.plus(true); await f.profiles.update(userId,{ theme:'COSMIC' });
  f.badges.set(userId,['STAFF','CREATOR','PARTNER']);
  let result = await f.profiles.get({ viewerId:userId,guildId,identity:account(userId) });
  assert.equal(result.profile.theme,'COSMIC'); assert.equal(result.community.role,'MEMBER');
  assert(result.badges.some(b => b.label === 'Equipe CYL')); assert(result.badges.every(b => b.verified));
  f.plus(false); result = await f.profiles.get({ viewerId:userId,guildId,identity:account(userId) });
  assert.equal(result.profile.theme,'CLASSIC'); assert(!result.badges.some(b => b.id === 'PLUS'));
  f.members.get(userId).permissions = new PermissionsBitField(P.Administrator);
  assert.equal((await f.profiles.get({ viewerId:userId,guildId,identity:account(userId) })).community.role,'ADMIN');
  f.guild.ownerId=userId;
  assert.equal((await f.profiles.get({ viewerId:userId,guildId,identity:account(userId) })).community.role,'OWNER');
});
test('API atualiza somente usuário da sessão; sessão, Origin e campos oficiais são protegidos', async () => {
  const f=fixture(), sessions=new AuthSessionManager(), config=loadEnv({}, {requireDiscord:false}).auth;
  const session=sessions.create(account(userId),{access_token:'synthetic',scope:'identify guilds',expires_in:3600});
  const handler=createRequestHandler({client:f.client,services:{profiles:f.profiles,auth:{config,sessions}}});
  async function request(path,method='GET',body={},authenticated=true,origin=config.webOrigin) {
    const input=Object.assign(Readable.from([JSON.stringify(body)]),{method,url:path,headers:{origin,...(authenticated?{cookie:`cylbot_session=${session.id}`}:{})},socket:{remoteAddress:'local'}});
    const result={setHeader(){},writeHead(status){this.status=status;return this;},end(value){this.body=value?JSON.parse(value):null;}};
    await handler(input,result);return result;
  }
  assert.equal((await request('/api/profile/me','GET',{},false)).status,401);
  assert.equal((await request('/api/profile/me','PATCH',{bio:'Atualizada'})).status,200);
  assert.equal(f.records.get(userId).bio,'Atualizada'); assert.equal(f.records.has(otherId),false);
  assert.equal((await request(`/api/profile/${otherId}`,'PATCH',{bio:'Forjada'})).status,404);
  assert.equal((await request('/api/profile/me','PATCH',{bio:'Forjada'},true,'https://untrusted.example')).status,403);
  assert.equal((await request('/api/profile/me','PATCH',{badge:'STAFF'})).status,400);
});
test('Discord impede edição de outro usuário; modal próprio salva e cartão destaca Equipe CYL',async () => {
  const f=fixture(); f.badges.set(userId,['STAFF']);let reply;
  const user={...account(userId),globalName:'Membro',displayAvatarURL:()=>null};
  const services={profiles:f.profiles,auth:{config:{webOrigin:'http://localhost:5173'}}};
  await handleProfileInteraction({customId:`profile:save:${otherId}`,user,reply:async p=>{reply=p;}},services);
  assert.match(reply.content,/próprio perfil/);assert.equal(f.records.size,0);
  const interaction={customId:`profile:save:${userId}`,user,guildId,deferReply:async()=>{interaction.deferred=true;},editReply:async p=>{reply=p;},
    fields:{getTextInputValue:key=>({bio:'Bio pelo Discord',link_label:'Site',link_url:'https://example.com'})[key]}};
  await handleProfileInteraction(interaction,services);
  assert.equal(f.records.get(userId).bio,'Bio pelo Discord');assert.match(reply.embeds[0].toJSON().fields[0].value,/Equipe CYL/);
  const data=await f.profiles.get({viewerId:otherId,userId,guildId});const card=profileCard(data,'http://localhost:5173',guildId);
  assert.equal(card.components[0].toJSON().components.length,1); // Sem controles de edição para visitantes.
});
