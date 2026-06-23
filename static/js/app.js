// Application State
const state = {
    currentView: 'dashboard',
    tickets: [],
    settings: {
        openai_model: 'gpt-4o-mini',
        has_api_key: false
    },
    charts: {
        category: null,
        priority: null,
        sentiment: null
    }
};

// Mock Tickets for Seeding
const MOCK_TICKETS = [
    {
        customer_name: "Sarah Jenkins",
        customer_email: "sarah.j@techcorp.io",
        subject: "CRITICAL: Production database down - Connection Timeout",
        description: "We are getting a ConnectionTimeoutError on our production instance since 10 minutes ago. The website is throwing 504 Gateway Timeout errors for all logged-in users. This is urgent, our services are completely down!"
    },
    {
        customer_name: "Marcus Aurelius",
        customer_email: "marcus.a@gmail.com",
        subject: "Charged twice for subscription invoice #INV-4921",
        description: "Hello, I checked my bank statement today and noticed that my credit card was charged $49.00 twice on June 18 for my monthly pro subscription. Please refund the duplicate charge ASAP."
    },
    {
        customer_name: "Elena Rostova",
        customer_email: "elena.r@cybersecurity.net",
        subject: "Request to reset account owner email",
        description: "Our admin security engineer has left the company. I need to transfer the owner role and update the account billing email from admin@cybersecurity.net to elena.r@cybersecurity.net. Please let me know what documents are needed to verify."
    },
    {
        customer_name: "David Miller",
        customer_email: "david@miller-consulting.org",
        subject: "Feature request: Microsoft Teams Integration",
        description: "It would be incredibly helpful if your platform could send real-time event logs and ticket alerts to a Microsoft Teams channel via webhook. Currently we only have Slack integration, but our company migrated entirely to Teams."
    },
    {
        customer_name: "Chloe Zhao",
        customer_email: "chloe.zhao@designstudio.co",
        subject: "New dashboard UI feedback - looks beautiful but a bit sluggish",
        description: "I wanted to congratulate the design team on the new dark-themed dashboard. The metrics visualization is gorgeous and very modern. However, I notice that the page loads about 2-3 seconds slower than the old dashboard version."
    },
    {
        customer_name: "Earn Money Team",
        customer_email: "spambot829@marketing-mail.xyz",
        subject: "!!! VIAGRA AND BITCOIN DEALS - CHEAPEST PRICE !!!",
        description: "WIN BIG CASH PRIZES! Invest in cryptocurrency today and guarantee a 200% return on investment within 24 hours. Click this link now to claim your free reward bonus and cheap pharmacy medications."
    },
    {
        customer_name: "Thomas Anderson",
        customer_email: "neo@matrix.org",
        subject: "Login page password reset link is broken",
        description: "I forgot my password and clicked on 'Forgot Password' on the login screen. I received the reset link in my email, but when I click it, it opens a page that says '404 - Page Not Found'. I cannot access my files."
    },
    {
        customer_name: "Amanda Watson",
        customer_email: "amanda@watson-billing.com",
        subject: "Thank you for the quick support yesterday!",
        description: "I just wanted to drop a quick note to say thank you to the billing support agent who helped resolve my invoice issue yesterday. She was extremely patient, friendly, and solved my problem in less than 5 minutes. Amazing service!"
    }
];

// Wait for DOM to load
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

// App Initialization
async function initApp() {
    setupEventListeners();
    await fetchSettings();
    await refreshData();
    showToast('info', 'System ready. Rule-based fallback active.');
}

// Fetch Settings
async function fetchSettings() {
    try {
        const response = await fetch('/api/settings');
        if (response.ok) {
            const data = await response.json();
            state.settings = data;
            updateSettingsUI();
        }
    } catch (err) {
        console.error('Error fetching settings:', err);
    }
}

