import mongoose from 'mongoose'
import mongooseTimestamp from 'mongoose-timestamp'
import { Verbose } from '../services.js'

const verbose = Verbose('sd:models/agent'); verbose('')

const { ObjectId } = mongoose.Schema.Types

export default mongoose.model(
  'Agent',
  mongoose.Schema({
    userId: {
      type: ObjectId,
      required: true,
      ref: 'User'
    },

    deployed: false,

    options: {
      schemaVersion: String,

      name: String,
      description: String,
      // model: {
      //   provider: String,
      //   name: String,
      // },
    },
  })
    .plugin(mongooseTimestamp)
)
