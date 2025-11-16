import { Router } from 'express';
import { inspect } from 'util'
import axios from 'axios'

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
    const { skip, limit } = req.query

    const query = {
      index: 'logs',
      body: {
        from: skip,
        size: limit,
        sort: [{ '@timestamp': "desc" }],
        query: {
          match: {
            userId: {
              query: req.user._id,
            }
          }
        }
      },
    }
    // verbose('query:', query)
    const response = await opensearch.search(query);
    // verbose('response:', inspect(response, { depth: null, colors: true }))

    const logsData= response?.body?.hits?.hits?.map(h => h._source)
    const out = {
      result: 'ok',
      query,
      logsData,
    };
    // verbose("logs out:", inspect(out, { depth: null, colors: true }))

    res.json(out);
  } catch (err) {
    error('Get logs error:', err)
    res.status(500).json({ result: 'error', message: err.toString() });
  }
})

router.get('/metrics', checkAuth, async (req, res, next) => {
  try {
    const { query,
      // start, end, step
    } = req.query

    const now = Math.floor(Date.now() / 1000);
    const start = now - 60 * 60; // last 1 hour
    const params = {
      // query: 'agents_processed',
      query,

      start,
      end: now,
      step: "30s",
      // start,
      // end,
      // step,
    }
    verbose('query:', query)
    // http://localhost:9090/api/v1/query?query=agents_processed
    const response = await axios.get("http://prometheus:9090/api/v1/query_range", {
      params,
    });
    // verbose('response:', inspect(response, { depth: null, colors: true }))

    const out = {
      result: 'ok',
      params,
      metrics: response.data,
    };
    // verbose("logs out:", inspect(out, { depth: null, colors: true }))

    res.json(out);
  } catch (err) {
    error('Get logs error:', err)
    res.status(500).json({ result: 'error', message: err.toString() });
  }
})

export default router;
