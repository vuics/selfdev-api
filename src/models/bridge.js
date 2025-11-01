// import mongoose from 'mongoose'
// import mongooseTimestamp from 'mongoose-timestamp'
// import { Verbose } from '../services.js'

// const verbose = Verbose('sd:models/bridge'); verbose('')

// const { ObjectId, Mixed } = mongoose.Schema.Types

// export default mongoose.model(
//   'Bridge',
//   mongoose.Schema({
//     userId: {
//       type: ObjectId,
//       required: true,
//       ref: 'User'
//     },
//     appId: { type: ObjectId, ref: 'App' },

//     connector: String, // Matterbridge (whatsapp, telegram, etc.)
//     deployed: Boolean, // only run the agents with deployed===true

//     options: {
//       name: { type: String, required: true }, // unique name
//       description: String,

//     },
//   })
//     .plugin(mongooseTimestamp)
// )


import mongoose from 'mongoose';
import mongooseTimestamp from 'mongoose-timestamp';
import { Verbose } from '../services.js';

const verbose = Verbose('sd:models/bridge'); verbose('');

const { ObjectId, Mixed } = mongoose.Schema.Types;

const AccountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  server: String,
  token: String,
  username: String,
  password: String,
  channel: String,
  prefixMessagesWithNick: { type: Boolean, default: true },
  useTLS: { type: Boolean, default: true },
  Muc: String,
  Jid: String,
  SkipTLSVerify: Boolean,
  RemoteNickFormat: String,
  MessageFormat: String,
  QuoteFormat: String,
  QuoteLengthLimit: Number,
  IgnoreMessages: String
}, { _id: false });

const ProtocolSchema = new mongoose.Schema({
  type: { type: String, required: true }, // discord, telegram, xmpp, etc.
  accounts: { type: [AccountSchema], default: [] }
}, { _id: false });

const GatewayInOutSchema = new mongoose.Schema({
  account: { type: String, required: true },
  channel: { type: String, required: true },
  direction: { type: String, enum: ['inout', 'in', 'out'], default: 'inout' }
}, { _id: false });

const GatewaySchema = new mongoose.Schema({
  name: { type: String, required: true },
  enable: { type: Boolean, default: true },
  inout: { type: [GatewayInOutSchema], default: [] }
}, { _id: false });

const BridgeSchema = new mongoose.Schema({
  userId: { type: ObjectId, required: true, ref: 'User' },
  appId: { type: ObjectId, ref: 'App' },

  connector: String, // Matterbridge (whatsapp, telegram, etc.)
  deployed: Boolean, // only run the agents with deployed===true

  options: {
    name: { type: String, required: true }, // unique name
    description: String,

    messengers: {
      general: {
        RemoteNickFormat: { type: String, default: '[{PROTOCOL}] <{NICK}>' },
        MediaServerUpload: String,
        MediaServerDownload: String
      },
      protocols: { type: [ProtocolSchema], default: [] },
      gateways: { type: [GatewaySchema], default: [] }
    },
  },

  logs: String,
})
.plugin(mongooseTimestamp);

export default mongoose.model('Bridge', BridgeSchema);
