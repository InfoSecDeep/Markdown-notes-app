const express = require('express');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const NOTES_DIR = path.join(__dirname, 'notes');
const PUBLIC_DIR = path.join(__dirname, 'public');

// Middleware
app.use(express.json());
app.use(express.static(PUBLIC_DIR));

// Ensure directories exist
async function initDirs() {
  try {
    await fs.mkdir(NOTES_DIR, { recursive: true });
    await fs.mkdir(PUBLIC_DIR, { recursive: true });
  } catch (err) {
    console.error('Error creating directories:', err);
  }
}

// Front-matter helper: Parse metadata and body from markdown content
function parseMarkdown(content) {
  const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/;
  const match = content.match(frontMatterRegex);

  if (match) {
    const yamlSection = match[1];
    const body = match[2];
    const metadata = {};

    yamlSection.split('\n').forEach(line => {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0].trim();
        const value = parts.slice(1).join(':').trim();
        metadata[key] = value;
      }
    });

    return { metadata, body };
  }

  // Fallback if no front-matter is found
  return {
    metadata: {
      title: 'Untitled Note',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      tags: ''
    },
    body: content
  };
}

// Front-matter helper: Stringify metadata and body into markdown content
function stringifyMarkdown(metadata, body) {
  const yamlLines = Object.entries(metadata)
    .map(([key, val]) => `${key}: ${val}`)
    .join('\n');
  return `---\n${yamlLines}\n---\n${body}`;
}

// API Routes

// 1. Get all notes (metadata and preview)
app.get('/api/notes', async (req, res) => {
  try {
    const files = await fs.readdir(NOTES_DIR);
    const notes = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const filePath = path.join(NOTES_DIR, file);
        const content = await fs.readFile(filePath, 'utf-8');
        const { metadata, body } = parseMarkdown(content);
        
        // Create a short preview of the body (first 120 characters)
        const preview = body.replace(/[#*`_\-\n\r]/g, ' ').trim().slice(0, 120);

        notes.push({
          id: path.basename(file, '.md'),
          title: metadata.title || 'Untitled Note',
          created: metadata.created || new Date().toISOString(),
          updated: metadata.updated || new Date().toISOString(),
          tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
          preview: preview || 'No content'
        });
      }
    }

    // Sort notes by updated timestamp descending
    notes.sort((a, b) => new Date(b.updated) - new Date(a.updated));
    res.json(notes);
  } catch (err) {
    console.error('Error fetching notes:', err);
    res.status(500).json({ error: 'Failed to fetch notes' });
  }
});

// 2. Get a single note by ID
app.get('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const filePath = path.join(NOTES_DIR, `${id}.md`);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const { metadata, body } = parseMarkdown(content);

    res.json({
      id,
      title: metadata.title || 'Untitled Note',
      created: metadata.created || new Date().toISOString(),
      updated: metadata.updated || new Date().toISOString(),
      tags: metadata.tags ? metadata.tags.split(',').map(t => t.trim()).filter(Boolean) : [],
      body
    });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Note not found' });
    } else {
      console.error(`Error fetching note ${id}:`, err);
      res.status(500).json({ error: 'Failed to fetch note' });
    }
  }
});

// 3. Create a new note
app.post('/api/notes', async (req, res) => {
  const id = `note_${Date.now()}`;
  const filePath = path.join(NOTES_DIR, `${id}.md`);
  const now = new Date().toISOString();

  const metadata = {
    title: 'Untitled Note',
    created: now,
    updated: now,
    tags: ''
  };
  const body = '# Untitled Note\n\nWrite your markdown content here...';
  const content = stringifyMarkdown(metadata, body);

  try {
    await fs.writeFile(filePath, content, 'utf-8');
    res.status(201).json({
      id,
      title: metadata.title,
      created: metadata.created,
      updated: metadata.updated,
      tags: [],
      body
    });
  } catch (err) {
    console.error('Error creating note:', err);
    res.status(500).json({ error: 'Failed to create note' });
  }
});

// 4. Update an existing note
app.put('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const { title, body, tags } = req.body;
  const filePath = path.join(NOTES_DIR, `${id}.md`);

  try {
    // Read existing to preserve creation time
    let existingContent = '';
    let created = new Date().toISOString();
    try {
      existingContent = await fs.readFile(filePath, 'utf-8');
      const parsed = parseMarkdown(existingContent);
      created = parsed.metadata.created || created;
    } catch (e) {
      // If file doesn't exist, we can create it or return 404. Let's return 404 for PUT.
      if (e.code === 'ENOENT') {
        return res.status(404).json({ error: 'Note not found' });
      }
      throw e;
    }

    const now = new Date().toISOString();
    const metadata = {
      title: title || 'Untitled Note',
      created,
      updated: now,
      tags: Array.isArray(tags) ? tags.join(', ') : (tags || '')
    };

    const content = stringifyMarkdown(metadata, body || '');
    await fs.writeFile(filePath, content, 'utf-8');

    res.json({
      id,
      title: metadata.title,
      created: metadata.created,
      updated: metadata.updated,
      tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : []),
      body: body || ''
    });
  } catch (err) {
    console.error(`Error updating note ${id}:`, err);
    res.status(500).json({ error: 'Failed to update note' });
  }
});

// 5. Delete a note
app.delete('/api/notes/:id', async (req, res) => {
  const { id } = req.params;
  const filePath = path.join(NOTES_DIR, `${id}.md`);

  try {
    await fs.unlink(filePath);
    res.json({ message: 'Note deleted successfully', id });
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.status(404).json({ error: 'Note not found' });
    } else {
      console.error(`Error deleting note ${id}:`, err);
      res.status(500).json({ error: 'Failed to delete note' });
    }
  }
});

// Catch-all route to serve the SPA frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Initialize and start
initDirs().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
});
