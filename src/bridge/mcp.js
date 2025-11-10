// import express from 'express';
// import morgan from 'morgan'
// import compression from 'compression'
// import cookieParser from 'cookie-parser'
// import http from 'http'
// import path from 'path'
// import { randomUUID } from 'crypto'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import express from 'express';
import { z } from 'zod';

import { log, warn, error, Verbose } from '../services.js'
import Connector from './connector.js'
import XmppAgent from '../swarm/xmpp-agent.js'
import conf from '../conf.js'

const verbose = Verbose('sd:bridge/mcp'); verbose('')


// Create an MCP server
const server = new McpServer({
  name: 'demo-server',
  version: '1.0.0'
});

// Add an addition tool
server.registerTool(
  'add',
  {
    title: 'Addition Tool',
    description: 'Add two numbers',
    inputSchema: { a: z.number(), b: z.number() },
    outputSchema: { result: z.number() }
  },
  async ({ a, b }) => {
    const output = { result: a + b };
    return {
      content: [{ type: 'text', text: JSON.stringify(output) }],
      structuredContent: output
    };
  }
);

// Add a dynamic greeting resource
server.registerResource(
  'greeting',
  new ResourceTemplate('greeting://{name}', { list: undefined }),
  {
    title: 'Greeting Resource', // Display name for UI
    description: 'Dynamic greeting generator'
  },
  async (uri, { name }) => ({
    contents: [
      {
        uri: uri.href,
        text: `Hello, ${name}!`
      }
    ]
  })
);

