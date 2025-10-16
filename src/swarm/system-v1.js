import stringify from 'json-stringify-pretty-compact';
import lodash from 'lodash'
const { cloneDeep } = lodash

import { log, warn, error, Verbose } from '../services.js'
import Map from '../models/map.js'
import User from '../models/user.js'
import Agent from '../models/agent.js'
import XmppAgent from './xmpp-agent.js'
import { XmppClient } from '../maptor.js'
import '../mongo.js'
import { deriveMap, executeMap } from '../routes/executor.js'
import conf from '../conf.js'
import { extractAndParseJson } from '../utils/helper.js'
import {
  createDocument, getDocumentById, updateDocumentById, deleteDocumentById,
  listDocuments
} from '../crud.js'


const verbose = Verbose('sd:swarm/system-v1'); verbose('')

export default class SystemV1 extends XmppAgent {
  constructor (args) {
    super(args)
    // const { agent } = args
    verbose('SystemV1 constructed')
  }

  async start () {
    super.start()
    verbose('SystemV1 started')
  }

  async stop () {
    super.stop()
    verbose('SystemV1 stopped')
  }

  async chat({ prompt, replyFunc=()=>{}} = {}) {
    try {
      verbose(`prompt: ${prompt}`);
      // verbose(`this.agent.options: ${stringify(this.agent.options)}`);
      const { system } = this.agent.options;
      verbose('system:', system)
      const userId = this.agent.userId

      // Parse prompt JSON
      let obj = {};
      try {
        obj = JSON.parse(prompt.trim());
      } catch (err) {
        throw new Error(`Cannot parse the JSON from the prompt: ${err}`)
      }

      verbose('obj:', obj)
      const { _id, data } = obj
      verbose('_id:', _id, ', data:', data)
      const operation = obj.operation || system.operation;
      const model = obj.model || system.model;
      verbose('operation:', operation, ', model:', model)

      let Model = null
      switch (model) {
        case 'map': Model = Map; break
        case 'agent': Model = Agent; break
        default:
          throw new Error('Unknown model')
      }

      let output = ''
      switch (operation) {
        case 'create':
          const doc = await createDocument({ Model, data, userId })
          output = stringify(doc)
          break
        case 'get':
          if (!_id) { throw new Error('The _id field is not present in the prompt') }
          const fetched = await getDocumentById({ Model, _id, userId });
          output = stringify(fetched)
          break
        case 'update':

          // TODO: permit operation only for the admin superuser with special previliges
          throw new Error('Operation is not permitted')

          if (!_id) { throw new Error('The _id field is not present in the prompt') }
          const updated = await updateDocumentById({ Model, _id, data, userId });
          output = stringify(updated)
          break
        case 'delete':

          // TODO: permit operation only for the admin superuser with special previliges
          throw new Error('Operation is not permitted')

          if (!_id) { throw new Error('The _id field is not present in the prompt') }
          await deleteDocumentById({ Model, _id, userId });
          output = stringify({})
          break

        case 'list':

          // TODO: permit operation only for the admin superuser with special previliges
          throw new Error('Operation is not permitted')

          const index = await listDocuments({
            Model,
            userId,
            filter: data.filter,
            options: data.options
          });
          output = stringify(index)
          break
        default:
          throw new Error('Unknown operation')
      }
      return output
    } catch (err) {
      error('Error propmting SystemV1:', err)
      return err.toString()
    }
  }
}

