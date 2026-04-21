(function () {
  const toastStack = document.getElementById('toastStack');
  const body = document.body;
  const page = body.dataset.page || 'unknown';
  const themeToggleButtons = Array.from(document.querySelectorAll('#themeToggle'));

  const adminState = {
    currentLogType: 'ACCESS_OK',
    logCache: {
      ACCESS_OK: [],
      ACCESS_FAIL: [],
      LOGOUT: [],
    },
    serverOffset: 0,
    currentUser: null,
    currentSessions: [],
    currentUsers: [],
  };

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[character]));
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function showToast(title, message, type = 'success', timeout = 3400) {
    if (!toastStack) {
      return;
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <strong>${escapeHtml(title)}</strong>
      <div class="mini">${escapeHtml(message)}</div>
    `;
    toastStack.appendChild(toast);
    window.setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(-8px)';
      window.setTimeout(() => toast.remove(), 220);
    }, timeout);
  }

  function setButtonLoading(button, loading, label = 'Cargando...') {
    if (!button) return;
    if (loading) {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span><span>${escapeHtml(label)}</span>`;
    } else {
      button.disabled = false;
      button.innerHTML = button.dataset.originalText || button.textContent;
    }
  }

  function getTheme() {
    return localStorage.getItem('securevault-theme') || 'dark';
  }

  function applyTheme(theme) {
    body.dataset.theme = theme;
    localStorage.setItem('securevault-theme', theme);
  }

  function toggleTheme() {
    const next = getTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    showToast('Tema actualizado', `Modo ${next === 'dark' ? 'oscuro' : 'claro'} activado`, 'success');
  }

  function initTheme() {
    applyTheme(getTheme());
    themeToggleButtons.forEach((button) => {
      button.addEventListener('click', toggleTheme);
    });
  }

  function formatDateTime(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  }

  function formatDate(value) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: '2-digit' });
  }

  function formatDuration(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
    const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  function truncate(value, length = 18) {
    const text = String(value ?? '');
    if (text.length <= length) return text;
    return `${text.slice(0, length)}…`;
  }

  function flagForIp(ip) {
    const firstPart = Number.parseInt(String(ip || '').split('.')[0], 10);
    if (Number.isNaN(firstPart)) return '🛰️';
    if (firstPart < 64) return '🇺🇸';
    if (firstPart < 128) return '🇪🇺';
    if (firstPart < 192) return '🇯🇵';
    if (firstPart < 224) return '🇧🇷';
    return '🛰️';
  }

  function playClickSound() {
    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = 660;
      gain.gain.value = 0.02;
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
      oscillator.onended = () => context.close();
    } catch (error) {
      console.warn('Sound playback failed:', error.message);
    }
  }

  function initAuthEffects() {
    const particleField = byId('particleField');
    const matrixRain = byId('matrixRain');

    if (particleField) {
      const count = 24;
      for (let index = 0; index < count; index += 1) {
        const particle = document.createElement('span');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${12 + Math.random() * 18}s`;
        particle.style.animationDelay = `${Math.random() * 10}s`;
        particle.style.opacity = `${0.2 + Math.random() * 0.55}`;
        particle.style.transform = `scale(${0.8 + Math.random() * 1.4})`;
        particleField.appendChild(particle);
      }
    }

    if (matrixRain) {
      const columns = 16;
      const symbols = '01 secure vault access audit session admin user token cookie'.split(' ');
      for (let index = 0; index < columns; index += 1) {
        const column = document.createElement('div');
        column.className = 'matrix-column';
        column.style.left = `${(100 / columns) * index}%`;
        column.style.animationDuration = `${10 + Math.random() * 14}s`;
        column.style.animationDelay = `${Math.random() * 12}s`;
        column.textContent = Array.from({ length: 44 }, () => symbols[Math.floor(Math.random() * symbols.length)]).join(' ');
        matrixRain.appendChild(column);
      }
    }
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, {
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
      ...options,
    });

    let payload = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    } else {
      payload = { message: await response.text() };
    }

    if (!response.ok) {
      const error = new Error(payload.message || 'Solicitud fallida.');
      error.payload = payload;
      error.status = response.status;
      throw error;
    }

    return payload;
  }

  function setFieldStatus(inputId, state) {
    const indicator = document.querySelector(`[data-status-for="${inputId}"]`);
    if (!indicator) return;
    if (state === 'good') {
      indicator.textContent = '✓';
      indicator.className = 'field-status check-ok';
    } else if (state === 'bad') {
      indicator.textContent = '✕';
      indicator.className = 'field-status check-bad';
    } else {
      indicator.textContent = '';
      indicator.className = 'field-status';
    }
  }

  function calculatePasswordStrength(password) {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password)) score += 1;
    if (/[0-9]/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }

  function updatePasswordStrength(password) {
    const fill = byId('strengthFill');
    const label = byId('strengthLabel');
    if (!fill || !label) return;

    const score = calculatePasswordStrength(password);
    const pct = Math.min(100, (score / 4) * 100);
    fill.style.width = `${pct}%`;

    if (score <= 1) {
      fill.style.background = 'var(--danger)';
      label.textContent = 'Fuerza de contraseña: muy débil';
    } else if (score === 2) {
      fill.style.background = 'var(--warning)';
      label.textContent = 'Fuerza de contraseña: media';
    } else {
      fill.style.background = 'var(--success)';
      label.textContent = 'Fuerza de contraseña: fuerte';
    }
  }

  function updateRegisterValidation() {
    const username = byId('username');
    const email = byId('email');
    const password = byId('password');
    const confirmPassword = byId('confirmPassword');

    if (username) {
      const valid = /^[a-zA-Z0-9_]{3,30}$/.test(username.value.trim());
      setFieldStatus('username', username.value ? (valid ? 'good' : 'bad') : 'idle');
    }

    if (email) {
      const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim());
      setFieldStatus('email', email.value ? (valid ? 'good' : 'bad') : 'idle');
    }

    if (password) {
      const valid = /^(?=.*[A-Z])(?=.*\d).{8,}$/.test(password.value);
      setFieldStatus('password', password.value ? (valid ? 'good' : 'bad') : 'idle');
      updatePasswordStrength(password.value);
    }

    if (confirmPassword && password) {
      const valid = confirmPassword.value.length > 0 && confirmPassword.value === password.value;
      setFieldStatus('confirmPassword', confirmPassword.value ? (valid ? 'good' : 'bad') : 'idle');
    }
  }

  function setLoginSessionPanel(sessionData) {
    const panel = byId('sessionInfo');
    if (!panel) return;

    const masked = sessionData.sessionId ? `${sessionData.sessionId.slice(0, 8)}••••${sessionData.sessionId.slice(-4)}` : 'pending';
    panel.innerHTML = `
      <div class="badge success">Sesión creada</div>
      <div style="margin-top:10px;">Tu session ID: <strong class="session-id">${escapeHtml(masked)}</strong></div>
      <div class="muted" style="margin-top:8px;">Redirigiendo al panel seguro...</div>
    `;
    panel.classList.remove('hidden');
  }

  async function loadLoginSessionPanel() {
    const panel = byId('sessionInfo');
    if (!panel) return;
    try {
      const data = await fetchJson('/api/session/status');
      setLoginSessionPanel(data);
    } catch (error) {
      console.warn('Session panel unavailable:', error.message);
    }
  }

  function initLoginPage() {
    initAuthEffects();
    const form = byId('loginForm');
    const button = byId('loginButton');
    const authCard = byId('authCard');
    const soundToggle = byId('soundToggle');
    const savedSound = localStorage.getItem('securevault-login-sound') === 'true';

    if (soundToggle) {
      soundToggle.checked = savedSound;
      soundToggle.addEventListener('change', () => {
        localStorage.setItem('securevault-login-sound', String(soundToggle.checked));
      });
    }

    if (form) {
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(form);
        const payload = new URLSearchParams();
        payload.set('email', String(formData.get('email') || '').trim());
        payload.set('password', String(formData.get('password') || ''));

        try {
          setButtonLoading(button, true, 'Verificando...');
          const response = await fetch('/login', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: payload.toString(),
          });

          const data = await response.json();
          if (!response.ok || !data.success) {
            throw new Error(data.message || 'No se pudo iniciar sesión.');
          }

          if (soundToggle?.checked) {
            playClickSound();
          }

          showToast('Acceso concedido', 'Autenticación correcta. Cargando tu sesión...', 'success');
          setLoginSessionPanel({ sessionId: null });
          await loadLoginSessionPanel();
          window.setTimeout(() => {
            window.location.href = data.redirect;
          }, 650);
        } catch (error) {
          showToast('Error de acceso', error.message, 'error');
          authCard?.classList.remove('shake');
          void authCard?.offsetWidth;
          authCard?.classList.add('shake');
        } finally {
          setButtonLoading(button, false);
        }
      });
    }
  }

  function initRegisterPage() {
    initAuthEffects();
    const form = byId('registerForm');
    const button = byId('registerButton');
    const fields = ['username', 'email', 'password', 'confirmPassword'];

    fields.forEach((fieldId) => {
      const input = byId(fieldId);
      input?.addEventListener('input', updateRegisterValidation);
      input?.addEventListener('blur', updateRegisterValidation);
    });

    form?.addEventListener('submit', async (event) => {
      event.preventDefault();
      updateRegisterValidation();

      const payload = {
        username: String(byId('username')?.value || '').trim(),
        email: String(byId('email')?.value || '').trim(),
        password: String(byId('password')?.value || ''),
        confirmPassword: String(byId('confirmPassword')?.value || ''),
      };

      try {
        setButtonLoading(button, true, 'Creando cuenta...');
        const response = await fetch('/register', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json();
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'No se pudo crear la cuenta.');
        }

        showToast('Cuenta creada', 'Ya puedes iniciar sesión con tus credenciales.', 'success');
        window.setTimeout(() => {
          window.location.href = data.redirect || '/';
        }, 700);
      } catch (error) {
        showToast('Registro fallido', error.message, 'error');
      } finally {
        setButtonLoading(button, false);
      }
    });

    updateRegisterValidation();
  }

  function initSidebarTabs() {
    const navLinks = Array.from(document.querySelectorAll('[data-tab]'));
    const panels = {
      dashboard: byId('panel-dashboard'),
      users: byId('panel-users'),
      logs: byId('panel-logs'),
      sessions: byId('panel-sessions'),
    };

    function activateTab(tabName) {
      navLinks.forEach((link) => link.classList.toggle('active', link.dataset.tab === tabName));
      Object.entries(panels).forEach(([name, panel]) => {
        if (!panel) return;
        panel.classList.toggle('hidden', name !== tabName);
      });
    }

    navLinks.forEach((link) => {
      link.addEventListener('click', (event) => {
        event.preventDefault();
        activateTab(link.dataset.tab);
        if (link.dataset.tab === 'logs') {
          loadActiveLogs();
        }
      });
    });

    return activateTab;
  }

  function setCounterValue(element, targetValue) {
    if (!element) return;
    const target = Number(targetValue) || 0;
    const duration = 720;
    const start = performance.now();
    const startValue = 0;

    function animate(now) {
      const progress = Math.min(1, (now - start) / duration);
      const value = Math.floor(startValue + (target - startValue) * progress);
      element.textContent = String(value);
      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
  }

  function renderTimeline(items) {
    const container = byId('recentActivity');
    if (!container) return;
    if (!items || items.length === 0) {
      container.innerHTML = '<div data-empty>No hay actividad reciente.</div>';
      return;
    }

    container.innerHTML = items.map((entry) => {
      const badgeClass = entry.log_type === 'ACCESS_OK' ? 'success' : entry.log_type === 'ACCESS_FAIL' ? 'danger' : 'gray';
      return `
        <article class="timeline-item">
          <div class="badge ${badgeClass}">${escapeHtml(entry.log_type)}</div>
          <strong>${escapeHtml(entry.username || 'unknown')}</strong>
          <div class="muted">${escapeHtml(entry.details || 'Sin detalles')} · ${escapeHtml(formatDateTime(entry.created_at))}</div>
        </article>
      `;
    }).join('');
  }

  function getLogFilters() {
    return {
      from: byId('logFrom')?.value || '',
      to: byId('logTo')?.value || '',
      search: byId('logSearch')?.value || '',
    };
  }

  function buildLogUrl(type, page = 1, limit = 50) {
    const filters = getLogFilters();
    const params = new URLSearchParams({ type, page: String(page), limit: String(limit) });
    if (filters.from) params.set('from', filters.from);
    if (filters.to) params.set('to', filters.to);
    if (filters.search) params.set('search', filters.search);
    return `/api/admin/logs?${params.toString()}`;
  }

  async function loadLogsForType(type) {
    const response = await fetchJson(buildLogUrl(type, 1, 50));
    adminState.logCache[type] = response.data || [];
    if (adminState.currentLogType === type) {
      renderLogs(response.data || []);
    }
    return response.data || [];
  }

  function renderLogs(rows) {
    const tbody = byId('logsTableBody');
    if (!tbody) return;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" data-empty>No hay registros para este filtro.</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map((row) => {
      const highlighted = String(row.details || '').includes('SUSPICIOUS') || String(row.details || '').includes('suspicious');
      const badgeClass = row.log_type === 'ACCESS_OK' ? 'success' : row.log_type === 'ACCESS_FAIL' ? 'danger' : 'gray';
      const rowClass = highlighted ? ' style="background: linear-gradient(90deg, rgba(245,158,11,0.18), transparent);"' : '';
      return `
        <tr${rowClass}>
          <td>${escapeHtml(row.id)}</td>
          <td>${escapeHtml(row.username || '-')}</td>
          <td>${escapeHtml(row.ip_address || '-')}</td>
          <td>${escapeHtml(row.user_agent || '-')}</td>
          <td>${escapeHtml(truncate(row.session_id || '-', 20))}</td>
          <td><span class="badge ${badgeClass}">${escapeHtml(formatDateTime(row.created_at))}</span></td>
          <td>${escapeHtml(row.details || '-')}</td>
        </tr>
      `;
    }).join('');
  }

  async function loadActiveLogs() {
    const tab = adminState.currentLogType;
    try {
      const rows = await loadLogsForType(tab);
      renderLogs(rows);
    } catch (error) {
      showToast('Logs', error.message, 'error');
    }
  }

  function initLogTabs() {
    const buttons = Array.from(document.querySelectorAll('[data-log-tab]'));
    buttons.forEach((button) => {
      button.addEventListener('click', async () => {
        buttons.forEach((item) => item.classList.toggle('active', item === button));
        adminState.currentLogType = button.dataset.logTab;
        await loadActiveLogs();
      });
    });

    ['logFrom', 'logTo', 'logSearch'].forEach((id) => {
      const input = byId(id);
      input?.addEventListener('change', () => loadActiveLogs());
      input?.addEventListener('input', () => {
        if (id === 'logSearch') {
          window.clearTimeout(input._timer);
          input._timer = window.setTimeout(() => loadActiveLogs(), 250);
        }
      });
    });

    byId('refreshLogs')?.addEventListener('click', () => loadActiveLogs());

    byId('exportLogs')?.addEventListener('click', () => {
      const rows = adminState.logCache[adminState.currentLogType] || [];
      if (!rows.length) {
        showToast('Exportación vacía', 'No hay registros para exportar.', 'warning');
        return;
      }
      const header = ['ID', 'Username', 'IP', 'Browser/UA', 'Session ID', 'Timestamp', 'Details'];
      const csvRows = rows.map((row) => [
        row.id,
        row.username || '',
        row.ip_address || '',
        row.user_agent || '',
        row.session_id || '',
        row.created_at || '',
        row.details || '',
      ]);
      const csv = [header, ...csvRows]
        .map((line) => line.map((entry) => `"${String(entry).replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `securevault-${adminState.currentLogType.toLowerCase()}-logs.csv`;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  function renderUsers(users) {
    const container = byId('usersList');
    if (!container) return;
    if (!users.length) {
      container.innerHTML = '<div data-empty>No hay usuarios registrados.</div>';
      return;
    }

    container.innerHTML = users.map((user) => `
      <article class="user-row ${user.is_active ? '' : 'deactivated'}">
        <div>
          <strong>${escapeHtml(user.username)}</strong>
          <div class="small">${escapeHtml(user.email)}</div>
        </div>
        <div><span class="badge ${user.role === 'admin' ? 'warning' : 'neutral'}">${escapeHtml(user.role)}</span></div>
        <div><span class="badge ${user.is_active ? 'success' : 'danger'}">${user.is_active ? 'Active' : 'Inactive'}</span></div>
        <div class="small">${escapeHtml(formatDate(user.created_at))}</div>
        <div><button class="btn small ${user.is_active ? 'secondary' : ''}" data-toggle-user="${escapeHtml(user.id)}">${user.is_active ? 'Deactivate' : 'Activate'}</button></div>
      </article>
    `).join('');

    container.querySelectorAll('[data-toggle-user]').forEach((button) => {
      button.addEventListener('click', async () => {
        const userId = button.dataset.toggleUser;
        try {
          setButtonLoading(button, true, 'Updating...');
          await fetchJson(`/api/admin/users/${userId}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ toggle: true }),
          });
          await loadAdminUsers();
          showToast('Usuario actualizado', 'El estado de la cuenta cambió correctamente.', 'success');
        } catch (error) {
          showToast('Error', error.message, 'error');
        } finally {
          setButtonLoading(button, false);
        }
      });
    });
  }

  async function loadAdminUsers() {
    const response = await fetchJson('/api/admin/users');
    adminState.currentUsers = response.users || [];
    renderUsers(adminState.currentUsers);
  }

  function renderSessions(sessions) {
    const tbody = byId('sessionsTableBody');
    if (!tbody) return;
    if (!sessions.length) {
      tbody.innerHTML = '<tr><td colspan="8" data-empty>No hay sesiones activas.</td></tr>';
      return;
    }

    const highlightSid = new URLSearchParams(window.location.search).get('sid');
    tbody.innerHTML = sessions.map((sessionEntry) => {
      const highlighted = highlightSid && highlightSid === sessionEntry.sid;
      const statusBadge = sessionEntry.suspiciousActivity ? '<span class="badge orange">⚠️ Suspicious</span>' : '<span class="badge success">Healthy</span>';
      return `
        <tr${highlighted ? ' style="background: linear-gradient(90deg, rgba(56,189,248,0.18), transparent);"' : ''}>
          <td>${escapeHtml(truncate(sessionEntry.sid, 24))}</td>
          <td>${escapeHtml(sessionEntry.username || '-')}</td>
          <td><span class="badge ${sessionEntry.role === 'admin' ? 'warning' : 'neutral'}">${escapeHtml(sessionEntry.role || '-')}</span></td>
          <td>${escapeHtml(sessionEntry.loginIp || '-')}</td>
          <td>${escapeHtml(truncate(sessionEntry.userAgent || '-', 28))}</td>
          <td>${escapeHtml(formatDateTime(sessionEntry.expire))}</td>
          <td>${statusBadge}</td>
          <td><button class="btn danger small" data-invalidate-session="${escapeHtml(sessionEntry.sid)}">Invalidate Session</button></td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('[data-invalidate-session]').forEach((button) => {
      button.addEventListener('click', async () => {
        try {
          setButtonLoading(button, true, 'Invalidating...');
          await fetchJson(`/api/admin/sessions/${encodeURIComponent(button.dataset.invalidateSession)}`, {
            method: 'DELETE',
          });
          showToast('Sesión invalidada', 'La sesión fue eliminada del almacén PostgreSQL.', 'success');
          await loadAdminSessions();
        } catch (error) {
          showToast('Error', error.message, 'error');
        } finally {
          setButtonLoading(button, false);
        }
      });
    });
  }

  async function loadAdminSessions() {
    const response = await fetchJson('/api/admin/sessions');
    adminState.currentSessions = response.sessions || [];
    renderSessions(adminState.currentSessions);
  }

  function updateClock(serverTime) {
    const clock = byId('liveClock');
    if (!clock) return;
    if (serverTime) {
      adminState.serverOffset = Date.parse(serverTime) - Date.now();
    }
    const now = new Date(Date.now() + adminState.serverOffset);
    clock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function initAdminClock() {
    updateClock();
    window.setInterval(() => updateClock(), 1000);
  }

  async function initAdminPage() {
    initSidebarTabs();
    initLogTabs();
    initAdminClock();

    byId('logoutButton')?.addEventListener('click', () => {
      window.location.href = '/logout';
    });

    try {
      const [sessionStatus, adminData] = await Promise.all([
        fetchJson('/api/session/status'),
        fetchJson('/api/admin/data'),
      ]);

      adminState.currentUser = sessionStatus;
      byId('adminName').textContent = sessionStatus.username || 'admin';
      byId('adminAvatar').textContent = String(sessionStatus.username || 'A').slice(0, 1).toUpperCase();
      updateClock(adminData.serverTime || sessionStatus.serverTime);

      Object.entries(adminData.stats || {}).forEach(([key, value]) => {
        setCounterValue(document.querySelector(`[data-counter="${key}"]`), value);
      });

      renderTimeline(adminData.recentLogs || []);
      adminState.logCache.ACCESS_OK = [];
      adminState.logCache.ACCESS_FAIL = [];
      adminState.logCache.LOGOUT = [];

      await Promise.all([
        loadLogsForType('ACCESS_OK'),
        loadAdminUsers(),
        loadAdminSessions(),
      ]);
    } catch (error) {
      showToast('Panel admin', error.message, 'error');
    }
  }

  function initUserTimer(loginTime) {
    const timer = byId('sessionTimer');
    if (!timer || !loginTime) return;
    const start = Date.parse(loginTime);
    window.setInterval(() => {
      timer.textContent = formatDuration(Date.now() - start);
    }, 1000);
    timer.textContent = formatDuration(Date.now() - start);
  }

  async function initUserPage() {
    byId('logoutButton')?.addEventListener('click', () => {
      window.location.href = '/logout';
    });

    byId('copySessionId')?.addEventListener('click', async () => {
      const text = byId('sessionIdValue')?.textContent || '';
      try {
        await navigator.clipboard.writeText(text);
        showToast('Copiado', 'Session ID copiado al portapapeles.', 'success');
      } catch (error) {
        showToast('Error', 'No se pudo copiar el Session ID.', 'error');
      }
    });

    try {
      const [sessionStatus, activityData] = await Promise.all([
        fetchJson('/api/session/status'),
        fetchJson('/api/user/activity'),
      ]);

      byId('welcomeTitle').textContent = `Hello, ${sessionStatus.username}!`;
      byId('sessionIdValue').textContent = sessionStatus.sessionId;
      byId('roleBadge').textContent = sessionStatus.role;
      byId('loginTimeValue').textContent = formatDateTime(sessionStatus.loginTime);
      byId('loginIpValue').textContent = sessionStatus.loginIp || '-';
      byId('userAgentValue').textContent = sessionStatus.userAgent || '-';
      byId('ipFlag').textContent = flagForIp(sessionStatus.loginIp);
      initUserTimer(sessionStatus.loginTime);

      if (sessionStatus.suspiciousActivity) {
        const banner = byId('suspiciousBanner');
        banner.textContent = 'Anomalía detectada: IP y navegador diferentes. Esta sesión fue marcada como sospechosa.';
        banner.classList.remove('hidden');
      }

      const activityList = byId('activityList');
      const activity = activityData.activity || [];
      if (!activity.length) {
        activityList.innerHTML = '<div data-empty>No hay actividad reciente para esta cuenta.</div>';
      } else {
        activityList.innerHTML = activity.map((entry) => `
          <article class="activity-card">
            <div class="title">${escapeHtml(entry.log_type)}</div>
            <div>${escapeHtml(entry.details || 'Sin detalles')}</div>
            <div class="time">${escapeHtml(formatDateTime(entry.created_at))} · ${escapeHtml(entry.ip_address || '-')}</div>
          </article>
        `).join('');
      }
    } catch (error) {
      showToast('Usuario', error.message, 'error');
    }
  }

  function initCommonButtons() {
    const logoutButton = byId('logoutButton');
    if (logoutButton) {
      logoutButton.addEventListener('click', () => {
        window.location.href = '/logout';
      });
    }
  }

  initTheme();
  initCommonButtons();

  if (page === 'login') {
    initLoginPage();
  } else if (page === 'register') {
    initRegisterPage();
  } else if (page === 'admin') {
    initAdminPage();
  } else if (page === 'user') {
    initUserPage();
  }
})();