// Update Settings UI components (sidebar connection dot, settings fields)
function updateSettingsUI() {
    const indicator = document.getElementById('openai-status-indicator');
    const text = document.getElementById('openai-status-text');
    const apiKeyInput = document.getElementById('settings-api-key');
    const modelSelect = document.getElementById('settings-model');

    if (state.settings.has_api_key) {
        indicator.classList.remove('offline');
        indicator.classList.add('online');
        text.textContent = 'OpenAI Connected';
        if (apiKeyInput) apiKeyInput.value = state.settings.openai_api_key_masked || 'sk-................';
    } else {
        indicator.classList.remove('online');
        indicator.classList.add('offline');
        text.textContent = 'OpenAI Local Fallback';
        if (apiKeyInput) apiKeyInput.value = '';
    }

    if (modelSelect) {
        modelSelect.value = state.settings.openai_model || 'gpt-4o-mini';
    }
}

// Setup all Event Listeners
function setupEventListeners() {
    // Navigation
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            const targetView = e.currentTarget.getAttribute('data-view');
            switchView(targetView);
        });
    });

    document.getElementById('header-new-ticket-btn').addEventListener('click', () => {
        switchView('new-ticket');
    });

    document.getElementById('view-all-tickets-link').addEventListener('click', () => {
        switchView('tickets');
    });

    // New Ticket Form Submit
    document.getElementById('new-ticket-form').addEventListener('submit', handleTicketSubmit);
    document.getElementById('form-clear-btn').addEventListener('click', () => {
        document.getElementById('new-ticket-form').reset();
    });

    // Settings Form Submit
    document.getElementById('settings-form').addEventListener('submit', handleSettingsSubmit);
    document.getElementById('clear-api-key-btn').addEventListener('click', handleClearApiKey);
    
    // Toggle Password Visibility
    document.getElementById('toggle-key-visibility').addEventListener('click', () => {
        const input = document.getElementById('settings-api-key');
        const icon = document.querySelector('#toggle-key-visibility i');
        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    });

    // Filters event listeners
    const searchFilter = document.getElementById('filter-search');
    let searchDebounce;
    searchFilter.addEventListener('input', () => {
        clearTimeout(searchDebounce);
        searchDebounce = setTimeout(() => {
            fetchAndRenderTicketsList();
        }, 300);
    });

    document.getElementById('filter-category').addEventListener('change', fetchAndRenderTicketsList);
    document.getElementById('filter-priority').addEventListener('change', fetchAndRenderTicketsList);
    document.getElementById('filter-status').addEventListener('change', fetchAndRenderTicketsList);
    document.getElementById('filter-reset-btn').addEventListener('click', resetFilters);

    // Seeding Buttons
    document.getElementById('quick-seed-btn').addEventListener('click', () => seedData(1));
    document.getElementById('seed-tickets-full-btn').addEventListener('click', () => seedData(8));
    document.getElementById('clear-database-btn').addEventListener('click', handleClearDatabase);

    // Modal Control
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('ticket-detail-modal').addEventListener('click', (e) => {
        if (e.target.id === 'ticket-detail-modal') closeModal();
    });
    
    document.getElementById('modal-save-changes-btn').addEventListener('click', handleModalSave);
    document.getElementById('modal-copy-response-btn').addEventListener('click', copySuggestedResponse);
}

// View Swapper
function switchView(viewName) {
    // Hide all views
    document.querySelectorAll('.content-view').forEach(view => {
        view.classList.remove('active-view');
    });

    // Show selected view
    const target = document.getElementById(`view-${viewName}`);
    if (target) {
        target.classList.add('active-view');
    }

    // Update active nav item
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.remove('active');
        if (item.getAttribute('data-view') === viewName) {
            item.classList.add('active');
        }
    });

    // Update Headers Text
    const title = document.getElementById('view-title');
    const subtitle = document.getElementById('view-subtitle');

    switch (viewName) {
        case 'dashboard':
            title.textContent = 'Dashboard Overview';
            subtitle.textContent = 'Real-time AI classification metrics and statistics';
            refreshData();
            break;
        case 'tickets':
            title.textContent = 'All Support Tickets';
            subtitle.textContent = 'Browse, filter, and inspect AI-classified tickets';
            fetchAndRenderTicketsList();
            break;
        case 'new-ticket':
            title.textContent = 'Submit Support Request';
            subtitle.textContent = 'Simulate and classify an incoming support email or form';
            break;
        case 'settings':
            title.textContent = 'Settings & Credentials';
            subtitle.textContent = 'Configure OpenAI API connection details and database actions';
            fetchSettings();
            break;
    }

    state.currentView = viewName;
}

