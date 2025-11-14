import { Router } from 'express';
import { inspect } from 'util'

import { checkAuth } from '../middleware/check-auth.js';
import { Verbose, log, warn, error } from '../services.js';
import conf from '../conf.js'
import opensearch from '../opensearch.js'

const verbose = Verbose('sd:routes/logs'); verbose('');
const router = Router();

router.get('/', checkAuth, async (req, res, next) => {
  try {
    // verbose('dashboard body:', req.body);
    if (!opensearch) {
      throw new Error('OpenSearch is not connected')
    }

    const query = {
      query: {
        match: {
          userId: {
            query: req.user._id,
          }
        }
      }
    }
    verbose('query:', query)
    const response = await opensearch.search({
      index: 'logs',
      body: query,
    });
    verbose('response:', inspect(response, { depth: null, colors: true }))

    const result = response?.body?.hits?.hits?.map(h => h._source)
    const out = {
      query,
      result,
    };
    verbose("logs out:", inspect(out, { depth: null, colors: true }))

    res.json(out);
  } catch (err) {
    error('Get logs error:', err)
    res.status(500).json({ result: 'error', message: err.toString() });
  }
})

export default router;
