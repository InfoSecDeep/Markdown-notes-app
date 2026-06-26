// ==========================================================================
// Application State
// ==========================================================================
let state = {
  notes: [],
  activeNoteId: null,
  activeNote: null,
  searchQuery: '',
  viewMode: 'split', // 'edit', 'split', 'preview'
  isDirty: false,
  autoSaveTimeout: null
};

// ==========================================================================
// DOM Elements
// ==========================================================================
const elements = {
  // Sidebar
  notesList: document.getElementById('notes-list'),
  newNoteBtn: document.getElementById('new-note-btn'),
  searchInput: document.getElementById('search-input'),
  clearSearch: document.getElementById('clear-search'),
  themeToggle: document.getElementById('theme-toggle'),
  themeText: document.querySelector('.theme-text'),
  
  // Workspace Layouts
  emptyState: document.getElementById('empty-state'),
  emptyNewNoteBtn: document.getElementById('empty-new-note-btn'),
  activeWorkspace: document.getElementById('active-workspace'),
  editorPreviewContainer: document.querySelector('.editor-preview-container'),
  
  // Note Inputs
  noteTitle: document.getElementById('note-title'),
  noteTags: document.getElementById('note-tags'),
  markdownEditor: document.getElementById('markdown-editor'),
  markdownPreview: document.getElementById('markdown-preview'),
  
  // Action Buttons
  saveBtn: document.getElementById('save-btn'),
  deleteBtn: document.getElementById('delete-btn'),
  saveStatus: document.getElementById('save-status'),
  
  // View Mode Toggles
  toggleEdit: document.getElementById('toggle-edit'),
  toggleSplit: document.getElementById('toggle-split'),
  togglePreview: document.getElementById('toggle-preview'),
  
  // Toasts
  toastContainer: document.getElementById('toast-container')
};

// ==========================================================================
// Toast Notification System
// ==========================================================================
function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-success)"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
  } else if (type === 'error') {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-danger)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else {
    icon = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:var(--color-primary)"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12" y2="8"></line></svg>`;
  }
  
  toast.innerHTML = `${icon}<span>${message}</span>`;
  elements.toastContainer.appendChild(toast);
  
  // Auto remove after 3 seconds
  setTimeout(() => {
    toast.classList.add('toast-fade-out');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3000);
}

// ==========================================================================
// Initialization & Event Listeners
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  fetchNotes();
  setupEventListeners();
  setupMarkdownRenderer();
  
  // Adjust default view mode based on screen width
  if (window.innerWidth <= 900) {
    setViewMode('edit');
  }
});

// Setup Marked options for markdown parsing
function setupMarkdownRenderer() {
  if (typeof marked !== 'undefined') {
    marked.setOptions({
      breaks: true,
      gfm: true
    });
  }
}

// ==========================================================================
// Theme Management
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    elements.themeText.textContent = 'Dark Mode';
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    elements.themeText.textContent = 'Light Mode';
  }
}

function toggleTheme() {
  if (document.body.classList.contains('dark-theme')) {
    document.body.classList.remove('dark-theme');
    document.body.classList.add('light-theme');
    localStorage.setItem('theme', 'light');
    elements.themeText.textContent = 'Dark Mode';
  } else {
    document.body.classList.remove('light-theme');
    document.body.classList.add('dark-theme');
    localStorage.setItem('theme', 'dark');
    elements.themeText.textContent = 'Light Mode';
  }
}

// ==========================================================================
// API Operations (CRUD)
// ==========================================================================

// 1. READ ALL (Fetch Notes)
async function fetchNotes() {
  try {
    const response = await fetch('/api/notes');
    if (!response.ok) throw new Error('Failed to load notes');
    
    state.notes = await response.json();
    renderNotesList();
    
    // Auto-select note if there are notes and none is active
    if (state.notes.length > 0 && !state.activeNoteId) {
      // Check if hash matches an ID
      const hashId = window.location.hash.slice(1);
      const noteToSelect = state.notes.find(n => n.id === hashId) || state.notes[0];
      selectNote(noteToSelect.id);
    } else if (state.notes.length === 0) {
      showEmptyState();
    }
  } catch (err) {
    console.error(err);
    showToast('Failed to load notes from server', 'error');
  }
}

// 2. READ ONE (Select Note)
async function selectNote(id) {
  // If there are unsaved changes, save them before switching
  if (state.isDirty && state.activeNoteId) {
    await saveActiveNote(true); // silent save
  }

  try {
    const response = await fetch(`/api/notes/${id}`);
    if (!response.ok) throw new Error('Note not found');
    
    const note = await response.json();
    state.activeNote = note;
    state.activeNoteId = id;
    state.isDirty = false;
    
    // Update hash in URL quietly
    window.history.replaceState(null, null, `#${id}`);
    
    // Update UI inputs
    elements.noteTitle.value = note.title;
    elements.noteTags.value = note.tags.join(', ');
    elements.markdownEditor.value = note.body;
    
    // Render Preview
    renderPreview();
    
    // Highlight Active note in sidebar
    updateSidebarActiveState();
    
    // Toggle main visibility
    elements.emptyState.style.display = 'none';
    elements.activeWorkspace.style.display = 'flex';
    elements.saveStatus.textContent = 'Saved';
    elements.saveStatus.classList.remove('unsaved');
    
  } catch (err) {
    console.error(err);
    showToast('Failed to open note', 'error');
  }
}