// Show Toast Alert
function showToast(type, message) {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconClass = 'fa-circle-info';
    if (type === 'success') iconClass = 'fa-circle-check';
    if (type === 'error') iconClass = 'fa-triangle-exclamation';

    toast.innerHTML = `
        <i class="fa-solid ${iconClass}"></i>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// Refresh Dashboard Data
async function refreshData() {
    await fetchAnalytics();
    await fetchRecentUrgentTickets();
}

// Fetch and Render Analytics (Dashboard KPI + Charts)
async function fetchAnalytics() {
    try {
        const res = await fetch('/api/analytics');
        if (!res.ok) throw new Error('Analytics failed');
        const data = await res.json();

        // Update KPIs
        document.getElementById('metric-total').textContent = data.total || 0;
        document.getElementById('metric-open').textContent = data.by_status.open || 0;
        document.getElementById('metric-pending').textContent = data.by_status.pending || 0;
        document.getElementById('metric-resolved').textContent = data.by_status.resolved || 0;
        document.getElementById('metric-confidence').textContent = `${Math.round(data.avg_confidence * 100)}%`;

        // Render Charts
        renderCategoryChart(data.by_category);
        renderPriorityChart(data.by_priority);
        renderSentimentChart(data.by_sentiment);

    } catch (err) {
        console.error('Error fetching analytics:', err);
    }
}

// Chart.js Category rendering
function renderCategoryChart(categoryCounts) {
    const ctx = document.getElementById('chart-category').getContext('2d');
    
    // Destroy previous instance
    if (state.charts.category) state.charts.category.destroy();

    const labels = Object.keys(categoryCounts);
    const data = Object.values(categoryCounts);

    if (labels.length === 0) {
        labels.push("No Data");
        data.push(1);
    }

    state.charts.category = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: [
                    'rgba(168, 85, 247, 0.65)', // purple
                    'rgba(56, 189, 248, 0.65)',  // blue
                    'rgba(52, 211, 153, 0.65)',  // green
                    'rgba(251, 191, 36, 0.65)',  // yellow
                    'rgba(249, 115, 22, 0.65)',  // orange
                    'rgba(239, 68, 68, 0.65)'    // red
                ],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 11 } }
                }
            }
        }
    });
}

// Chart.js Priority rendering
function renderPriorityChart(priorityCounts) {
    const ctx = document.getElementById('chart-priority').getContext('2d');
    if (state.charts.priority) state.charts.priority.destroy();

    const priorities = ['low', 'medium', 'high', 'urgent'];
    const counts = priorities.map(p => priorityCounts[p] || 0);

    state.charts.priority = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['Low', 'Medium', 'High', 'Urgent'],
            datasets: [{
                label: 'Tickets',
                data: counts,
                backgroundColor: [
                    'rgba(156, 163, 175, 0.6)',
                    'rgba(251, 191, 36, 0.6)',
                    'rgba(249, 115, 22, 0.6)',
                    'rgba(239, 68, 68, 0.6)'
                ],
                borderColor: [
                    '#9ca3af', '#fbbf24', '#f97316', '#ef4444'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { color: '#9ca3af', stepSize: 1 },
                    grid: { color: 'rgba(255, 255, 255, 0.05)' }
                },
                x: {
                    ticks: { color: '#9ca3af' },
                    grid: { display: false }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

// Chart.js Sentiment rendering
function renderSentimentChart(sentimentCounts) {
    const ctx = document.getElementById('chart-sentiment').getContext('2d');
    if (state.charts.sentiment) state.charts.sentiment.destroy();

    const sentiments = ['positive', 'neutral', 'negative'];
    const counts = sentiments.map(s => sentimentCounts[s] || 0);

    state.charts.sentiment = new Chart(ctx, {
        type: 'pie',
        data: {
            labels: ['Positive', 'Neutral', 'Negative'],
            datasets: [{
                data: counts,
                backgroundColor: [
                    'rgba(52, 211, 153, 0.6)', // green
                    'rgba(156, 163, 175, 0.6)', // neutral
                    'rgba(239, 68, 68, 0.6)'    // red
                ],
                borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'right',
                    labels: { color: '#9ca3af', font: { family: 'Plus Jakarta Sans', size: 11 } }
                }
            }
        }
    });
}

// Fetch and render recent critical tickets
async function fetchRecentUrgentTickets() {
    try {
        const res = await fetch('/api/tickets');
        if (!res.ok) throw new Error('Failed fetching tickets');
        const tickets = await res.json();
        
        // Filter urgent/high tickets
        const urgentTickets = tickets.filter(t => t.priority === 'urgent' || t.priority === 'high').slice(0, 5);
        const tbody = document.getElementById('recent-tickets-tbody');
        tbody.innerHTML = '';

        if (urgentTickets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="table-empty">No urgent or high priority tickets logged.</td></tr>`;
            return;
        }

        urgentTickets.forEach(ticket => {
            const tr = document.createElement('tr');
            
            // Format Date
            const dateStr = formatDate(ticket.created_at);

            tr.innerHTML = `
                <td><strong>${escapeHtml(ticket.subject)}</strong></td>
                <td><span class="badge-cat">${escapeHtml(ticket.category)}</span></td>
                <td><span class="badge badge-${ticket.priority}">${ticket.priority}</span></td>
                <td><span class="badge badge-sentiment-${ticket.sentiment}">${ticket.sentiment}</span></td>
                <td>${dateStr}</td>
                <td><button class="btn btn-secondary btn-small btn-inspect-ticket" data-id="${ticket.id}">Inspect</button></td>
            `;
            tbody.appendChild(tr);
        });

        // Add action listeners
        tbody.querySelectorAll('.btn-inspect-ticket').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ticketId = e.currentTarget.getAttribute('data-id');
                openTicketDetail(ticketId);
            });
        });

    } catch (err) {
        console.error('Error loading recent tickets:', err);
    }
}

