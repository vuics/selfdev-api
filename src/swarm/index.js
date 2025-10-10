import dotenv from 'dotenv';
// import Redis from 'ioredis';
// import vault from 'node-vault';
// import { randomUUID } from 'crypto';
// import { setTimeout as sleep } from 'timers/promises';
// import process from 'process';
// import { Box } from 'box-node';




import { inspect } from 'util'
// import axios from 'axios'
// import { v4 as uuidv4 } from 'uuid'
// import { transporter } from '../mailer.js'
// import lodash from 'lodash'
// const { isEmpty, has } = lodash

import { log, warn, error, Verbose } from '../services.js'
import conf, { revealConf } from '../conf.js'
import MaptrixV1 from './maptrix_v1.js'; // Your custom agent class

// Connect to MongoDB through Mongoose driver
// import '../mongo.js'  // FIXME: use it?
import '../redis.js'  // FIXME: Remove file or move there all the redis code?
import User from '../models/user.js'
import Map from '../models/map.js'

const verbose = Verbose('sd:swarm/index'); verbose('')

log('public conf:', inspect(revealConf(), { colors: true, depth: null }))

// FIXME: Replace dotenv with conf completelly
dotenv.config();

// // ----------------- Configuration -----------------
// const DB_URL = process.env.DB_URL || 'mongodb://mongo.dev.local:27017/selfdev';
// const XMPP_HOST = process.env.XMPP_HOST || 'selfdev-prosody.dev.local';
// const XMPP_PASSWORD = process.env.XMPP_PASSWORD || '123';
// const XMPP_MUC_HOST = process.env.XMPP_MUC_HOST || `conference.${XMPP_HOST}`;
// const MONITOR_SECONDS = parseInt(process.env.MONITOR_SECONDS || '60', 10);

// const REDIS_URL = process.env.REDIS_URL || 'redis://redis.dev.local:6379/0';
// const REDIS_SOCKET_TIMEOUT = parseInt(process.env.REDIS_SOCKET_TIMEOUT || '10', 10) * 1000;
// const REDIS_CONNECT_TIMEOUT = parseInt(process.env.REDIS_CONNECT_TIMEOUT || '15', 10) * 1000;
// const LOCK_TIMEOUT = parseInt(process.env.LOCK_TIMEOUT || '120', 10);
// const LOCK_REFRESH = parseInt(process.env.LOCK_REFRESH || '30', 10);

const CONTAINER_ID = process.env.CONTAINER_ID || process.env.HOSTNAME || randomUUID();
const FILTER_ARCHETYPES = JSON.parse(process.env.FILTER_ARCHETYPES || '[]');

// const VAULT_ENABLE = (process.env.VAULT_ENABLE || 'false') === 'true';
// const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
// const VAULT_TOKEN = process.env.VAULT_TOKEN || '(not-set)';
// const VAULT_UNSEAL = (process.env.VAULT_UNSEAL || 'false') === 'true';
// const VAULT_UNSEAL_KEYS = (process.env.VAULT_UNSEAL_KEYS || '(not-set),(not-set),(not-set),(not-set),(not-set)').split(',');

// // ----------------- Globals -----------------
let redisClient = null;
// let vaultClient = null;
const runningAgents = {};

// // ----------------- MongoDB Models -----------------
// const agentSchema = new mongoose.Schema({}, { strict: false, collection: 'agents' });
// const userSchema = new mongoose.Schema({}, { strict: false, collection: 'users' });
// const AgentModel = mongoose.model('Agent', agentSchema);
// const UserModel = mongoose.model('User', userSchema);

// // ----------------- Agent Config -----------------
// class AgentConfig {
//   constructor(doc, user) {
//     this.doc = doc;
//     this.user = user;
//     this.id = String(doc._id);
//     this.userId = String(doc.userId);
//     this.deployed = doc.deployed || false;
//     this.archetype = doc.archetype || null;
//     this.options = new Box(doc.options || {});
//     this.updatedAt = doc.updatedAt || null;
//     this.name = this.options.name;
//     this.joinRooms = this.options.joinRooms;
//     this.replaceVaultValues(this.options);
//   }

//   isValid() {
//     return Boolean(
//       this.deployed &&
//       this.name &&
//       this.archetype === 'maptrix' &&
//       (FILTER_ARCHETYPES.length === 0 || FILTER_ARCHETYPES.includes(this.archetype))
//     );
//   }

