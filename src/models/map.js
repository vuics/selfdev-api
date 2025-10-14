import mongoose from 'mongoose'
import mongooseTimestamp from 'mongoose-timestamp'
import { Verbose } from '../services.js'

const verbose = Verbose('sd:models/map'); verbose('')

const { ObjectId, Mixed } = mongoose.Schema.Types

// The Map defines a workflow for agent orchestration and coordination. It defines what message a recipient (agent or human) receives. The messages that will be send to a recipient are text and file attachments from source notes. The response from recipient gets saved as text and file attachments in the destination edges. The execution (sending messages to recipients) is according to the order of the edges in the edges array. The execution starts from the first edge, goes through all the edges, edge-by-edge, then stops when there is not more edges left in the array.

// ---------- Base parts ----------

const PositionSchema = new mongoose.Schema({
  x: Number,  // x position on the map
  y: Number,  // y position on the map
}, { _id: false, strict: false })

const StyleSchema = new mongoose.Schema({
  width: Number, // width
  height: Number, // height
  color: String,
  backgroundColor: String,
}, { _id: false, strict: false })

const MeasuredSchema = new mongoose.Schema({
  width: Number,  // +
  height: Number, // +
}, { _id: false, strict: false })


// ReactFlow's viewport
const ViewportSchema = new mongoose.Schema({
  x: Number,
  y: Number,
  zoom: Number,
}, { _id: false, strict: false })

// ---------- Node Data Schemas ----------

const NoteNodeDataSchema = new mongoose.Schema({
  uname: String,  // unique node name
  renaming: Boolean, // true when user renaming the note to show name input
  text: String,   // note text. The text can be smart text when it contains [[node_uname]], then the subsctring [[node_uname]] is substituted with the text of the node_uname. It is possible to disable the smart text substitution by commenting it as [/*[node_uname]*/]. The subsctitution is nested if the node_uname also contains the [[other_node_uname]]. Multiple [[uname1]], [[uname2]], etc. inside one text get all substituted with the texts of those nodes.
  attachments: [String],  // list of urls of attached files
  stash: String,  // note stash for text (used for diff text and stash)
  stashAttachments: [String],  // list of urls of attached files in stash
  waitRecipient: String,  // xmpp address of the recipient to which we sent a message and waiting for reply
  kind: { type: String, enum: ['markdown', 'code', 'raw', null] }, // kind the node content, one of values: 'markdown', 'code', 'raw' or `undefined` (plain)
  editing: Boolean,  // editing/viewing mode switch
  diffing: Boolean,  // if the note is in the diff mode (diff of text and stash with their attachemnts)
  slide: Boolean,    // if the note is slide in the deck
  slideIndex: Number,  // number of the slide in the deck
  color: String,  // text color
  backgroundColor: String,  // background color
  lang: String,        // programming language
}, { _id: false, strict: false })


// GroupNode has child node ids.
// The GroupNode organizes the execution loops considers the following types of edges:
// * init edges: init loop variables but do not participate in a loop.
// * inner edges: repeats continuously unil one of the exit edges conditinos get satisfied starting with the first edge in array.
// * exit edges: allow exit loop if one of the edge's conditions get satisfied.
// * loop edges:  loop through all inner and exit edges.
const GroupNodeDataSchema = new mongoose.Schema({
  uname: String,  // unique group name
  renaming: Boolean, // true when user renaming the group to show name input
  color: String, // text color
  backgroundColor: String, // background color
  and: { type: Boolean, default: true }, // AND (all expressions safisfied) if true otherwise OR (any expression satisfied) loop exit condition
}, { _id: false, strict: false })

// ---------- Edge Schema ----------

const MarkerEndSchema = new mongoose.Schema({
  type: String,    // Set to MarkerType.ArrowClosed from ReactFlow
  width: Number,   // Mostly 20
  height: Number,  // Mostly 20
  color: String,   // Stroke line color
}, { _id: false, strict: false })

