import express from 'express';
import morgan from 'morgan'
import axios from 'axios';
import compression from 'compression'
import http from 'http'
import path from 'path'

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import XmppAgent from '../swarm/xmpp-agent.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/webhook'); verbose('')

// Allow insecure certificates (without showing warning)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// Examples:
//
// curl -X POST http://localhost:6370/679b3c9a6e26f022ca69515b/webhook/post \
//   -H "Content-Type: application/json" \
//   -d '{"key":"value"}'
//
// {"result":"ok"}%
//
// curl -X GET http://localhost:6370/679b3c9a6e26f022ca69515b/webhook/get\?key\=value
//
// {"result":"ok"}%


let app = null
let server = null

function runExpressApp() {
  if (!app) {
    app = express()
    app.use(compression()) // gzip compression
    app.use(express.json({ limit: '1mb' })) // for parsing application/json
    app.use(express.urlencoded({ extended: true, limit: '100mb' })) // for parsing application/x-www-form-urlencoded
    app.use(express.text({ limit: '100mb' }))
    app.use(express.raw({ limit: '100mb' }))
    app.use(morgan('tiny'))
    app.get('/', (req, res) => {
      res.send('Selfdev Webhook Server')
    })
    // app.listen(conf.webhook.port)
    server = http.createServer(app)
    server.listen(conf.webhook.port, () => {
      log('Bridge Webhook server is listening on port', conf.webhook.port)
      verbose(' ')
      verbose(`  http://localhost:${conf.webhook.port}`)
      verbose(' ')
    })
  }
  return app
}

function addRoute({ path, method = 'post', handler }) {
  app[method](path, handler);
}

function removeRoute({ path, method = 'post' }) {
  app._router.stack = app._router.stack.filter(layer => {
    if (!layer.route) return true; // keep middleware
    if (layer.route.path !== path) return true; // keep other routes
    if (!layer.route.methods[method]) return true; // keep if method doesn't match
    return false; // remove this route
  });
}


export default class Webhook extends Connector {
  constructor (args) {
    super(args)
    // const { bridge } = args
    verbose('Webhook constructed')
    // verbose('this.bridge:', this.bridge)
    this.app = null

    this.xmppAgent = new XmppAgent({
      agent: {
        options: {
          name: this.bridge.options.name,
          joinRooms: [this.bridge.options.webhook.joinRoom],
        },
        userId: this.bridge.userId,
      },
      handleChat: this.bridge.options.webhook.enablePersonal,
      handleRooms: this.bridge.options.webhook.enableRoom,
    })
  }

  async start () {
    super.start()
    verbose('Webhook started')
    try {
      runExpressApp()

      this.path = path.join('/' + this.bridge.userId._id.toString(), this.bridge.options.webhook.endpoint)
      verbose('path:', this.path)

      addRoute({
        path: this.path,
        method: this.bridge.options.webhook.method,
        handler: async (req, res) => {
          try {
            verbose('handler path:', this.path, ', method:', this.bridge.options.webhook.method,
              ', query:', req.query, ', body:', req.body)
            let prompt = ''
            if (this.bridge.options.webhook.method === 'get') {
              prompt = JSON.stringify(req.query)
            } else if (this.bridge.options.webhook.method === 'post') {
              prompt = JSON.stringify(req.body)
            }

            if (this.bridge.options.webhook.enablePersonal) {
              await this.xmppAgent.xmppClient.sendPersonalMessage({
                recipient: this.bridge.options.webhook.recipient,
                prompt,
              })
            }
            if (this.bridge.options.webhook.enableRoom) {
              await this.xmppAgent.xmppClient.sendRoomMessage({
                room: this.bridge.options.webhook.joinRoom,
                recipient: this.bridge.options.webhook.recipientNickname,
                prompt,
                mucHost: conf.xmpp.mucHost,
              })
            }
            res.send({ result: 'ok' });
          } catch (err) {
            error('Error handling webhook:', this.bridge.options.name,
              ', error:', err)
            res.status(500).send({ result: 'error', error: err.toString() });
          }
        },
      })

      await this.xmppAgent.start()

      // this.xmppAgent.chat = async ({ prompt, replyFunc=()=>{} } = {}) => {
      //   verbose('Webhook received chat with prompt:', prompt)
      //   return ''
      // }

    } catch (err) {
      error('Error starting Webhook:', err)
    }
  }

  async stop () {
    super.stop()
    removeRoute({
      path: this.path,
      method: this.bridge.options.webhook.method,
    })
    this.xmppAgent.stop()
    verbose('Webhook stopped')
  }
}
