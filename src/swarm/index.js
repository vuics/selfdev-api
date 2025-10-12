import process from 'process';
import { inspect } from 'util'
// import vault from 'node-vault';

import { log, warn, error, Verbose } from '../services.js'
import conf, { revealConf } from '../conf.js'
import MaptrixV1 from './maptrix-v1.js'
import { sleep } from '../utils/helper.js'

import '../mongo.js'
import User from '../models/user.js'
import Agent from '../models/agent.js'
import { redisClient, connectToRedis } from '../redis.js'

const verbose = Verbose('sd:swarm/index'); verbose('')

log('public conf:', inspect(revealConf(), { colors: true, depth: null }))


const archetypeClasses = {
  "maptrix-v1.0": MaptrixV1,
}

// const VAULT_ENABLE = (process.env.VAULT_ENABLE || 'false') === 'true';
// const VAULT_ADDR = process.env.VAULT_ADDR || 'http://127.0.0.1:8200';
// const VAULT_TOKEN = process.env.VAULT_TOKEN || '(not-set)';
// const VAULT_UNSEAL = (process.env.VAULT_UNSEAL || 'false') === 'true';
// const VAULT_UNSEAL_KEYS = (process.env.VAULT_UNSEAL_KEYS || '(not-set),(not-set),(not-set),(not-set),(not-set)').split(',');

// // ----------------- Globals -----------------
// let vaultClient = null;
const runningXmppAgents = {};

// // ----------------- Agent Config -----------------
// class AgentConfig {
//   constructor(doc, user) {
//     this.doc = doc;
//     this.user = user;
//     this.id = String(doc._id);
//     this.userId = String(doc.userId);
//     this.deployed = doc.deployed || false;
//     this.archetype = doc.archetype || null;

//     // FIXME: does this replacement work?
//     // this.options = new Box(doc.options || {});
//     this.options = doc.options

//     // this.updatedAt = doc.updatedAt || null;
//     this.name = this.options.name;
//     this.joinRooms = this.options.joinRooms;

//     // FIXME: uncomment
//     // this.replaceVaultValues(this.options);
//   }

//   isValid() {
//     return Boolean(
//       this.deployed &&
//       this.name &&
//       (conf.swarm.filterArchetypes.length === 0 || conf.swarm.filterArchetypes.includes(this.archetype))
//     );
//   }

//   // getVaultValue(vaultKey) {
//   //   if (!vaultClient) return '';
//   //   try {
//   //     const secret = vaultClient.read(`secret/data/user_${this.userId}`);
//   //     return secret?.data?.data?.[vaultKey] || '';
//   //   } catch (e) {
//   //     error(`Error reading secret ${vaultKey} from Vault for user_${this.userId}: ${e}`);
//   //     return null;
//   //   }
//   // }

//   // replaceVaultValues(obj) {
//   //   if (!vaultClient) return;

//   //   if (obj instanceof Box || typeof obj === 'object') {
//   //     for (const [key, value] of Object.entries(obj)) {
//   //       if (value && typeof value === 'object' && 'valueFromVault' in value) {
//   //         obj[key] = this.getVaultValue(value.valueFromVault);
//   //       } else {
//   //         this.replaceVaultValues(value);
//   //       }
//   //     }
//   //   } else if (Array.isArray(obj)) {
//   //     for (const item of obj) {
//   //       this.replaceVaultValues(item);
//   //     }
//   //   }
//   // }
// }

function isValid({ agent }) {
  return Boolean(
    agent.deployed &&
    agent.archetype in archetypeClasses &&
    (conf.swarm.filterArchetypes.length === 0 || conf.swarm.filterArchetypes.includes(agent.archetype))
  );
}

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

// ----------------- Distributed Lock -----------------
async function checkAndClearStaleLock(agentId) {
  verbose('checkAndClearStaleLock agentId:', agentId)
  if (!redisClient) return false;
  const lockKey = `agent_lock:${agentId}`;
  const heartbeatKey = `agent_heartbeat:${agentId}`;

  const lockOwner = await redisClient.get(lockKey);
  verbose('lockOwner:', lockOwner)
  if (!lockOwner) return true;

  const lastHeartbeat = await redisClient.get(heartbeatKey);
  verbose('lastHeartbeat:', lastHeartbeat)
  if (!lastHeartbeat || (Date.now() / 1000 - parseFloat(lastHeartbeat) > conf.swarm.lockTimeoutSeconds)) {
    warn(`Clearing stale lock for agent ${agentId}`);
    await redisClient.del(lockKey);
    await redisClient.del(heartbeatKey);
    return true;
  }
  return false;
}

async function acquireLock(agentId) {
  verbose('acquireLock agentId:', agentId)
  verbose('redisClient:', !!redisClient)
  if (!redisClient) {
    warn('Redis is disabled or not connected')
    return false;
  }
  const lockKey = `agent_lock:${agentId}`;
  const heartbeatKey = `agent_heartbeat:${agentId}`;

  const lockOwner = await redisClient.get(lockKey);
  verbose('lockOwner:', lockOwner)
  verbose('conf.contaier.id', conf.container.id)
  if (lockOwner === conf.container.id) {
    verbose('lockOwner === conf.container.id')
    await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', conf.swarm.lockTimeoutSeconds * 2);
    return true;
  }

  const lockCleared = await checkAndClearStaleLock(agentId);
  verbose('stale lockCleared')
  if (!lockCleared) return false;

  verbose('attempt to acquire lock')
  const acquired = await redisClient.set(lockKey, conf.container.id, 'NX', 'EX', conf.swarm.lockTimeoutSeconds);
  verbose('acquired:', acquired)
  if (acquired) {
    await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', conf.swarm.lockTimeoutSeconds * 2);
    refreshLock(agentId);
    log(`Acquired lock for agent ${agentId}`);
    return true;
  }
  return false;
}