const RequestEdgeDataSchema = new mongoose.Schema({
  recipient: String,  // the agent name, xmpp address of the agent, e.g. agentname@username.x.hyag.ru
  condition: String,  // regular expresson, the edge gets executed (message send to recipient if the condition is satisfied when applied to the source edge before sending the message to the recipient
  stroke: String,  // Stroke line color
  satisfied: Boolean,  // if condition is satisfied by applying the condition regex to the source node smart text
  safe: Boolean,  // if the condition regex is safe
  expecting: Boolean,  // execution is expected, colors edge label yellow
  cursor: Boolean,  // if this edge is being executed (message send to a recipient and waiting for the answer), colors edge label to olive
  reordering: Boolean,  // if in reordering mode, colors edge label to blue
  sequence: Number,  // order number of the edge
}, { _id: false, strict: false })

const RequestEdgeSchema = new mongoose.Schema({
  id: { type: String, required: true },  // edge id in format `${sourceNodeId}->${targetNodeId}`
  type: { type: String, enum: ['RequestEdge'], required: true },  // edge type, always 'RequestEdge'
  source: String,  // source node id
  target: String,  // target node id

  sourceHandle: String,  // The ID of the handle on the source node from which the edge originates
  targetHandle: String,  // The ID of the handle on the target node where the edge connects

  data: RequestEdgeDataSchema,
  style: StyleSchema,
  markerEnd: MarkerEndSchema,
  animated: Boolean,  // Mostly true
  selected: Boolean,  // true if the node is selected
  sourceX: Number,  // x coordinate of the source point
  sourceY: Number,  // y coordinate of the source point
  targetX: Number,  // x coordinate of the target point
  targetY: Number,  // y coordinate of the target point
}, { _id: false, strict: false })

// ---------- Base Node Schema ----------

const BaseNodeSchema = new mongoose.Schema({
  id: { type: String, required: true },  // node id
  type: { type: String, required: true  }, // node type: 'NoteNode' | 'group'
  position: { type: PositionSchema, required: true },
  style: StyleSchema, // ReactFlow style
}, { discriminatorKey: 'type', _id: false, strict: false })

// ---------- Flow Schema (before discriminators) ----------

const FlowSchema = new mongoose.Schema({
  nodes: [BaseNodeSchema],
  edges: [RequestEdgeSchema],
  viewport: ViewportSchema,
}, { _id: false, strict: false })

// ---------- Apply embedded discriminators ----------

// Define the subdocument array path
const NodesArray = FlowSchema.path('nodes')

// Attach discriminators to nodes array
NodesArray.discriminator('NoteNode', new mongoose.Schema({
  data: NoteNodeDataSchema,
  parentId: String,  // id of a GroupNode
  measured: MeasuredSchema,  // The section gets added by ReactFlow
  width: Number,  // width
  height: Number, // height

  dragging: Boolean,        // Indicates whether the node is currently being dragged by the user
  resizing: Boolean,        // Indicates whether the node is currently being resized by the user
  extent: String,           // Defines the boundaries within which the node can be moved (e.g., 'parent' or 'viewport')
  color: String,            // The text or accent color used for the node's content or label
  backgroundColor: String,  // The fill color of the node's background
  selected: Boolean,        // Indicates whether the node is currently selected in the ReactFlow editor
}, { _id: false }))

NodesArray.discriminator('group', new mongoose.Schema({
  data: GroupNodeDataSchema,
}, { _id: false, strict: false }))

// ---------- Main Map Schema ----------

const MapSchema = new mongoose.Schema({
  userId: { type: ObjectId, required: true, ref: 'User' },
  title: String,
  flow: { type: FlowSchema, default: {} },

  templateMapId: { type: ObjectId, ref: 'Map' },
  executing: { type: Boolean, default: false },
  completed: { type: Boolean, default: false },
}, { strict: false })  // <-- prevents Mongoose from dropping unknown fields in flow

MapSchema.plugin(mongooseTimestamp)

export default mongoose.model('Map', MapSchema)