// 3. CREATE (New Note)
async function createNewNote() {
  try {
    const response = await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) throw new Error('Failed to create note');
    
    const newNote = await response.json();
    state.notes.unshift(newNote); // add to top
    
    renderNotesList();
    await selectNote(newNote.id);
    
    elements.noteTitle.focus();
    elements.noteTitle.select();
    
    showToast('New note created successfully');
  } catch (err) {
    console.error(err);
    showToast('Failed to create a new note', 'error');
  }
}

// 4. UPDATE (Save Note)
async function saveActiveNote(silent = false) {
  if (!state.activeNoteId) return;
  
  // Clear any pending autosaves
  if (state.autoSaveTimeout) {
    clearTimeout(state.autoSaveTimeout);
  }
  
  const title = elements.noteTitle.value.trim() || 'Untitled Note';
  const body = elements.markdownEditor.value;
  const tagsStr = elements.noteTags.value;
  const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
  
  elements.saveStatus.textContent = 'Saving...';
  elements.saveStatus.classList.add('unsaved');

  try {
    const response = await fetch(`/api/notes/${state.activeNoteId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, body, tags })
    });
    
    if (!response.ok) throw new Error('Failed to save note');
    
    const updatedNote = await response.json();
    state.isDirty = false;
    
    // Update local list without re-fetching
    const noteIdx = state.notes.findIndex(n => n.id === state.activeNoteId);
    if (noteIdx !== -1) {
      state.notes[noteIdx] = {
        id: updatedNote.id,
        title: updatedNote.title,
        created: updatedNote.created,
        updated: updatedNote.updated,
        tags: updatedNote.tags,
        preview: body.replace(/[#*`_\-\n\r]/g, ' ').trim().slice(0, 120) || 'No content'
      };
      
      // Re-sort notes list by updated time
      state.notes.sort((a, b) => new Date(b.updated) - new Date(a.updated));
      renderNotesList();
      updateSidebarActiveState();
    }
    
    elements.saveStatus.textContent = 'Saved';
    elements.saveStatus.classList.remove('unsaved');
    
    if (!silent) {
      showToast('Note saved');
    }
  } catch (err) {
    console.error(err);
    elements.saveStatus.textContent = 'Save failed';
    showToast('Failed to save note changes', 'error');
  }
}

// 5. DELETE
async function deleteActiveNote() {
  if (!state.activeNoteId) return;
  
  const noteTitle = state.activeNote.title || 'Untitled Note';
  const confirmed = confirm(`Are you sure you want to delete "${noteTitle}"? This cannot be undone.`);
  if (!confirmed) return;

  try {
    const response = await fetch(`/api/notes/${state.activeNoteId}`, {
      method: 'DELETE'
    });
    
    if (!response.ok) throw new Error('Failed to delete note');
    
    // Remove from local list
    state.notes = state.notes.filter(n => n.id !== state.activeNoteId);
    renderNotesList();
    
    state.activeNoteId = null;
    state.activeNote = null;
    state.isDirty = false;
    
    if (state.notes.length > 0) {
      selectNote(state.notes[0].id);
    } else {
      showEmptyState();
    }
    
    showToast(`Deleted "${noteTitle}"`);
  } catch (err) {
    console.error(err);
    showToast('Failed to delete the note', 'error');
  }
}

// ==========================================================================
// UI Rendering Functions
// ==========================================================================

// Render the Sidebar Notes List
function renderNotesList() {
  const query = state.searchQuery.toLowerCase().trim();
  
  // Filter notes
  const filteredNotes = state.notes.filter(note => {
    const matchesTitle = note.title.toLowerCase().includes(query);
    const matchesTags = note.tags.some(tag => tag.toLowerCase().includes(query));
    const matchesPreview = note.preview && note.preview.toLowerCase().includes(query);
    return matchesTitle || matchesTags || matchesPreview;
  });
  
  if (filteredNotes.length === 0) {
    elements.notesList.innerHTML = `
      <div class="no-results" style="padding: 30px 20px; text-align: center; color: var(--text-muted); font-size: 14px;">
        No notes match your search
      </div>
    `;
    return;
  }
  
  elements.notesList.innerHTML = filteredNotes.map(note => {
    const formattedDate = formatDate(note.updated);
    const tagsHtml = note.tags.map(t => `<span class="note-item-tag">${escapeHtml(t)}</span>`).join('');
    
    return `
      <div class="note-item" data-id="${note.id}">
        <div class="note-item-header">
          <h3 class="note-item-title">${escapeHtml(note.title)}</h3>
          <span class="note-item-date">${formattedDate}</span>
        </div>
        <p class="note-item-preview">${escapeHtml(note.preview)}</p>
        <div class="note-item-tags">${tagsHtml}</div>
      </div>
    `;
  }).join('');
  
  // Re-attach click events
  document.querySelectorAll('.note-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.getAttribute('data-id');
      selectNote(id);
    });
  });
}

