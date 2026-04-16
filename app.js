(function () {
  'use strict';

  /* ── State ── */
  let loadedSkills   = [];
  let loadedFileName = '';

  /* ── DOM refs ── */
  const viewDrop      = document.getElementById('viewDrop');
  const viewLoading   = document.getElementById('viewLoading');
  const viewSelection = document.getElementById('viewSelection');
  const viewExport    = document.getElementById('viewExport');
  const dropZone      = document.getElementById('dropZone');
  const fileInput     = document.getElementById('fileInput');
  const dropError     = document.getElementById('dropError');
  const dropErrorText = document.getElementById('dropErrorText');
  const loadedFileNameEl  = document.getElementById('loadedFileName');
  const skillCountHeader  = document.getElementById('skillCountHeader');
  const selectAllBtn      = document.getElementById('selectAllBtn');
  const deselectAllBtn    = document.getElementById('deselectAllBtn');
  const selectedCountEl   = document.getElementById('selectedCount');
  const skillsGrid        = document.getElementById('skillsGrid');
  const exportBtn         = document.getElementById('exportBtn');
  const resetBtn          = document.getElementById('resetBtn');
  const progressText      = document.getElementById('progressText');
  const progressBarFill   = document.getElementById('progressBarFill');
  const successBanner     = document.getElementById('successBanner');
  const successMessage    = document.getElementById('successMessage');
  const startOverBtn      = document.getElementById('startOverBtn');

  /* ── Views ── */
  function showView(next) {
    [viewDrop, viewLoading, viewSelection, viewExport].forEach(v => v.classList.remove('active'));
    next.classList.add('active');
  }

  /* ── Drop Zone ── */
  dropZone.addEventListener('click', () => fileInput.click());

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.add('dragover');
    dropZone.classList.remove('error-state');
  });
  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault(); e.stopPropagation();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) handleFileDrop(e.dataTransfer.files[0]);
  });
  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) handleFileDrop(fileInput.files[0]);
  });

  /* ── handleFileDrop ── */
  function handleFileDrop(file) {
    clearError();
    if (!file.name.toLowerCase().endsWith('.zip')) {
      showError('Only .zip files are accepted.');
      return;
    }
    loadedFileName = file.name;
    showView(viewLoading);
    parseZip(file);
  }

  function showError(msg) {
    dropZone.classList.add('error-state');
    dropErrorText.textContent = msg;
    dropError.style.display = 'flex';
  }
  function clearError() {
    dropZone.classList.remove('error-state');
    dropError.style.display = 'none';
    dropErrorText.textContent = '';
  }

  /* ── parseZip ── */
  async function parseZip(file) {
    try {
      const zip    = await JSZip.loadAsync(file);
      const skills = await findSkills(zip);
      if (skills.length === 0) {
        showView(viewDrop);
        showError('No skills found in this ZIP. Are you sure this is a skills repository?');
        return;
      }
      loadedSkills = skills;
      renderSkillCards(skills);
      loadedFileNameEl.textContent = loadedFileName;
      skillCountHeader.textContent = skills.length;
      showView(viewSelection);
      updateSelectionCount();
    } catch (err) {
      showView(viewDrop);
      showError('Failed to read ZIP file: ' + err.message);
    }
  }

  /* ── findSkills ── */
  async function findSkills(zip) {
    const entries      = Object.keys(zip.files);
    const skillMdPaths = entries.filter(p => {
      const parts = p.split('/');
      return parts[parts.length - 1] === 'SKILL.md' && !zip.files[p].dir;
    });

    const skillsMap = new Map();
    for (const skillMdPath of skillMdPaths) {
      const parts      = skillMdPath.split('/');
      parts.pop();
      const skillRoot  = parts.join('/') + '/';
      const folderName = parts[parts.length - 1] || 'skill';
      const memberFiles = entries.filter(p => p.startsWith(skillRoot) && !zip.files[p].dir);

      let skillName = folderName, description = '';
      try {
        const content = await zip.files[skillMdPath].async('string');
        const meta    = parseSkillMeta(content);
        if (meta.name)        skillName   = meta.name;
        if (meta.description) description = meta.description;
      } catch (_) {}

      let finalName = skillName, counter = 2;
      while (skillsMap.has(finalName)) finalName = skillName + '-' + counter++;

      skillsMap.set(finalName, { name: finalName, folderName, skillRoot,
                                  description, fileCount: memberFiles.length,
                                  memberFiles, zip });
    }
    return Array.from(skillsMap.values());
  }

  /* ── parseSkillMeta ── */
  function parseSkillMeta(content) {
    const result = { name: '', description: '' };
    const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
    let bodyStart = 0;

    if (fm) {
      try {
        const p = jsyaml.load(fm[1]);
        if (p && typeof p === 'object') {
          if (p.name)        result.name        = String(p.name);
          if (p.description) result.description = String(p.description);
        }
      } catch (_) {}
      bodyStart = fm[0].length;
    }

    // If frontmatter has no description, read the SKILL.md body
    if (!result.description) {
      result.description = extractBodySummary(content.slice(bodyStart));
    }

    return result;
  }

  /* ── extractBodySummary ── */
  function extractBodySummary(body) {
    const lines = body.split('\n');
    const chunks = [];
    let inCodeBlock = false;

    for (const line of lines) {
      const trimmed = line.trim();

      // Track fenced code blocks and skip them
      if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) continue;

      // Skip blank lines, horizontal rules, headings, HTML tags
      if (!trimmed) continue;
      if (/^#{1,6}\s/.test(trimmed)) continue;
      if (/^---+$|^\*\*\*+$|^___+$/.test(trimmed)) continue;
      if (/^<[^>]+>/.test(trimmed)) continue;

      // Strip common markdown inline syntax
      const clean = trimmed
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/^[-*+>]\s+/, '')
        .replace(/^\d+\.\s+/, '')
        .replace(/\|/g, ' ')
        .trim();

      if (clean.length < 15) continue; // skip very short fragments

      chunks.push(clean);
      if (chunks.join(' ').length >= 180) break;
    }

    const summary = chunks.join(' ').trim();
    return summary.length > 200 ? summary.slice(0, 197) + '\u2026' : summary;
  }

  /* ── renderSkillCards ── */
  function renderSkillCards(skills) {
    skillsGrid.innerHTML = '';
    skills.forEach((skill, idx) => {
      const card = document.createElement('div');
      card.className   = 'skill-card selected';
      card.dataset.idx = idx;
      card.style.animationDelay = (idx * 0.04) + 's';

      const desc = skill.description || 'No description available.';

      const cbId = 'cb-' + idx;
      card.innerHTML = `
        <div class="cb-wrap">
          <input type="checkbox" id="${cbId}" checked data-idx="${idx}">
          <label class="cb-face" for="${cbId}">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          </label>
        </div>
        <div class="card-body">
          <div class="card-top">
            <span class="skill-name" title="${esc(skill.name)}">${esc(skill.name)}</span>
            <span class="files-badge">${skill.fileCount} file${skill.fileCount !== 1 ? 's' : ''}</span>
          </div>
          <div class="skill-desc">${esc(desc)}</div>
        </div>`;

      const cb = card.querySelector('input[type="checkbox"]');
      card.addEventListener('click', (e) => {
        if (e.target.closest('.cb-wrap')) return;
        cb.checked = !cb.checked;
        card.classList.toggle('selected', cb.checked);
        updateSelectionCount();
      });
      cb.addEventListener('change', () => {
        card.classList.toggle('selected', cb.checked);
        updateSelectionCount();
      });
      skillsGrid.appendChild(card);
    });
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  /* ── Selection ── */
  function updateSelectionCount() {
    let count = 0;
    skillsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => { if (cb.checked) count++; });
    selectedCountEl.textContent = count;
    exportBtn.textContent = `Export ${count} Selected Skill${count !== 1 ? 's' : ''}`;
    exportBtn.disabled = count === 0;
  }

  selectAllBtn.addEventListener('click', () => {
    skillsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      cb.closest('.skill-card').classList.add('selected');
    });
    updateSelectionCount();
  });

  deselectAllBtn.addEventListener('click', () => {
    skillsGrid.querySelectorAll('input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
      cb.closest('.skill-card').classList.remove('selected');
    });
    updateSelectionCount();
  });

  /* ── Export ── */
  exportBtn.addEventListener('click', handleExport);

  async function handleExport() {
    const indices = Array.from(
      skillsGrid.querySelectorAll('input[type="checkbox"]:checked')
    ).map(cb => parseInt(cb.dataset.idx, 10));
    if (indices.length === 0) return;

    showView(viewExport);
    successBanner.classList.remove('visible');
    startOverBtn.style.display = 'none';
    progressBarFill.style.width = '0%';

    const total      = indices.length;
    let   exported   = 0;
    const parentZip  = new JSZip();
    const folderBase = loadedFileName.replace(/\.zip$/i, '') + '-skills';
    const folder     = parentZip.folder(folderBase);

    for (const idx of indices) {
      const skill = loadedSkills[idx];
      exported++;
      progressText.textContent = `Packaging skill ${exported} of ${total}…`;
      progressBarFill.style.width = ((exported / total) * 100) + '%';
      try {
        const blob     = await buildSkillZip(skill);
        const safeName = skill.folderName.replace(/[^a-zA-Z0-9_\-]/g, '-').toLowerCase();
        folder.file(safeName + '.zip', blob);
      } catch (err) {
        console.error('Failed to package skill:', skill.name, err);
      }
    }

    progressText.textContent = 'Creating download…';
    const parentBlob = await parentZip.generateAsync({ type: 'blob' });
    saveAs(parentBlob, folderBase + '.zip');

    progressText.textContent = 'Export complete!';
    progressBarFill.style.width = '100%';
    successMessage.textContent = `${exported} skill ZIP${exported !== 1 ? 's' : ''} packaged and downloaded.`;
    successBanner.classList.add('visible');
    startOverBtn.style.display = 'flex';
  }

  /* ── buildSkillZip ── */
  async function buildSkillZip(skill) {
    const z = new JSZip();
    for (const fp of skill.memberFiles) {
      const rel = fp.substring(skill.skillRoot.length);
      if (!rel) continue;
      z.file(rel, await skill.zip.files[fp].async('uint8array'));
    }
    return z.generateAsync({ type: 'blob' });
  }

  /* ── Reset ── */
  function resetTool() {
    loadedSkills = []; loadedFileName = '';
    skillsGrid.innerHTML = ''; fileInput.value = '';
    clearError();
    showView(viewDrop);
  }
  resetBtn.addEventListener('click', resetTool);
  startOverBtn.addEventListener('click', resetTool);

})();