// Fetch and render the entire tickets list view with filters
async function fetchAndRenderTicketsList() {
    const search = document.getElementById('filter-search').value;
    const category = document.getElementById('filter-category').value;
    const priority = document.getElementById('filter-priority').value;
    const status = document.getElementById('filter-status').value;

    const tbody = document.getElementById('tickets-list-tbody');
    tbody.innerHTML = `<tr><td colspan="9" class="table-empty"><i class="fa-solid fa-spinner fa-spin"></i> Filtering records...</td></tr>`;

    try {
        let url = '/api/tickets?';
        const params = [];
        if (search) params.push(`search=${encodeURIComponent(search)}`);
        if (category) params.push(`category=${encodeURIComponent(category)}`);
        if (priority) params.push(`priority=${encodeURIComponent(priority)}`);
        if (status) params.push(`status=${encodeURIComponent(status)}`);
        url += params.join('&');

        const res = await fetch(url);
        if (!res.ok) throw new Error('Search failed');
        const tickets = await res.json();
        
        tbody.innerHTML = '';
        if (tickets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="table-empty">No tickets match your filters.</td></tr>`;
            return;
        }

        tickets.forEach(ticket => {
            const tr = document.createElement('tr');
            const dateStr = formatDate(ticket.created_at);

            tr.innerHTML = `
                <td><span class="modal-ticket-id">#${ticket.id}</span></td>
                <td>
                    <div style="font-weight:600">${escapeHtml(ticket.customer_name)}</div>
                    <div style="font-size:12px; color:var(--text-muted)">${escapeHtml(ticket.customer_email)}</div>
                </td>
                <td><strong>${escapeHtml(ticket.subject)}</strong></td>
                <td><span class="badge-cat">${escapeHtml(ticket.category)}</span></td>
                <td><span class="badge badge-${ticket.priority}">${ticket.priority}</span></td>
                <td><span class="badge badge-sentiment-${ticket.sentiment}">${ticket.sentiment}</span></td>
                <td><span class="badge badge-${ticket.status}">${ticket.status}</span></td>
                <td>${dateStr}</td>
                <td>
                    <button class="btn btn-secondary btn-small btn-inspect-ticket" data-id="${ticket.id}">
                        <i class="fa-solid fa-magnifying-glass"></i> View
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

        tbody.querySelectorAll('.btn-inspect-ticket').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const ticketId = e.currentTarget.getAttribute('data-id');
                openTicketDetail(ticketId);
            });
        });

    } catch (err) {
        console.error('Error rendering ticket logs:', err);
        tbody.innerHTML = `<tr><td colspan="9" class="table-empty text-danger">Failed to fetch ticket list from backend.</td></tr>`;
    }
}

