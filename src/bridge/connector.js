import { log, warn, error, Verbose } from '../services.js'
import Bridge from '../models/bridge.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/connector'); verbose('')

export default class Connector {
  constructor ({ bridge }) {
    this.bridge = bridge
    verbose('Connector constructed')

    this.logs = ''
    this.collectLogs = true
  }

  async start () {
    verbose('Connector started')
  }

  async stop () {
    verbose('Connector stopped')
  }

  async saveLogs () {
    try {
      const bridgeDoc = await Bridge.findById(this.bridge._id)
      if (bridgeDoc) {
        bridgeDoc.logs = this.logs
        await bridgeDoc.save()
        log('Logs saved for bridge:', this.bridge._id, ":", this.bridge.options.name)
        // verbose('bridgeDoc:', bridgeDoc)
        // verbose('bridgeDoc.logs:', bridgeDoc.logs)
      }
    } catch (err) {
      error('Error saving logs:', err)
    }
  }
}