function updateSidebarActiveState() {
  document.querySelectorAll('.note-item').forEach(item => {
    const id = item.getAttribute('data-id');
    if (id === state.activeNoteId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Render Markdown Preview
function renderPreview() {
  const markdownText = elements.markdownEditor.value;
  
  if (typeof marked !== 'undefined') {
    elements.markdownPreview.innerHTML = marked.parse(markdownText || '*No content*');
    
    // Apply Highlight.js to code blocks
    if (typeof hljs !== 'undefined') {
      elements.markdownPreview.querySelectorAll('pre code').forEach((block) => {
        hljs.highlightElement(block);
      });
    }
  } else {
    elements.markdownPreview.textContent = markdownText;
  }
}

function showEmptyState() {
  elements.activeWorkspace.style.display = 'none';
  elements.emptyState.style.display = 'flex';
  window.history.replaceState(null, null, ' ');
}

// Set View Mode ('edit', 'split', 'preview')
function setViewMode(mode) {
  state.viewMode = mode;
  
  // Update toggle buttons
  elements.toggleEdit.classList.toggle('active', mode === 'edit');
  elements.toggleSplit.classList.toggle('active', mode === 'split');
  elements.togglePreview.classList.toggle('active', mode === 'preview');
  
  // Update container classes
  elements.editorPreviewContainer.className = `editor-preview-container ${mode}-only`;
  if (mode === 'split') {
    elements.editorPreviewContainer.className = 'editor-preview-container split-view';
  }
  
  // Re-render preview if entering preview or split mode
  if (mode === 'preview' || mode === 'split') {
    renderPreview();
  }
}

// ==========================================================================
// Event Listeners Setup
// ==========================================================================
function setupEventListeners() {
  // Sidebar actions
  elements.newNoteBtn.addEventListener('click', createNewNote);
  elements.emptyNewNoteBtn.addEventListener('click', createNewNote);
  elements.themeToggle.addEventListener('click', toggleTheme);
  
  // Search
  elements.searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value;
    elements.clearSearch.style.display = state.searchQuery ? 'block' : 'none';
    renderNotesList();
  });
  
  elements.clearSearch.addEventListener('click', () => {
    elements.searchInput.value = '';
    state.searchQuery = '';
    elements.clearSearch.style.display = 'none';
    renderNotesList();
    elements.searchInput.focus();
  });
  
  // Note edit changes (marking dirty & live-previewing)
  elements.markdownEditor.addEventListener('input', () => {
    markAsDirty();
    renderPreview();
    triggerAutoSave();
  });
  
  elements.noteTitle.addEventListener('input', () => {
    markAsDirty();
    triggerAutoSave();
  });
  
  elements.noteTags.addEventListener('input', () => {
    markAsDirty();
    triggerAutoSave();
  });
  
  // Actions
  elements.saveBtn.addEventListener('click', () => saveActiveNote());
  elements.deleteBtn.addEventListener('click', deleteActiveNote);
  
  // View mode toggles
  elements.toggleEdit.addEventListener('click', () => setViewMode('edit'));
  elements.toggleSplit.addEventListener('click', () => setViewMode('split'));
  elements.togglePreview.addEventListener('click', () => setViewMode('preview'));
  
  // Window keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    // Ctrl + S or Cmd + S to Save
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      if (state.activeNoteId) {
        saveActiveNote();
      }
    }
  });
  
  // Before unload warning if unsaved
  window.addEventListener('beforeunload', (e) => {
    if (state.isDirty) {
      // Modern browsers don't show custom messages, but standard prompt will trigger
      e.preventDefault();
      e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
    }
  });
}

// ==========================================================================
// Helpers & Utilities
// ==========================================================================

function markAsDirty() {
  if (!state.isDirty) {
    state.isDirty = true;
    elements.saveStatus.textContent = 'Unsaved changes';
    elements.saveStatus.classList.add('unsaved');
  }
}

// Auto Save (Debounced)
function triggerAutoSave() {
  if (state.autoSaveTimeout) {
    clearTimeout(state.autoSaveTimeout);
  }
  
  // Autosave after 2.5 seconds of inactivity
  state.autoSaveTimeout = setTimeout(() => {
    if (state.isDirty && state.activeNoteId) {
      saveActiveNote(true); // Save silently (no success toast to avoid spam)
    }
  }, 2500);
}

// Formats date into "MMM DD, YYYY" or "Today", "Yesterday"
function formatDate(isoString) {
  const date = new Date(isoString);
  const now = new Date();
  
  // Check if today
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  // Check if yesterday
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  
  // Return standard date
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

// Simple HTML Escaper
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
