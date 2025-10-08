import { Router } from 'express'

import { checkAuth, checkAPIAuth, checkAdmin } from '../middleware/check-auth.js'
import { Verbose, log, warn, error } from '../services.js'
import Map from '../models/map.js'
import { nanoid } from 'nanoid'
import { sleep } from '../utils/helper.js'
import conf from '../conf.js'

import {
  initXmppClient,
  playMapCore,
} from '../mapper.js'

const verbose = Verbose('sd:routes/executor'); verbose('')
const app = Router()

function useState(initialValue) {
  let state = initialValue;
  function getState() {
    return state;
  }
  function setState(newValue) {
    state = newValue;
    return state;
  }
  return [getState, setState];
}

function useRef(initialValue) {
  return { current: initialValue };
}

async function executeMap({ map, user }) {
  try {
    log('Executing map:', map.title, ', mapId:', map._id)
    await sleep(10)

    const getNodes = () => map.nodes;
    const getEdges = () => map.edges;
    const setNodes = (updater) => map.nodes = updater(map.nodes);
    const setEdges = (updater) => map.edges = updater(map.edges);

    const [ loading, setLoading ] = useState(true)
    const [ responseError, setResponseError ] = useState('')
    const [ credentials, setCredentials ] = useState({
      user: user.xmpp.user,
      password: user.xmpp.password,
      jid: `${user.xmpp.user}@${conf.xmpp.host}`,
    })
    const [ roster, setRoster ] = useState([])
    const [ presence, setPresence ] = useState({});
    const xmppRef = useRef(null);

    const [ playing, setPlaying ] = useState(false)
    const [ stepping, setStepping ] = useState(false)
    const [ pausing, setPausing ] = useState(false)
    const playingRef = useRef(playing)
    const steppingRef = useRef(stepping)
    const pausingRef = useRef(pausing)
    playingRef.current = playing
    steppingRef.current = stepping
    pausingRef.current = pausing

    xmppRef.current = initXmppClient({
      credentials,
      service: conf.xmpp.websocketUrl,
      domain: conf.xmpp.host,
      shareUrlPrefix: conf.xmpp.shareUrlPrefix,
      setLoading, setResponseError, setRoster, setPresence,
      getNodes, setNodes,
    })

    await playMapCore({
      step: false, credentials,
      setPlaying, setPausing, setStepping, setReordering,
      playingRef, pausingRef, steppingRef,
      getNodes, getEdges, setNodes, setEdges,
    })

    map.executing = false
    map.completed = true
    await map.save();
    log('Done executing map:', map.title, ', mapId:', map._id)
  } catch (err) {
    error('Error running mapper:', err)
    throw err
  }
}

app.post('/map/:mapId', checkAuth, async (req, res) => {
  try {
    verbose('mapper/run')
    // const { param } = req.body
    const { mapId } = req.params

    const basicMap = await Map.findById(mapId);
    if (!basicMap) {
      return res.status(404).json({ error: 'Map not found' });
    }
    if (!basicMap.userId.equals(req.user._id)) {
      return res.status(403).json({ error: 'Access to the map is forbidden' });
    }

    const mapData = basicMap.toObject();
    delete mapData._id;
    delete mapData.createdAt;
    delete mapData.updatedAt;

    const resultMap = new Map(mapData);
    resultMap.title= `${basicMap.title} (result_${nanoid(9)})`;
    resultMap.templateMapId = mapId;
    resultMap.executing = true
    resultMap.completed = false
    await resultMap.save();
    res.json(resultMap);

    executeMap({ map: resultMap, user: req.user })
  } catch (err) {
    error('Error running mapper:', err)
    throw err
  }
});

export default app