//   getVaultValue(vaultKey) {
//     if (!vaultClient) return '';
//     try {
//       const secret = vaultClient.read(`secret/data/user_${this.userId}`);
//       return secret?.data?.data?.[vaultKey] || '';
//     } catch (e) {
//       error(`Error reading secret ${vaultKey} from Vault for user_${this.userId}: ${e}`);
//       return null;
//     }
//   }

//   replaceVaultValues(obj) {
//     if (!vaultClient) return;

//     if (obj instanceof Box || typeof obj === 'object') {
//       for (const [key, value] of Object.entries(obj)) {
//         if (value && typeof value === 'object' && 'valueFromVault' in value) {
//           obj[key] = this.getVaultValue(value.valueFromVault);
//         } else {
//           this.replaceVaultValues(value);
//         }
//       }
//     } else if (Array.isArray(obj)) {
//       for (const item of obj) {
//         this.replaceVaultValues(item);
//       }
//     }
//   }
// }

// // ----------------- Redis -----------------
// async function connectToRedis() {
//   redisClient = new Redis(REDIS_URL, {
//     connectTimeout: REDIS_CONNECT_TIMEOUT
//   });
//   await redisClient.ping();
//   log(`Connected to Redis at ${REDIS_URL}`);
// }

// // ----------------- Vault -----------------
// async function connectToVault(retries = 20, baseDelay = 1000, maxDelay = 60000) {
//   if (!VAULT_ENABLE) {
//     warn('Vault is disabled.');
//     return;
//   }

//   vaultClient = vault({ endpoint: VAULT_ADDR, token: VAULT_TOKEN });

//   for (let attempt = 1; attempt <= retries; attempt++) {
//     try {
//       if (VAULT_UNSEAL) {
//         const isSealed = await vaultClient.sys.isSealed();
//         if (isSealed) {
//           for (const key of VAULT_UNSEAL_KEYS) {
//             if (!key || key.trim() === '(not-set)') continue;
//             await vaultClient.sys.submitUnsealKey(key.trim());
//           }
//         }
//       }
//       return vaultClient;
//     } catch (e) {
//       const delay = Math.min(baseDelay * 2 ** (attempt - 1), maxDelay);
//       const jitter = Math.random() + 0.5;
//       const adaptiveDelay = delay * jitter;
//       warn(`Attempt ${attempt}: Vault connection failed. Retrying in ${adaptiveDelay}ms`);
//       await sleep(adaptiveDelay);
//     }
//   }
//   throw new Error('Failed to authenticate with Vault after multiple attempts.');
// }

// // ----------------- Distributed Lock -----------------
// async function checkAndClearStaleLock(agentName) {
//   if (!redisClient) return false;
//   const lockKey = `agent_lock:${agentName}`;
//   const heartbeatKey = `agent_heartbeat:${agentName}`;

//   const lockOwner = await redisClient.get(lockKey);
//   if (!lockOwner) return true;

//   const lastHeartbeat = await redisClient.get(heartbeatKey);
//   if (!lastHeartbeat || (Date.now() / 1000 - parseFloat(lastHeartbeat) > LOCK_TIMEOUT)) {
//     warn(`Clearing stale lock for agent ${agentName}`);
//     await redisClient.del(lockKey);
//     await redisClient.del(heartbeatKey);
//     return true;
//   }
//   return false;
// }

// async function acquireLock(agentName) {
//   if (!redisClient) return false;
//   const lockKey = `agent_lock:${agentName}`;
//   const heartbeatKey = `agent_heartbeat:${agentName}`;

//   const lockOwner = await redisClient.get(lockKey);
//   if (lockOwner === CONTAINER_ID) {
//     await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', LOCK_TIMEOUT * 2);
//     return true;
//   }

//   const lockCleared = await checkAndClearStaleLock(agentName);
//   if (!lockCleared) return false;

//   const acquired = await redisClient.set(lockKey, CONTAINER_ID, 'NX', 'EX', LOCK_TIMEOUT);
//   if (acquired) {
//     await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', LOCK_TIMEOUT * 2);
//     refreshLock(agentName);
//     log(`Acquired lock for agent ${agentName}`);
//     return true;
//   }
//   return false;
// }