// Set up Express and HTTP transport
const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  // Create a new transport for each request to prevent request ID collisions
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  res.on('close', () => {
    transport.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(conf.mcp.port, () => {
  console.log(`Demo MCP Server running on http://localhost:${conf.mcp.port}/mcp`);
}).on('error', error => {
  console.error('MCP Server error:', error);
  // process.exit(1);
});

// function addRoute({ path, method = 'post', handler }) {
//   app[method](path, handler);
// }

// function removeRoute({ path, method = 'post' }) {
//   app._router.stack = app._router.stack.filter(layer => {
//     if (!layer.route) return true;
//     if (layer.route.path !== path) return true;
//     if (!layer.route.methods[method]) return true;
//     return false;
//   });
// }


export default class Mcp extends Connector {
  constructor(args) {
    super(args);
    verbose('Mcp constructed');

    // this.xmppAgent = new XmppAgent({
    //   agent: {
    //     options: {
    //       name: this.bridge.options.name,
    //       joinRooms: [this.bridge.options.mcp.joinRoom],
    //     },
    //     userId: this.bridge.userId,
    //   },
    //   handleChat: this.bridge.options.mcp.enablePersonal,
    //   handleRooms: this.bridge.options.mcp.enableRoom,
    // });

    // this.pendingResponses = null
  }

  // waitForXmppResponse(requestId) {
  //   return new Promise((resolve, reject) => {
  //     const timeout = setTimeout(() => {
  //       this.pendingResponses.delete(requestId);
  //       reject(new Error('Timeout waiting for response'));
  //     }, (this.bridge.options.mcp.timeoutSec || 300) * 1000);

  //     this.pendingResponses.set(requestId, { resolve, reject, timeout });
  //   });
  // }

  // resolveXmppResponse(requestId, response) {
  //   const entry = this.pendingResponses.get(requestId);
  //   if (!entry) return;
  //   clearTimeout(entry.timeout);
  //   entry.resolve(response);
  //   this.pendingResponses.delete(requestId);
  // }

  async start() {
    super.start();
    verbose('Mcp started');

    try {
      // runExpressApp();
      // this.pendingResponses = new Map();

      // this.path = path.join(
      //   '/' + this.bridge.userId._id.toString(),
      //   this.bridge.options.mcp.endpoint
      // );
      // verbose('path:', this.path);

      // /* -------------------- Mcp → XMPP (Outgoing) -------------------- */
      // addRoute({
      //   path: this.path,
      //   method: this.bridge.options.mcp.method,
      //   handler: async (req, res) => {
      //     try {
      //       verbose(
      //         'handler path:', this.path,
      //         ', method:', this.bridge.options.mcp.method,
      //         ', query:', req.query,
      //         ', body:', req.body
      //       );

      //       const requestId = randomUUID();

      //       let text = null
      //       let payload = null
      //       const contentType = req.headers['content-type'];
      //       verbose('contentType:', contentType)
      //       verbose('req.body:', req.body)

      //       if (contentType?.includes('text/plain')) {
      //         text = req.body
      //       } else {
      //         if (!contentType?.includes('application/json')) {
      //           warn('Unknown contentType:', contentType)
      //         }
      //         payload = {
      //           ...(this.bridge.options.mcp.method === 'get' ? req.query : req.body),
      //         };
      //         if (this.bridge.options.mcp.setRequestId) {
      //           payload[this.bridge.options.mcp.requestIdKey] = requestId
      //         }
      //       }

      //       verbose('text:', text)
      //       verbose('payload:', payload)
      //       verbose('to xmpp, requestId:', requestId)
      //       verbose('setRequestId:', this.bridge.options.mcp.setRequestId)
      //       verbose('requestIdKey:', this.bridge.options.mcp.requestIdKey)

      //       // Send to XMPP
      //       if (this.bridge.options.mcp.enablePersonal) {
      //         await this.xmppAgent.xmppClient.sendPersonalMessage({
      //           recipient: this.bridge.options.mcp.recipient,
      //           prompt: text || JSON.stringify(payload),
      //         });
      //       }
      //       if (this.bridge.options.mcp.enableRoom) {
      //         await this.xmppAgent.xmppClient.sendRoomMessage({
      //           room: this.bridge.options.mcp.joinRoom,
      //           recipient: this.bridge.options.mcp.recipientNickname,
      //           prompt: text || JSON.stringify(payload),
      //           mucHost: conf.xmpp.mucHost,
      //         });
      //       }

      //       // Wait for correlated XMPP response
      //       const response = await this.waitForXmppResponse(requestId);
      //       res.json(response);
      //     } catch (err) {
      //       error('Error handling mcp:', this.bridge.options.name, ', error:', err);
      //       res.status(500).send({ result: 'error', error: err.toString() });
      //     }
      //   },
      // });

      // await this.xmppAgent.start();

      // /* -------------------- XMPP → Mcp (Incoming) -------------------- */
      // this.xmppAgent.chat = async ({ prompt } = {}) => {
      //   verbose('XMPP chat received:', prompt);

      //   try {
      //     let msg
      //     try {
      //       msg = JSON.parse(prompt);
      //     } catch (err) {
      //       msg = null
      //     }

      //     let requestId = null
      //     if (msg && this.bridge.options.mcp.setRequestId) {
      //       requestId = msg[this.bridge.options.mcp.requestIdKey]
      //     }
      //     verbose('msg:', msg)
      //     verbose('from xmpp, requestId:', requestId)
      //     verbose('setRequestId:', this.bridge.options.mcp.setRequestId)
      //     verbose('requestIdKey:', this.bridge.options.mcp.requestIdKey)

      //     if (msg && requestId && this.pendingResponses.has(requestId)) {
      //       this.resolveXmppResponse(msg.requestId, prompt);
      //     } else {
      //       // Fallback: if XMPP reply doesn’t contain requestId
      //       warn('Unmatched XMPP response:', msg, 'Attempting fallback by sender/room');
      //       // Example fallback: match last pending request by sender
      //       const lastEntry = Array.from(this.pendingResponses.entries()).pop();
      //       if (lastEntry) {
      //         const [lastRequestId] = lastEntry;
      //         this.resolveXmppResponse(lastRequestId, prompt);
      //       }
      //     }
      //   } catch (err) {
      //     error('Failed to handle XMPP message:', prompt, err);
      //   }
      //   return '';
      // };
    } catch (err) {
      error('Error starting Mcp:', err);
    }
  }

  async stop() {
    super.stop();
    // removeRoute({
    //   path: this.path,
    //   method: this.bridge.options.mcp.method,
    // });
    // this.xmppAgent.stop();
    // this.pendingResponses = null
    verbose('Mcp stopped');
  }
}
