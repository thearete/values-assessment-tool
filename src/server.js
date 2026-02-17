/**
 * Koppla — Express API Server
 *
 * A thin HTTP wrapper around the existing Koppla pipeline.
 * The Chrome extension communicates with this server via fetch().
 *
 * Endpoints:
 *   GET  /api/health                  — Server status check
 *   POST /api/assess                  — Run a new assessment
 *   GET  /api/assessments             — List all saved assessments
 *   GET  /api/assessments/:filename   — Load a specific assessment
 *
 * Start:
 *   npm run server
 *   (or: node src/server.js)
 */

const express = require('express');
const cors = require('cors');
const { runAssessment } = require('./index');
const { listAssessments, loadAssessment } = require('./storage/storage');

const app = express();
const PORT = 3777;

// Middleware
app.use(cors());                    // Allow requests from the Chrome extension
app.use(express.json());            // Parse JSON request bodies

// ===================================================================
// ENDPOINTS
// ===================================================================

/**
 * Health check — is the server running?
 */
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    version: '3.0',
    toolName: 'Koppla',
  });
});

/**
 * Run a new assessment.
 *
 * Request body:
 * {
 *   "orgName": "Acme Corp",
 *   "seeds": [
 *     { "name": "John Smith", "type": "person", "role": "CEO" },
 *     { "name": "Shell Ltd", "type": "organization" }
 *   ]
 * }
 */
app.post('/api/assess', async (req, res) => {
  const { orgName, seeds: rawSeeds } = req.body;

  if (!orgName || typeof orgName !== 'string' || orgName.trim().length === 0) {
    return res.status(400).json({ error: true, message: 'orgName is required' });
  }

  // Normalize seeds from the extension format to the pipeline format
  const seeds = (rawSeeds || []).map((s) => ({
    name: s.name,
    type: s.type || 'person',
    role: s.role || null,
    providedBy: 'user',
    confidence: 1.0,
  }));

  try {
    console.log(`\n[API] Assessment requested for: "${orgName}" with ${seeds.length} seed(s)`);
    const assessment = await runAssessment(orgName.trim(), seeds, []);
    res.json(assessment);
  } catch (err) {
    console.error('[API] Assessment failed:', err.message);
    res.status(500).json({ error: true, message: `Assessment failed: ${err.message}` });
  }
});

/**
 * List all saved assessments.
 * Returns an array of { filename, orgName, date, flag } objects.
 */
app.get('/api/assessments', (req, res) => {
  try {
    const assessments = listAssessments();
    res.json(assessments);
  } catch (err) {
    res.status(500).json({ error: true, message: `Failed to list assessments: ${err.message}` });
  }
});

/**
 * Load a specific saved assessment by filename.
 */
app.get('/api/assessments/:filename', (req, res) => {
  try {
    const assessment = loadAssessment(req.params.filename);
    if (!assessment) {
      return res.status(404).json({ error: true, message: 'Assessment not found' });
    }
    res.json(assessment);
  } catch (err) {
    res.status(500).json({ error: true, message: `Failed to load assessment: ${err.message}` });
  }
});

// ===================================================================
// START SERVER
// ===================================================================

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║       Koppla API Server — Running on ${PORT}        ║
╚══════════════════════════════════════════════════╝

Endpoints:
  GET  http://localhost:${PORT}/api/health
  POST http://localhost:${PORT}/api/assess
  GET  http://localhost:${PORT}/api/assessments
  GET  http://localhost:${PORT}/api/assessments/:filename

Ready to receive requests from Koppla Chrome Extension.
`);
});