// function refreshLock(agentName) {
//   const interval = setInterval(async () => {
//     if (!(agentName in runningAgents)) {
//       clearInterval(interval);
//       return;
//     }
//     const lockKey = `agent_lock:${agentName}`;
//     const heartbeatKey = `agent_heartbeat:${agentName}`;
//     const lockOwner = await redisClient.get(lockKey);
//     if (lockOwner === CONTAINER_ID) {
//       await redisClient.expire(lockKey, LOCK_TIMEOUT);
//       await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', LOCK_TIMEOUT * 2);
//     } else {
//       warn(`Lost lock for agent ${agentName}`);
//       await stopAgent(agentName);
//       clearInterval(interval);
//     }
//   }, LOCK_REFRESH * 1000);
// }

// async function releaseLock(agentName) {
//   if (!redisClient) return;
//   const lockKey = `agent_lock:${agentName}`;
//   const heartbeatKey = `agent_heartbeat:${agentName}`;
//   const lockOwner = await redisClient.get(lockKey);
//   if (lockOwner === CONTAINER_ID) {
//     await redisClient.del(lockKey);
//     await redisClient.del(heartbeatKey);
//     log(`Released lock for agent ${agentName}`);
//   }
// }

// // ----------------- Agent Management -----------------
// async function startAgent(config) {
//   if (!config.isValid()) {
//     warn(`Invalid agent configuration: ${config.name}`);
//     return null;
//   }

//   const lockAcquired = await acquireLock(config.name);
//   if (!lockAcquired) {
//     log(`Agent ${config.name} is already running in another container`);
//     return null;
//   }

//   const agent = new MaptrixV1({
//     host: XMPP_HOST,
//     user: config.name,
//     password: XMPP_PASSWORD,
//     mucHost: XMPP_MUC_HOST,
//     joinRooms: config.joinRooms,
//     nick: config.name,
//     config: config,
//     ownername: (config.user?.xmpp?.user || '').toLowerCase(),
//     customerId: config.user?.stripe?.customerId
//   });

//   runningAgents[config.name] = agent;
//   agent.start(); // Assuming MaptrixV1 has async start()
//   log(`Started agent: ${config.name}`);
//   return agent;
// }

// async function stopAgent(agentName) {
//   if (agentName in runningAgents) {
//     try {
//       const agent = runningAgents[agentName];
//       await agent.disconnect();
//       delete runningAgents[agentName];
//       log(`Stopped agent: ${agentName}`);
//       await releaseLock(agentName);
//     } catch (e) {
//       error(`Error stopping agent ${agentName}: ${e}`);
//     }
//   }
// }

// // ----------------- Sync and Monitor -----------------
// async function getAgentConfigs() {
//   const docs = await AgentModel.find().lean();
//   const configs = [];
//   for (const doc of docs) {
//     const user = await UserModel.findOne({ _id: doc.userId }).lean();
//     configs.push(new AgentConfig(doc, user));
//   }
//   log(`Retrieved ${configs.length} agent configurations`);
//   return configs;
// }

// async function syncAgents() {
//   const configs = await getAgentConfigs();
//   const shouldRun = {};

//   for (const config of configs) {
//     if (config.isValid()) {
//       shouldRun[config.name] = config;

//       if (!(config.name in runningAgents)) {
//         await startAgent(config);
//       } else if (config.updatedAt !== runningAgents[config.name].config.updatedAt) {
//         await stopAgent(config.name);
//         await startAgent(config);
//       }
//     }
//   }

//   for (const agentName of Object.keys(runningAgents)) {
//     if (!(agentName in shouldRun)) {
//       await stopAgent(agentName);
//     }
//   }
// }

// function monitorAgents() {
//   setInterval(async () => {
//     try {
//       await syncAgents();
//     } catch (e) {
//       error(`Error in monitorAgents: ${e}`);
//     }
//   }, MONITOR_SECONDS * 1000);
// }

// ----------------- Shutdown -----------------
async function shutdown() {
  log('Shutting down agency...');
  for (const agentName of Object.keys(runningAgents)) {
    await stopAgent(agentName);
  }
  if (redisClient) await redisClient.quit();
  log('Shutdown complete');
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ----------------- Main -----------------
(async () => {
  try {
    const sleepTime = Math.random() * 3; // up to 3 seconds random sleep
    log(`Sleeping for ${sleepTime.toFixed(3)} seconds`);
    await sleep(sleepTime * 1000);

    await mongoose.connect(DB_URL);
    log(`Connected to MongoDB at ${DB_URL}`);

    // await connectToRedis();
    // await connectToVault();

    log(`Starting swarm with container ID: ${CONTAINER_ID}`);
    // monitorAgents();
  } catch (e) {
    error(`Fatal error: ${e}`);
    await shutdown();
  }
})();