function refreshLock(agentId) {
  const interval = setInterval(async () => {
    if (!(agentId in runningXmppAgents)) {
      clearInterval(interval);
      return;
    }
    const lockKey = `agent_lock:${agentId}`;
    const heartbeatKey = `agent_heartbeat:${agentId}`;
    const lockOwner = await redisClient.get(lockKey);
    if (lockOwner === conf.container.id) {
      await redisClient.expire(lockKey, conf.swarm.lockTimeoutSeconds);
      await redisClient.set(heartbeatKey, String(Date.now() / 1000), 'EX', conf.swarm.lockTimeoutSeconds * 2);
    } else {
      warn(`Lost lock for agent ${agentId}`);
      await stopAgent(agentId);
      clearInterval(interval);
    }
  }, conf.swarm.lockRefreshSeconds * 1000);
}

async function releaseLock(agentId) {
  if (!redisClient) return;
  const lockKey = `agent_lock:${agentId}`;
  const heartbeatKey = `agent_heartbeat:${agentId}`;
  const lockOwner = await redisClient.get(lockKey);
  if (lockOwner === conf.container.id) {
    await redisClient.del(lockKey);
    await redisClient.del(heartbeatKey);
    log(`Released lock for agent ${agentId}`);
  }
}

// ----------------- Agent Management -----------------
async function startAgent({ agent }) {
  if (!isValid({ agent })) {
    warn(`Invalid agent configuration: ${agent._id}:${agent.options.name}`);
    return null;
  }

  const lockAcquired = await acquireLock(agent._id);
  if (!lockAcquired) {
    log(`Agent ${agent._id}:${agent.options.name} is already running in another container`);
    return null;
  }

  const agentClass = archetypeClasses[agent.archetype]
  const xmppAgent = new agentClass({
    agent,
  });
  runningXmppAgents[agent._id] = xmppAgent;
  xmppAgent.start(); // Assuming MaptrixV1 has async start()

  log(`Started agent: ${agent._id}:${agent.options.name}`);
  return xmppAgent;
}

async function stopAgent({ agentId }) {
  if (agentId in runningXmppAgents) {
    try {
      const xmppAgent = runningXmppAgents[agentId];
      await xmppAgent.stop();
      delete runningXmppAgents[agentId];

      log(`Stopped agent: ${agentId}`);
      await releaseLock(agentId);
    } catch (e) {
      error(`Error stopping agent ${agentId}: ${e}`);
    }
  }
}

// ----------------- Sync and Monitor -----------------
async function syncAgents() {
  try {
    const agents = await Agent.find({
      archetype: { $in: conf.swarm.filterArchetypes }
    }).populate('userId').lean();
    log(`Retrieved ${agents.length} agent configurations`);

    const shouldRun = {};

    for (const agent of agents) {
      // verbose('agent:', agent, ', isValid:', isValid({ agent }))
      if (isValid({ agent })) {
        shouldRun[agent._id] = agent;

        if (!(agent._id in runningXmppAgents)) {
          verbose('start agent')
          await startAgent({ agent });
        } else {
          verbose('agent.updatedAt:', agent.updatedAt)
          // verbose('runningXmppAgent:', runningXmppAgents[agent._id])
          verbose('runningXmppAgent updatedAt:', runningXmppAgents[agent._id].agent.updatedAt)
          if (new Date(agent.updatedAt).getTime() !==
              new Date(runningXmppAgents[agent._id].agent.updatedAt).getTime()) {
            verbose('restart agent')
            await stopAgent({ agentId: agent._id });
            await startAgent({ agent });
          }
        }
      }
    }

    for (const agentId of Object.keys(runningXmppAgents)) {
      if (!(agentId in shouldRun)) {
        verbose('stop agent')
        await stopAgent({ agentId });
      }
    }
  } catch (err) {
    error('Error syncing agents:', err)
  }
}

function monitorAgents() {
  async function cycleMonitorAgents() {
    try {
      log('cycleMonitorAgents');
      await syncAgents();
    } catch (e) {
      error(`Error in monitorAgents: ${e}`);
    }
  }

  cycleMonitorAgents()
  setInterval(cycleMonitorAgents, conf.swarm.monitorSeconds * 1000)
}

process.on('uncaughtException', (err) => {
  error('uncaughtException:', err)
})

// ----------------- Shutdown -----------------
async function shutdown() {
  log('Shutting down agency...');
  for (const agentId of Object.keys(runningXmppAgents)) {
    await stopAgent({ agentId });
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

    // await mongoose.connect(DB_URL);
    // log(`Connected to MongoDB at ${DB_URL}`);

    await connectToRedis();
    // await connectToVault();

    log(`Starting swarm with container ID: ${conf.container.id}`);
    monitorAgents();
  } catch (e) {
    error(`Fatal error: ${e}`);
    await shutdown();
  }
})();