// Reset filter UI and trigger fetch
function resetFilters() {
    document.getElementById('filter-search').value = '';
    document.getElementById('filter-category').value = '';
    document.getElementById('filter-priority').value = '';
    document.getElementById('filter-status').value = '';
    fetchAndRenderTicketsList();
}

// Ticket Form Submission Handler
async function handleTicketSubmit(e) {
    e.preventDefault();

    const submitBtn = document.getElementById('form-submit-btn');
    const textSpan = submitBtn.querySelector('.btn-text');
    const spinnerSpan = submitBtn.querySelector('.btn-spinner');

    textSpan.classList.add('hidden');
    spinnerSpan.classList.remove('hidden');
    submitBtn.disabled = true;

    const payload = {
        customer_name: document.getElementById('ticket-name').value,
        customer_email: document.getElementById('ticket-email').value,
        subject: document.getElementById('ticket-subject').value,
        description: document.getElementById('ticket-description').value
    };

    try {
        const response = await fetch('/api/tickets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const ticket = await response.json();
            showToast('success', `Ticket #${ticket.id} classified as ${ticket.category}!`);
            document.getElementById('new-ticket-form').reset();
            switchView('tickets');
        } else {
            const err = await response.json();
            showToast('error', `Submission error: ${err.detail || 'Server error'}`);
        }
    } catch (error) {
        showToast('error', 'Network failure connecting to classifier backend.');
    } finally {
        textSpan.classList.remove('hidden');
        spinnerSpan.classList.add('hidden');
        submitBtn.disabled = false;
    }
}

// Settings Form Submission Handler
async function handleSettingsSubmit(e) {
    e.preventDefault();
    const apiKey = document.getElementById('settings-api-key').value;
    const model = document.getElementById('settings-model').value;

    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                openai_api_key: apiKey,
                openai_model: model
            })
        });

        if (response.ok) {
            showToast('success', 'OpenAI credentials saved successfully!');
            await fetchSettings();
        } else {
            showToast('error', 'Error updating configuration properties.');
        }
    } catch (err) {
        showToast('error', 'Failed saving credentials.');
    }
}

// Clear API Key Action
async function handleClearApiKey() {
    try {
        const response = await fetch('/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                openai_api_key: "",
                openai_model: "gpt-4o-mini"
            })
        });

        if (response.ok) {
            showToast('info', 'API Key deleted. Reset to rules-based classifier.');
            await fetchSettings();
        }
    } catch (err) {
        showToast('error', 'Error deleting API key configuration.');
    }
}

// Clear Database Action
async function handleClearDatabase() {
    if (!confirm('Are you sure you want to reset the SQLite database? All support ticket logs will be permanently deleted.')) return;

    try {
        // Fetch all ticket IDs and delete them
        const res = await fetch('/api/tickets');
        const tickets = await res.json();
        
        for (const t of tickets) {
            await fetch(`/api/tickets/${t.id}`, { method: 'DELETE' });
        }
        
        showToast('success', 'SQLite database logs purged successfully.');
        if (state.currentView === 'dashboard') {
            refreshData();
        } else if (state.currentView === 'tickets') {
            fetchAndRenderTicketsList();
        }
    } catch (err) {
        showToast('error', 'Error resetting database.');
    }
}

// Seed Database Tool
async function seedData(count) {
    const listToSeed = count === 1 
        ? [MOCK_TICKETS[Math.floor(Math.random() * MOCK_TICKETS.length)]] 
        : MOCK_TICKETS;

    showToast('info', `Seeding ${listToSeed.length} sample ticket logs...`);

    try {
        for (const ticket of listToSeed) {
            await fetch('/api/tickets', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(ticket)
            });
        }
        showToast('success', 'Seeding completed successfully!');
        if (state.currentView === 'dashboard') {
            refreshData();
        } else if (state.currentView === 'tickets') {
            fetchAndRenderTicketsList();
        }
    } catch (error) {
        showToast('error', 'Seeding failure.');
    }
}

// Ticket Detailed Modal Inspection
let activeInspectedId = null;

