// ========================================================================
// UTILS — funções auxiliares globais
// ========================================================================

function fillCredentials(email, password) {
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');
    if (emailInput && passInput) {
        emailInput.value = email;
        passInput.value = password;
    }
}

function showAlert(message, type = 'danger') {
    const alertBox = document.getElementById('alert-box');
    if (!alertBox) return;
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
}

function showBanner(message, type = 'danger') {
    const banner = document.getElementById('alert-banner');
    if (!banner) return;
    banner.textContent = message;
    banner.className = `alert alert-${type}`;
    banner.classList.remove('d-none');
    setTimeout(() => {
        banner.classList.add('d-none');
    }, 6000);
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
}

function formatDateTime(isoStr) {
    if (!isoStr) return '-';
    try {
        const dt = new Date(isoStr);
        return dt.toLocaleString('pt-BR', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch (e) {
        return isoStr;
    }
}

function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function authHeader() {
    const token = localStorage.getItem('sse_token');
    return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// ========================================================================
// LOGIN
// ========================================================================

const loginForm = document.getElementById('login-form');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const btn = document.getElementById('btn-login');

        try {
            btn.disabled = true;
            btn.textContent = 'Autenticando...';

            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (!response.ok) {
                const message = data.message || 'Falha ao autenticar. Tente novamente.';
                showAlert(message, 'danger');
                return;
            }

            localStorage.setItem('sse_token', data.token);
            localStorage.setItem('sse_user', JSON.stringify(data.user));

            showAlert('Autenticado com sucesso! Redirecionando...', 'success');
            setTimeout(() => {
                window.location.href = '/dashboard.html';
            }, 500);

        } catch (err) {
            showAlert('Não foi possível conectar ao servidor. Verifique sua conexão.', 'danger');
        } finally {
            btn.disabled = false;
            btn.textContent = 'Entrar no Sistema';
        }
    });
}

// ========================================================================
// DASHBOARD — inicialização e RBAC
// ========================================================================

function initDashboard() {
    const token = localStorage.getItem('sse_token');
    const rawUser = localStorage.getItem('sse_user');

    if (!token || !rawUser) {
        window.location.href = '/index.html';
        return;
    }

    try {
        const user = JSON.parse(rawUser);
        const userDisplay = document.getElementById('user-display');
        const roleBadge = document.getElementById('role-badge');
        const welcomeTitle = document.getElementById('welcome-title');
        const roleDesc = document.getElementById('role-description');

        const roleLabels = {
            COORDENADOR: 'Coordenador',
            SUPERVISOR: 'Supervisor',
            RESPONSAVEL: 'Responsável',
            ALUNO: 'Aluno'
        };

        const displayRole = user.roleDescription || roleLabels[user.role] || user.role;

        if (userDisplay) userDisplay.textContent = user.name;
        if (roleBadge) roleBadge.textContent = displayRole;
        if (welcomeTitle) welcomeTitle.textContent = `Olá, ${user.name}`;

        const roleDescriptions = {
            COORDENADOR: 'Perfil: Coordenador - Acesso completo à gestão escolar, matrículas e controle de acessos.',
            SUPERVISOR: 'Perfil: Supervisor - Monitoramento de entradas/saídas e operação de autorizações.',
            RESPONSAVEL: 'Perfil: Responsável Familiar - Acompanhamento das informações dos alunos vinculados.',
            ALUNO: 'Perfil: Aluno - Consulta básica de histórico e comunicados escolares.'
        };

        if (roleDesc && roleDescriptions[user.role]) {
            roleDesc.textContent = roleDescriptions[user.role];
        }

        if (user.role === 'COORDENADOR' || user.role === 'SUPERVISOR') {
            showSection('admin-students-section');
            showSection('admin-pickups-section');
            showSection('admin-early-exits-section');
            loadStudents();
            populateStudentSelects();
            loadEarlyExits();
        } else if (user.role === 'RESPONSAVEL') {
            showSection('guardian-students-section');
            loadGuardianStudents();
        }

    } catch (e) {
        logout();
    }
}

