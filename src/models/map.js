import mongoose from 'mongoose'
import mongooseTimestamp from 'mongoose-timestamp'
import { Verbose } from '../services.js'

const verbose = Verbose('sd:models/map'); verbose('')

const { ObjectId, Mixed } = mongoose.Schema.Types

export default mongoose.model(
  'Map',
  mongoose.Schema({
    userId: {
      type: ObjectId,
      required: true,
      ref: 'User'
    },

    title: String,
    flow: Mixed,
  })
    .plugin(mongooseTimestamp)
)
