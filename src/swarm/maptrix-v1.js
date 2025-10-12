import { log, warn, error, Verbose } from '../services.js'
import Map from '../models/map.js'
import User from '../models/user.js'
import Agent from '../models/agent.js'
import XmppAgent from './xmpp-agent.js'
import '../mongo.js'

const verbose = Verbose('sd:swarm/index'); verbose('')

export default class MaptrixV1 extends XmppAgent {
  constructor (args) {
    super(args)
    // const { param } = args
    verbose('MaptrixV1 constructed')
  }

  async start () {
    super.start()
    verbose('MaptrixV1 started')
  }

  async stop () {
    super.stop()
    verbose('MaptrixV1 stopped')
  }

  async chat({ prompt, replyFunc=()=>{}} = {}) {
    // return super.chat({ prompt, replyFunc })
    // replyFunc({ content: '12a' })
    verbose('chat prompt:', prompt)
    const content = prompt + '_' + prompt
    verbose('chat content:', content)
    return content
  }
}

// FIXME: this is only test function
(async function main () {
  try {
    process.on('uncaughtException', (err) => {
      error('uncaughtException:', err)
    })
    log('start main')
    // FIXME: replace agent id
    const agent = await Agent.findById('68e8efec324c85c56c00f4d1').populate('userId').lean()
    verbose('agent:', agent)
    if (!agent) {
      error('Agent is not found')
    }
    const xmppAgent = new MaptrixV1({ agent })
    await xmppAgent.start()
    log('xmppAgent started')
    log('done main')
  } catch (err) {
    error('Error on main:', err)
  }
})()
