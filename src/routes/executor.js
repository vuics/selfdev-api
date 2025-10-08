import { Router } from 'express'

import { checkAuth, checkAPIAuth, checkAdmin } from '../middleware/check-auth.js'
import { Verbose, log, warn, error } from '../services.js'
import Map from '../models/map.js'
import { nanoid } from 'nanoid'
import { sleep } from '../utils/helper.js'

// import { } from '../mapper.js'

const verbose = Verbose('sd:routes/executor'); verbose('')
const app = Router()

async function executeMap({ map }) {
  try {
    log('Executing map:', map.title, ', mapId:', map._id)
    await sleep(10)

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

    executeMap({ map: resultMap })
  } catch (err) {
    error('Error running mapper:', err)
    throw err
  }
});

export default app