function showSection(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove('d-none');
}

// ========================================================================
// ALUNOS — Fase 2 (mantido integralmente)
// ========================================================================

let searchTimer;
function debounceSearch() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { loadStudents(); }, 300);
}

async function loadStudents() {
    const token = localStorage.getItem('sse_token');
    const name = document.getElementById('filter-name')?.value || '';
    const className = document.getElementById('filter-class')?.value || '';
    const active = document.getElementById('filter-active')?.value || '';

    const params = new URLSearchParams();
    if (name.trim()) params.append('name', name.trim());
    if (className.trim()) params.append('className', className.trim());
    if (active !== '') params.append('active', active);

    const tbody = document.getElementById('students-table-body');
    if (!tbody) return;

    try {
        const response = await fetch(`/api/admin/students?${params.toString()}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:var(--danger)">Erro ao carregar alunos (HTTP ${response.status}).</td></tr>`;
            return;
        }

        const students = await response.json();
        if (students.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center">Nenhum aluno encontrado para os filtros informados.</td></tr>';
            return;
        }

        tbody.innerHTML = students.map(s => {
            const statusBadge = s.active
                ? '<span class="badge badge-active">Ativo</span>'
                : '<span class="badge badge-inactive">Inativo</span>';

            const toggleBtn = s.active
                ? `<button class="btn-action-status btn-deactivate" onclick="toggleStudentStatus(${s.id}, false)">Desativar</button>`
                : `<button class="btn-action-status btn-activate" onclick="toggleStudentStatus(${s.id}, true)">Ativar</button>`;

            const guardiansHtml = (s.guardians && s.guardians.length > 0)
                ? s.guardians.map(g => `
                    <span class="guardian-tag">
                        ${escapeHtml(g.guardianName)} (${escapeHtml(g.relationship)})
                        <span class="guardian-tag-remove" title="Desvincular" onclick="unlinkGuardian(${s.id}, ${g.guardianUserId})">&times;</span>
                    </span>
                  `).join('')
                : '<span style="color:var(--text-muted); font-size:0.75rem;">Nenhum vinculado</span>';

            return `
                <tr>
                    <td><strong>#${s.id}</strong></td>
                    <td><strong>${escapeHtml(s.fullName)}</strong></td>
                    <td>${escapeHtml(s.className)}</td>
                    <td>${formatDate(s.birthDate)}</td>
                    <td>${escapeHtml(s.contactPhone)}</td>
                    <td><code>${escapeHtml(s.badgeCode)}</code></td>
                    <td>${statusBadge}</td>
                    <td>
                        ${guardiansHtml}
                        <br>
                        <button class="btn btn-outline btn-sm" style="margin-top:0.35rem; font-size:0.7rem;" onclick="openLinkModal(${s.id}, '${escapeHtml(s.fullName)}')">+ Vincular</button>
                    </td>
                    <td>${toggleBtn}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="9" class="text-center" style="color:var(--danger)">Erro na conexão com o servidor.</td></tr>`;
    }
}

function toggleStudentForm() {
    const card = document.getElementById('student-form-card');
    if (!card) return;
    card.classList.toggle('d-none');
    if (!card.classList.contains('d-none')) {
        document.getElementById('student-form').reset();
        document.getElementById('student-id').value = '';
        document.getElementById('student-name').focus();
    }
}

async function saveStudent(event) {
    event.preventDefault();
    const token = localStorage.getItem('sse_token');

    const payload = {
        fullName: document.getElementById('student-name').value.trim(),
        birthDate: document.getElementById('student-birth').value,
        className: document.getElementById('student-class').value.trim(),
        contactPhone: document.getElementById('student-phone').value.trim(),
        badgeCode: document.getElementById('student-badge').value.trim(),
        active: document.getElementById('student-active').value === 'true'
    };

    try {
        const response = await fetch('/api/admin/students', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao salvar aluno.', 'danger');
            return;
        }

        showBanner(`Aluno "${data.fullName}" cadastrado com sucesso!`, 'success');
        toggleStudentForm();
        loadStudents();
        populateStudentSelects();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

async function toggleStudentStatus(studentId, newStatus) {
    const token = localStorage.getItem('sse_token');
    const actionName = newStatus ? 'ativar' : 'desativar';

    if (!confirm(`Deseja realmente ${actionName} o cadastro deste aluno?`)) return;

    try {
        const response = await fetch(`/api/admin/students/${studentId}/status`, {
            method: 'PATCH',
            headers: authHeader(),
            body: JSON.stringify({ active: newStatus })
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao alterar situação do cadastro.', 'danger');
            return;
        }

        showBanner(`Cadastro de "${data.fullName}" atualizado para ${newStatus ? 'Ativo' : 'Inativo'}.`, 'success');
        loadStudents();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

function openLinkModal(studentId, studentName) {
    document.getElementById('modal-student-id').value = studentId;
    document.getElementById('modal-student-name').textContent = `Aluno: ${studentName}`;
    document.getElementById('modal-guardian-id').value = '';
    document.getElementById('modal-relationship').value = '';
    document.getElementById('modal-link-guardian').classList.remove('d-none');
}

function closeModal() {
    document.getElementById('modal-link-guardian').classList.add('d-none');
}

async function submitLinkGuardian(event) {
    event.preventDefault();
    const studentId = document.getElementById('modal-student-id').value;
    const guardianUserId = Number(document.getElementById('modal-guardian-id').value);
    const relationship = document.getElementById('modal-relationship').value.trim();

    try {
        const response = await fetch(`/api/admin/students/${studentId}/guardians`, {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify({ guardianUserId, relationship })
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao vincular responsável.', 'danger');
            return;
        }

        showBanner('Responsável vinculado com sucesso ao aluno!', 'success');
        closeModal();
        loadStudents();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

async function unlinkGuardian(studentId, guardianUserId) {
    if (!confirm('Deseja realmente desvincular este responsável do aluno?')) return;

    try {
        const response = await fetch(`/api/admin/students/${studentId}/guardians/${guardianUserId}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${localStorage.getItem('sse_token')}` }
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao desvincular responsável.', 'danger');
            return;
        }

        showBanner('Vínculo removido com sucesso.', 'success');
        loadStudents();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

// ========================================================================
// RESPONSÁVEL — dependentes (RF009)
// ========================================================================

async function loadGuardianStudents() {
    const token = localStorage.getItem('sse_token');
    const grid = document.getElementById('guardian-students-grid');
    if (!grid) return;

    try {
        const response = await fetch('/api/guardian/students', {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            grid.innerHTML = `<p style="color:var(--danger)">Erro ao carregar dependentes (HTTP ${response.status}).</p>`;
            return;
        }

        const students = await response.json();
        if (students.length === 0) {
            grid.innerHTML = '<p>Nenhum aluno vinculado à sua conta familiar. Entre em contato com a coordenação escolar.</p>';
            return;
        }

        grid.innerHTML = students.map(s => `
            <div class="student-card">
                <h3>${escapeHtml(s.fullName)}</h3>
                <div class="student-card-meta">
                    Turma: <strong>${escapeHtml(s.className)}</strong> | Nascimento: ${formatDate(s.birthDate)}
                </div>
                <div>
                    Situação Escolar: ${s.active
                        ? '<span class="badge badge-active">Ativo</span>'
                        : '<span class="badge badge-inactive">Inativo</span>'}
                </div>
                <div style="margin-top:0.75rem;">
                    <button class="btn btn-outline btn-sm" onclick="loadGuardianStudentPickups(${s.id}, '${escapeHtml(s.fullName)}')">
                        🔒 Ver Pessoas Autorizadas
                    </button>
                </div>
                <div id="guardian-pickups-${s.id}" class="d-none" style="margin-top:0.75rem;"></div>
            </div>
        `).join('');

    } catch (err) {
        grid.innerHTML = '<p style="color:var(--danger)">Erro ao conectar ao servidor.</p>';
    }
}

async function loadGuardianStudentPickups(studentId, studentName) {
    const token = localStorage.getItem('sse_token');
    const container = document.getElementById(`guardian-pickups-${studentId}`);
    if (!container) return;

    if (!container.classList.contains('d-none')) {
        container.classList.add('d-none');
        return;
    }

    container.classList.remove('d-none');
    container.innerHTML = '<p style="font-size:0.8rem; color:var(--text-muted)">Carregando autorizações...</p>';

    try {
        const response = await fetch(`/api/guardian/students/${studentId}/pickups`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });

        if (!response.ok) {
            const data = await response.json();
            container.innerHTML = `<p style="color:var(--danger);font-size:0.8rem">${escapeHtml(data.message || 'Erro ao carregar autorizações.')}</p>`;
            return;
        }

        const pickups = await response.json();
        if (pickups.length === 0) {
            container.innerHTML = '<p style="font-size:0.8rem;color:var(--text-muted)">Nenhuma pessoa autorizada cadastrada para este aluno.</p>';
            return;
        }

        container.innerHTML = `
            <p style="font-size:0.75rem;font-weight:600;color:var(--text-muted);margin-bottom:0.4rem;">Pessoas autorizadas a retirar ${escapeHtml(studentName)}:</p>
            ${pickups.map(p => `
                <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;font-size:0.82rem;">
                    ${pickupStatusBadge(p.status)}
                    <span><strong>${escapeHtml(p.fullName)}</strong> (${escapeHtml(p.relationship)})</span>
                </div>
            `).join('')}
        `;

    } catch (err) {
        container.innerHTML = '<p style="color:var(--danger);font-size:0.8rem">Erro ao conectar ao servidor.</p>';
    }
}

// ========================================================================
// AUTORIZAÇÕES DE RETIRADA — Fase 3 (RF005 / RS002 / RF007)
// ========================================================================

// Popula todos os selects de aluno no dashboard
async function populateStudentSelects() {
    const token = localStorage.getItem('sse_token');
    try {
        const res = await fetch('/api/admin/students?active=true', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) return;
        const students = await res.json();

        const selects = [
            'pickup-student-select',
            'pickup-filter-student',
            'exit-student-select',
            'exit-filter-student'
        ];

        selects.forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            const hasAll = id === 'exit-filter-student';
            el.innerHTML = hasAll
                ? '<option value="">Todas as Saídas</option>'
                : `<option value="">Selecione o aluno...</option>`;
            students.forEach(s => {
                const opt = document.createElement('option');
                opt.value = s.id;
                opt.textContent = `${s.fullName} — ${s.className}`;
                el.appendChild(opt);
            });
        });

    } catch (err) {
        console.warn('Erro ao popular selects de alunos:', err);
    }
}

function togglePickupForm() {
    const card = document.getElementById('pickup-form-card');
    if (!card) return;
    card.classList.toggle('d-none');
    if (!card.classList.contains('d-none')) {
        document.getElementById('pickup-form').reset();
    }
}

async function savePickup(event) {
    event.preventDefault();
    const studentId = document.getElementById('pickup-student-select').value;
    if (!studentId) {
        showBanner('Selecione o aluno antes de salvar.', 'danger');
        return;
    }

    const payload = {
        studentId: Number(studentId),
        fullName: document.getElementById('pickup-fullname').value.trim(),
        relationship: document.getElementById('pickup-relationship').value.trim(),
        contactPhone: document.getElementById('pickup-phone').value.trim(),
        documentNumber: document.getElementById('pickup-document').value.trim() || null,
        validUntil: document.getElementById('pickup-valid-until').value
    };

    try {
        const response = await fetch('/api/admin/authorizations/pickups', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao salvar autorização.', 'danger');
            return;
        }

        showBanner(`Autorização para "${data.fullName}" cadastrada com sucesso!`, 'success');
        togglePickupForm();
        // Recarrega a tabela se o aluno selecionado no filtro for o mesmo
        const filterStudent = document.getElementById('pickup-filter-student')?.value;
        if (filterStudent && Number(filterStudent) === Number(studentId)) {
            loadPickupsForSelectedStudent();
        }

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

async function loadPickupsForSelectedStudent() {
    const studentId = document.getElementById('pickup-filter-student')?.value;
    const tbody = document.getElementById('pickups-table-body');
    const auditPanel = document.getElementById('audit-panel');
    if (!tbody) return;

    if (!studentId) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Selecione um aluno acima para visualizar suas autorizações.</td></tr>';
        if (auditPanel) auditPanel.classList.add('d-none');
        return;
    }

    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando autorizações...</td></tr>';

    try {
        const response = await fetch(`/api/admin/authorizations/students/${studentId}/pickups`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('sse_token')}` }
        });

        if (!response.ok) {
            const data = await response.json();
            tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">${escapeHtml(data.message || 'Erro ao carregar.')}</td></tr>`;
            return;
        }

        const pickups = await response.json();
        if (pickups.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Nenhuma pessoa autorizada cadastrada para este aluno.</td></tr>';
            return;
        }

        tbody.innerHTML = pickups.map(p => {
            const badge = pickupStatusBadge(p.status);
            const revokeBtn = p.status !== 'REVOGADA'
                ? `<button class="btn-action-status btn-deactivate" onclick="openPickupStatusModal(${p.id}, 'REVOGADA', '${escapeHtml(p.fullName)}')">Revogar</button>`
                : '';
            const validateBtn = p.status !== 'VALIDA'
                ? `<button class="btn-action-status btn-activate" onclick="openPickupStatusModal(${p.id}, 'VALIDA', '${escapeHtml(p.fullName)}')">Revalidar</button>`
                : '';

            return `
                <tr>
                    <td><strong>${escapeHtml(p.fullName)}</strong></td>
                    <td>${escapeHtml(p.relationship)}</td>
                    <td>${escapeHtml(p.contactPhone)}</td>
                    <td>${escapeHtml(p.documentNumber || '-')}</td>
                    <td>${badge}</td>
                    <td>${p.validUntil ? formatDate(p.validUntil) : '-'}</td>
                    <td>${revokeBtn} ${validateBtn}</td>
                </tr>
            `;
        }).join('');

        // Exibe trilha de auditoria automaticamente ao selecionar aluno
        loadAuditLog(studentId);

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">Erro na conexão com o servidor.</td></tr>`;
    }
}

function pickupStatusBadge(status) {
    const labels = { VALIDA: 'VÁLIDA', REVOGADA: 'REVOGADA', VENCIDA: 'VENCIDA' };
    const classes = { VALIDA: 'badge-active', REVOGADA: 'badge-inactive', VENCIDA: 'badge-warning' };
    const label = labels[status] || status;
    const cls = classes[status] || '';
    return `<span class="badge ${cls}">${label}</span>`;
}

// Modal de alteração de status da autorização
function openPickupStatusModal(pickupId, newStatus, pickupName) {
    document.getElementById('modal-pickup-id').value = pickupId;
    document.getElementById('modal-new-status').value = newStatus;
    document.getElementById('modal-status-reason').value = '';

    const actionLabel = newStatus === 'REVOGADA' ? 'Revogar' : 'Revalidar';
    const colorClass = newStatus === 'REVOGADA' ? 'style="color:var(--danger)"' : '';
    document.getElementById('modal-status-title').innerHTML = `${actionLabel} Autorização`;
    document.getElementById('modal-status-desc').innerHTML =
        `Você está prestes a <strong ${colorClass}>${actionLabel.toLowerCase()}</strong> a autorização de <strong>${escapeHtml(pickupName)}</strong>. Informe o motivo.`;

    document.getElementById('modal-pickup-status').classList.remove('d-none');
}

function closePickupStatusModal() {
    document.getElementById('modal-pickup-status').classList.add('d-none');
}

async function submitPickupStatusChange(event) {
    event.preventDefault();
    const pickupId = document.getElementById('modal-pickup-id').value;
    const status = document.getElementById('modal-new-status').value;
    const reason = document.getElementById('modal-status-reason').value.trim();

    try {
        const response = await fetch(`/api/admin/authorizations/pickups/${pickupId}/status`, {
            method: 'PATCH',
            headers: authHeader(),
            body: JSON.stringify({ status, reason })
        });

        const data = await response.json();
        if (!response.ok) {
            showBanner(data.message || 'Erro ao alterar status da autorização.', 'danger');
            return;
        }

        showBanner(`Situação da autorização atualizada para ${data.status === 'VALIDA' ? 'VÁLIDA' : data.status} com sucesso.`, 'success');
        closePickupStatusModal();
        loadPickupsForSelectedStudent();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

// ========================================================================
// TRILHA DE AUDITORIA — Fase 3 (RF007 / RS004)
// ========================================================================

async function loadAuditLog(studentId) {
    const panel = document.getElementById('audit-panel');
    const tbody = document.getElementById('audit-table-body');
    if (!panel || !tbody) return;

    panel.classList.remove('d-none');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center">Carregando trilha de auditoria...</td></tr>';

    try {
        const response = await fetch(`/api/admin/authorizations/students/${studentId}/audit`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('sse_token')}` }
        });

        if (!response.ok) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--danger)">Erro ao carregar trilha de auditoria.</td></tr>';
            return;
        }

        const logs = await response.json();
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--text-muted)">Nenhum registro de auditoria para este aluno.</td></tr>';
            return;
        }

        tbody.innerHTML = logs.map(log => {
            const prevStatus = log.previousStatus ? pickupStatusBadge(log.previousStatus) : '<span style="color:var(--text-muted)">—</span>';
            const newStatus = log.newStatus ? pickupStatusBadge(log.newStatus) : '<span style="color:var(--text-muted)">—</span>';
            return `
                <tr>
                    <td style="white-space:nowrap">${formatDateTime(log.createdAt)}</td>
                    <td><code>${escapeHtml(log.action)}</code></td>
                    <td>${prevStatus}</td>
                    <td>${newStatus}</td>
                    <td>${escapeHtml(log.notes || '-')}</td>
                    <td>${escapeHtml(log.operatorName || '-')}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center" style="color:var(--danger)">Erro na conexão com o servidor.</td></tr>';
    }
}

function closeAuditPanel() {
    const panel = document.getElementById('audit-panel');
    if (panel) panel.classList.add('d-none');
}

// ========================================================================
// SAÍDAS ANTECIPADAS — Fase 3 (RF006 / RS002)
// ========================================================================

function toggleEarlyExitForm() {
    const card = document.getElementById('early-exit-form-card');
    if (!card) return;
    card.classList.toggle('d-none');
    if (!card.classList.contains('d-none')) {
        document.getElementById('early-exit-form').reset();
        const pickupSelect = document.getElementById('exit-pickup-select');
        if (pickupSelect) {
            pickupSelect.innerHTML = '<option value="">Selecione o aluno primeiro...</option>';
            pickupSelect.disabled = true;
        }
    }
}

// Carrega as autorizações VÁLIDAS do aluno selecionado no formulário de saída
async function loadPickupsForEarlyExit() {
    const studentId = document.getElementById('exit-student-select')?.value;
    const pickupSelect = document.getElementById('exit-pickup-select');
    if (!pickupSelect) return;

    if (!studentId) {
        pickupSelect.innerHTML = '<option value="">Selecione o aluno primeiro...</option>';
        pickupSelect.disabled = true;
        return;
    }

    pickupSelect.disabled = true;
    pickupSelect.innerHTML = '<option value="">Carregando...</option>';

    try {
        const response = await fetch(`/api/admin/authorizations/students/${studentId}/pickups`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('sse_token')}` }
        });

        if (!response.ok) {
            pickupSelect.innerHTML = '<option value="">Erro ao carregar autorizações.</option>';
            return;
        }

        const allPickups = await response.json();
        // Filtra apenas VÁLIDAS (RS002 — mas o backend também valida)
        const validPickups = allPickups.filter(p => p.status === 'VALIDA');

        if (validPickups.length === 0) {
            pickupSelect.innerHTML = '<option value="">Nenhuma autorização VÁLIDA cadastrada para este aluno.</option>';
            return;
        }

        pickupSelect.innerHTML = '<option value="">Selecione a pessoa autorizada...</option>';
        validPickups.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.id;
            opt.textContent = `${p.fullName} (${p.relationship}) — VÁLIDA até ${formatDate(p.validUntil)}`;
            pickupSelect.appendChild(opt);
        });

        pickupSelect.disabled = false;

    } catch (err) {
        pickupSelect.innerHTML = '<option value="">Erro ao conectar ao servidor.</option>';
    }
}

async function saveEarlyExit(event) {
    event.preventDefault();
    const studentId = document.getElementById('exit-student-select').value;
    const authorizedPickupId = document.getElementById('exit-pickup-select').value;
    const reason = document.getElementById('exit-reason').value.trim();

    if (!studentId || !authorizedPickupId) {
        showBanner('Selecione o aluno e a pessoa autorizada antes de confirmar.', 'danger');
        return;
    }

    const payload = {
        studentId: Number(studentId),
        authorizedPickupId: Number(authorizedPickupId),
        reason
    };

    try {
        const response = await fetch('/api/admin/authorizations/early-exits', {
            method: 'POST',
            headers: authHeader(),
            body: JSON.stringify(payload)
        });

        const data = await response.json();
        if (!response.ok) {
            // Exibe mensagem de bloqueio RS002 com destaque
            showBanner(data.message || 'Saída antecipada não autorizada.', 'danger');
            return;
        }

        showBanner(`Saída antecipada de "${data.studentName}" registrada com sucesso.`, 'success');
        toggleEarlyExitForm();
        loadEarlyExits();

    } catch (err) {
        showBanner('Erro na comunicação com o servidor.', 'danger');
    }
}

async function loadEarlyExits() {
    const tbody = document.getElementById('early-exits-table-body');
    if (!tbody) return;

    const studentId = document.getElementById('exit-filter-student')?.value || '';
    const params = studentId ? `?studentId=${studentId}` : '';

    tbody.innerHTML = '<tr><td colspan="7" class="text-center">Carregando saídas antecipadas...</td></tr>';

    try {
        const response = await fetch(`/api/admin/authorizations/early-exits${params}`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem('sse_token')}` }
        });

        if (!response.ok) {
            tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">Erro ao carregar saídas (HTTP ${response.status}).</td></tr>`;
            return;
        }

        const exits = await response.json();
        if (exits.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center" style="color:var(--text-muted)">Nenhuma saída antecipada registrada.</td></tr>';
            return;
        }

        tbody.innerHTML = exits.map(e => `
            <tr>
                <td style="white-space:nowrap">${formatDateTime(e.exitTime)}</td>
                <td><strong>${escapeHtml(e.studentName)}</strong></td>
                <td>${escapeHtml(e.studentClassName)}</td>
                <td><strong>${escapeHtml(e.pickupPersonName)}</strong></td>
                <td>${escapeHtml(e.pickupPersonRelationship)}</td>
                <td>${escapeHtml(e.reason)}</td>
                <td>${escapeHtml(e.authorizedByName)}</td>
            </tr>
        `).join('');

    } catch (err) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center" style="color:var(--danger)">Erro na conexão com o servidor.</td></tr>`;
    }
}

// ========================================================================
// RBAC TEST — testes das rotas protegidas
// ========================================================================

async function testAccess(url) {
    const token = localStorage.getItem('sse_token');
    const outputBox = document.getElementById('test-result');
    const outputContent = document.getElementById('test-output-content');

    if (!outputBox || !outputContent) return;

    outputBox.classList.remove('d-none');
    outputContent.textContent = 'Testando requisição...';

    try {
        const response = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await response.json();
        outputContent.textContent = `HTTP ${response.status} ${response.statusText}\n` + JSON.stringify(data, null, 2);
    } catch (err) {
        outputContent.textContent = 'Erro ao realizar a requisição: ' + err.message;
    }
}

// ========================================================================
// AUTH — logout
// ========================================================================

function logout() {
    localStorage.removeItem('sse_token');
    localStorage.removeItem('sse_user');
    window.location.href = '/index.html';
}