async function openTicketDetail(ticketId) {
    try {
        const response = await fetch(`/api/tickets/${ticketId}`);
        if (!response.ok) throw new Error('Ticket not found');
        const ticket = await response.json();
        activeInspectedId = ticketId;

        // Populate Modal Fields
        document.getElementById('modal-ticket-id').textContent = `#TICKET-${ticket.id}`;
        document.getElementById('modal-ticket-subject').textContent = ticket.subject;
        document.getElementById('modal-ticket-description').textContent = ticket.description;
        
        // Sender info
        document.getElementById('modal-customer-name').textContent = ticket.customer_name;
        document.getElementById('modal-customer-email').textContent = ticket.customer_email;
        
        // Avatar abbreviation
        const initials = ticket.customer_name
            ? ticket.customer_name.split(' ').map(n => n[0]).join('').substring(0,2).toUpperCase()
            : 'S';
        document.getElementById('modal-customer-avatar').textContent = initials;

        // Inputs for updating
        document.getElementById('modal-update-status').value = ticket.status;
        document.getElementById('modal-update-category').value = ticket.category;
        document.getElementById('modal-update-priority').value = ticket.priority;

        // AI Info panel
        const confPercent = Math.round(ticket.confidence_score * 100);
        document.getElementById('modal-confidence-bar').style.width = `${confPercent}%`;
        document.getElementById('modal-confidence-score').textContent = `${confPercent}%`;
        
        const sentiment = document.getElementById('modal-sentiment-badge');
        sentiment.className = `badge badge-sentiment-${ticket.sentiment}`;
        sentiment.textContent = ticket.sentiment;

        document.getElementById('modal-ai-justification').textContent = ticket.ai_justification;

        // Render Tags
        const tagsContainer = document.getElementById('modal-tags-container');
        tagsContainer.innerHTML = '';
        if (ticket.tags && ticket.tags.length > 0) {
            ticket.tags.forEach(tag => {
                const chip = document.createElement('span');
                chip.className = 'tag-chip';
                chip.textContent = tag;
                tagsContainer.appendChild(chip);
            });
        } else {
            tagsContainer.innerHTML = '<span class="tag-chip">no tags generated</span>';
        }

        // Suggested response
        const respTextarea = document.getElementById('modal-suggested-response');
        respTextarea.value = ticket.suggested_response || 'No AI auto-reply draft generated.';
        
        // Reset copy button styling
        const copyBtn = document.getElementById('modal-copy-response-btn');
        copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';

        // Unhide Modal
        document.getElementById('ticket-detail-modal').classList.remove('hidden');

    } catch (err) {
        showToast('error', 'Error loading ticket details.');
        console.error(err);
    }
}

function closeModal() {
    document.getElementById('ticket-detail-modal').classList.add('hidden');
    activeInspectedId = null;
}

// Modify Ticket Properties from Modal
async function handleModalSave() {
    if (!activeInspectedId) return;

    const payload = {
        status: document.getElementById('modal-update-status').value,
        category: document.getElementById('modal-update-category').value,
        priority: document.getElementById('modal-update-priority').value
    };

    try {
        const response = await fetch(`/api/tickets/${activeInspectedId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            showToast('success', 'Ticket parameters modified successfully.');
            closeModal();
            
            // Refresh visual view
            if (state.currentView === 'dashboard') {
                refreshData();
            } else if (state.currentView === 'tickets') {
                fetchAndRenderTicketsList();
            }
        } else {
            showToast('error', 'Error saving adjustments.');
        }
    } catch (err) {
        showToast('error', 'Network failure applying changes.');
    }
}

// Copy suggested response to clipboard
function copySuggestedResponse() {
    const text = document.getElementById('modal-suggested-response').value;
    if (!text || text === 'No AI auto-reply draft generated.') return;

    navigator.clipboard.writeText(text).then(() => {
        const copyBtn = document.getElementById('modal-copy-response-btn');
        copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copied!';
        showToast('info', 'AI draft response copied to clipboard.');
        setTimeout(() => {
            copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copy';
        }, 3000);
    }).catch(err => {
        showToast('error', 'Copy failed.');
    });
}

// Date formatter utility
function formatDate(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (e) {
        return isoString;
    }
}

// Simple HTML escaping utility to prevent XSS
function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
